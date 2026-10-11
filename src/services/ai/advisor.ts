import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { OrgContext } from "@/features/auth/dal";
import type { AdvisorCardDTO, AdvisorChatRequest, AdvisorReplyDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { AI_BETAS, AI_MODEL, aiError, claudeClient } from "./claude";
import { ADVISOR_FUTURE_CAPABILITIES, ADVISOR_TOOL_DEFINITIONS, ADVISOR_TOOLS, runAdvisorTool, type AdvisorToolContext } from "./advisor-tools";

const log = createLogger("AI_ADVISOR");

/**
 * Conseiller e-commerce IA : conversation (écrite ou dictée) liée à l'utilisateur authentifié.
 *
 * Un tour = 1 question → boucle d'outils Claude (lecture / préparation, voir advisor-tools.ts) →
 * réponse diffusée au fil de l'eau (événements NDJSON) → message et cartes enregistrés.
 * Coûts maîtrisés : historique limité (12 derniers messages, 12 000 caractères), au plus 6 étapes
 * d'outils, réponse ≤ 2 500 jetons, invite système et outils mis en cache, un seul modèle par question.
 */

export const ADVISOR_LIMITS = { historyMessages: 12, historyChars: 12_000, maxSteps: 6, maxTokens: 2500, deadlineMs: 100_000 } as const;

/** Partie STABLE de l'invite (mise en cache avec les outils) : aucune donnée variable ici. */
export const ADVISOR_SYSTEM_STABLE = [
  "Tu es le conseiller e-commerce personnel de l'utilisateur dans MON STOCK (gestion de stock et de ventes d'un revendeur d'appareils électroniques, principalement sur eBay). Tu es son employé : tu analyses SES données, tu recommandes, tu prépares des actions.",
  "",
  "Méthode :",
  "- Avant toute réponse chiffrée ou factuelle sur l'activité, appelle les outils. Choisis les plus ciblés ; appelle-les en parallèle si utile ; n'en appelle pas d'inutiles.",
  "- Périodes : utilise le paramètre period des outils (« cette semaine » = this_week, « ce mois-ci » = this_month…). Sans précision : 30 derniers jours, et dis-le.",
  "- Distingue toujours : chiffre d'affaires (CA), marge brute (CA − coût d'achat connu), frais de vente, bénéfice estimé. Rappelle les données manquantes signalées par les outils (coûts d'achat, frais, port payé, retours).",
  "- Recommandations : 1 à 3 actions concrètes, chacune justifiée par un chiffre issu d'un outil.",
  "",
  "Règles absolues :",
  "- Chaque chiffre (montant, quantité, date, pourcentage) doit venir d'un résultat d'outil de cette conversation. N'invente, n'extrapole ni ne complète jamais une donnée absente : dis qu'elle manque.",
  "- Si eBay n'est pas connecté ou jamais synchronisé, ou si une donnée est vide, dis-le clairement et ne prétends pas avoir consulté le compte.",
  "- Actions : tu peux seulement PRÉPARER (outils prepare_*). Une action préparée n'est faite que lorsque l'utilisateur touche « Confirmer » dans l'application ; un « oui » écrit ou oral ne suffit pas et ne vaut jamais pour d'autres actions. Ne dis jamais qu'une action est faite si une note de l'application ne l'a pas confirmé.",
  `- Non disponible (ne le simule pas, propose le faire manuellement) : ${ADVISOR_FUTURE_CAPABILITIES.join(" ; ")}.`,
  "- Les cartes de résultats s'affichent automatiquement sous ta réponse : ne recopie pas les tableaux, commente l'essentiel.",
  "- Les messages « [Note de l'application] » sont écrits par MON STOCK (pas par l'utilisateur) : ils indiquent le résultat réel d'une action.",
  "",
  "Style : français, naturel et direct, comme un collaborateur. Commence par la réponse en une phrase. Pas de tableaux ni de titres ; listes courtes avec « – » si nécessaire. Montants au format français (1 234,50 €).",
].join("\n");

export function advisorSystemVolatile(org: { name: string; currency: string; role: string }, today: string, voice: boolean): string {
  return [
    `Organisation : « ${org.name} » ; devise principale ${org.currency} ; rôle de l'utilisateur : ${org.role}${org.role === "viewer" ? " (lecture seule : ne prépare aucune modification)" : ""}.`,
    `Nous sommes le ${today} (heure de Paris).`,
    voice
      ? "La question a été DICTÉE et ta réponse sera LUE À VOIX HAUTE : 2 à 4 phrases courtes, chiffres arrondis à l'unité quand c'est sans ambiguïté, pas de liste, pas de symboles ni d'abréviations ; renvoie au détail affiché à l'écran."
      : "Réponse écrite : concise (5 à 10 lignes maximum sauf demande de bilan détaillé).",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Persistance (session de l'utilisateur, RLS : uniquement SES conversations)
// ---------------------------------------------------------------------------

export interface AdvisorStore {
  openConversation(conversationId: string | null | undefined, firstMessage: string): Promise<string>;
  history(conversationId: string): Promise<{ role: "user" | "assistant" | "notice"; content: string }[]>;
  addMessage(conversationId: string, m: { role: "user" | "assistant"; content: string; cards?: AdvisorCardDTO[]; sources?: string[]; interrupted?: boolean }): Promise<string | null>;
}

export function supabaseAdvisorStore(ctx: OrgContext): AdvisorStore {
  const org = ctx.organization.id;
  return {
    async openConversation(conversationId, firstMessage) {
      if (conversationId) {
        const { data, error } = await ctx.supabase.from("advisor_conversations").select("id").eq("id", conversationId).eq("organization_id", org).eq("user_id", ctx.user.id).maybeSingle();
        if (error) throw new AppError("INTERNAL", "Conversation illisible. Réessayez.");
        if (!data) throw new AppError("NOT_FOUND", "Conversation introuvable : démarrez-en une nouvelle.");
        return data.id;
      }
      const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 80) || "Nouvelle conversation";
      const { data, error } = await ctx.supabase.from("advisor_conversations").insert({ organization_id: org, user_id: ctx.user.id, title }).select("id").single();
      if (error || !data) throw new AppError("INTERNAL", "Impossible de créer la conversation. Réessayez.");
      return data.id;
    },
    async history(conversationId) {
      const { data, error } = await ctx.supabase.from("advisor_messages").select("role, content, created_at").eq("conversation_id", conversationId).eq("organization_id", org).order("created_at", { ascending: false }).limit(ADVISOR_LIMITS.historyMessages);
      if (error) throw new AppError("INTERNAL", "Historique illisible. Réessayez.");
      return (data ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant" | "notice", content: m.content }));
    },
    async addMessage(conversationId, m) {
      const { data, error } = await ctx.supabase
        .from("advisor_messages")
        .insert({ organization_id: org, conversation_id: conversationId, user_id: ctx.user.id, role: m.role, content: m.content.slice(0, 12_000), cards: (m.cards ?? []).slice(0, 12) as never, sources: (m.sources ?? []).slice(0, 20) as never, interrupted: m.interrupted ?? false })
        .select("id")
        .single();
      if (error) {
        log.warn("message du conseiller non enregistré", { orgId: org, error: error.message });
        return null;
      }
      await ctx.supabase.from("advisor_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
      return data?.id ?? null;
    },
  };
}

/**
 * Historique envoyé au modèle : rôles alternés, notes de l'application rattachées au tour
 * utilisateur, borné en nombre de caractères (les plus récents d'abord).
 */
export function historyForModel(history: { role: "user" | "assistant" | "notice"; content: string }[], maxChars: number = ADVISOR_LIMITS.historyChars): Anthropic.Beta.BetaMessageParam[] {
  const kept: { role: "user" | "assistant"; content: string }[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    const content = m.role === "notice" ? `[Note de l'application] ${m.content}` : m.content;
    if (total + content.length > maxChars && kept.length > 0) break;
    total += content.length;
    kept.unshift({ role: m.role === "assistant" ? "assistant" : "user", content });
  }
  while (kept.length && kept[0]!.role !== "user") kept.shift();
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of kept) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else merged.push({ ...m });
  }
  return merged.map((m) => ({ role: m.role, content: m.content }));
}

// ---------------------------------------------------------------------------
// Boucle de conversation (flux)
// ---------------------------------------------------------------------------

/** Sous-ensemble de l'API utilisé (le client Anthropic réel le satisfait ; simulable en test). */
export interface AdvisorModelClient {
  beta: {
    messages: {
      stream(params: Anthropic.Beta.MessageCreateParamsStreaming | Record<string, unknown>, options?: { signal?: AbortSignal }): {
        on(event: "text", cb: (delta: string) => void): unknown;
        finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
        abort?: () => void;
      };
    };
  };
}

export interface AdvisorDeps {
  client?: AdvisorModelClient;
  store?: AdvisorStore;
  runTool?: typeof runAdvisorTool;
  now?: Date;
  signal?: AbortSignal;
}

export async function runAdvisorTurn(ctx: OrgContext, req: AdvisorChatRequest, emit: (e: AdvisorStreamEvent) => void, deps: AdvisorDeps = {}): Promise<AdvisorReplyDTO> {
  const client = deps.client ?? (claudeClient() as unknown as AdvisorModelClient);
  const store = deps.store ?? supabaseAdvisorStore(ctx);
  const runTool = deps.runTool ?? runAdvisorTool;
  const now = deps.now ?? new Date();
  const started = Date.now();

  const conversationId = await store.openConversation(req.conversationId ?? null, req.message);
  emit({ type: "conversation", conversationId });
  const previous = await store.history(conversationId);
  await store.addMessage(conversationId, { role: "user", content: req.message });

  const today = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(now);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: ADVISOR_SYSTEM_STABLE, cache_control: { type: "ephemeral" } },
    { type: "text", text: advisorSystemVolatile({ name: ctx.organization.name, currency: ctx.organization.default_currency, role: ctx.role }, today, Boolean(req.voice)) },
  ];
  // Historique + question ; un tour utilisateur resté sans réponse (interruption) est fusionné.
  const convo = historyForModel([...previous, { role: "user", content: req.message }]);
  const toolCtx: AdvisorToolContext = { supabase: ctx.supabase, organizationId: ctx.organization.id, currency: ctx.organization.default_currency, org: ctx, conversationId, now };

  const cards: AdvisorCardDTO[] = [];
  const sources: string[] = [];
  let answer = "";
  let model: string | null = null;
  let interrupted = false;
  let streamed = "";

  try {
    for (let step = 0; step < ADVISOR_LIMITS.maxSteps; step++) {
      if (Date.now() - started > ADVISOR_LIMITS.deadlineMs) {
        interrupted = true;
        break;
      }
      streamed = "";
      const stream = client.beta.messages.stream(
        {
          model: AI_MODEL,
          max_tokens: ADVISOR_LIMITS.maxTokens,
          betas: AI_BETAS,
          fallbacks: "default",
          output_config: { effort: "medium" },
          system,
          tools: ADVISOR_TOOL_DEFINITIONS.map((t, i, all) => (i === all.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t)),
          messages: convo,
        } as never,
        { signal: deps.signal },
      );
      stream.on("text", (delta) => {
        streamed += delta;
        emit({ type: "text", delta });
      });
      const response = await stream.finalMessage();
      model = response.model;
      if (response.stop_reason === "refusal") {
        answer = "Je ne peux pas répondre à cette demande. Reformulez-la sur votre activité (ventes, stock, commandes, expéditions).";
        break;
      }
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || calls.length === 0) {
        answer = text;
        if (response.stop_reason === "max_tokens") interrupted = true;
        break;
      }
      if (response.stop_reason === "tool_use" && text) answer = text; // texte d'attente éventuel
      convo.push({ role: "assistant", content: response.content });
      const results = await Promise.all(
        calls.map(async (call) => {
          const spec = ADVISOR_TOOLS[call.name];
          emit({ type: "status", label: spec ? spec.label : call.name });
          const r = await runTool(toolCtx, call.name, call.input);
          if (spec && !sources.includes(spec.label)) sources.push(spec.label);
          for (const c of r.cards) {
            if (cards.length < 8) {
              cards.push(c);
              emit({ type: "card", card: c });
            }
          }
          if (r.isError) log.warn("outil du conseiller en erreur", { tool: call.name, error: r.content.slice(0, 200) });
          return { type: "tool_result" as const, tool_use_id: call.id, content: r.content, is_error: r.isError };
        }),
      );
      convo.push({ role: "user", content: results });
      if (step === ADVISOR_LIMITS.maxSteps - 1) interrupted = true;
    }
  } catch (e) {
    if (deps.signal?.aborted) {
      interrupted = true;
      answer = answer || streamed;
    } else {
      const err = aiError(e);
      const partial = (answer || streamed).trim();
      await store.addMessage(conversationId, { role: "assistant", content: partial ? `${partial}\n\n(réponse interrompue : ${err.message})` : `Réponse impossible : ${err.message}`, cards, sources, interrupted: true });
      throw err;
    }
  }

  if (!answer.trim()) {
    answer = interrupted ? "Je n'ai pas pu terminer l'analyse dans le temps imparti. Posez une question plus précise (période, produit)." : "Je n'ai pas de réponse à formuler. Reformulez votre question.";
  } else if (interrupted) {
    answer = `${answer}\n\n(réponse interrompue : demandez la suite ou précisez la question)`;
  }
  const messageId = await store.addMessage(conversationId, { role: "assistant", content: answer, cards, sources, interrupted });
  const reply: AdvisorReplyDTO = { conversationId, messageId, answer, cards, sources, interrupted, model };
  emit({ type: "done", reply });
  return reply;
}

/** Réponse en flux NDJSON (une ligne JSON par événement) pour l'application mobile. */
export function advisorNdjsonStream(ctx: OrgContext, req: AdvisorChatRequest, deps: AdvisorDeps = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  return new ReadableStream<Uint8Array>({
    async start(c) {
      const send = (e: AdvisorStreamEvent) => {
        try {
          c.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // client parti : on laisse le tour se terminer (le message est enregistré)
        }
      };
      try {
        await runAdvisorTurn(ctx, req, send, { ...deps, signal: deps.signal ?? controller.signal });
      } catch (e) {
        const err = aiError(e);
        send({ type: "error", code: err.code, message: err.message });
      } finally {
        try {
          c.close();
        } catch {
          // déjà fermé
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
}
