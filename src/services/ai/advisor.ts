import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { AdvisorCardDTO, AdvisorChatRequest, AdvisorReplyDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { aiError, budgetedCallOptions, llmClient, type LlmClient, type LlmMessage, type LlmTool } from "./llm";
import { ADVISOR_FUTURE_CAPABILITIES, ADVISOR_TOOL_DEFINITIONS, ADVISOR_TOOLS, runAdvisorTool, type AdvisorToolContext } from "./advisor-tools";
import { turnBudget } from "./deadline";
import { buyerPseudonymizer, cardsForStorage, UNTRUSTED_RULE } from "./privacy";
import { aiMeter, type AiMeter } from "./quota";

const log = createLogger("AI_ADVISOR");

/**
 * Conseiller e-commerce IA : conversation (écrite ou dictée) liée à l'utilisateur authentifié.
 *
 * Un tour = 1 question → boucle d'outils du modèle (lecture / préparation, voir advisor-tools.ts) →
 * réponse diffusée au fil de l'eau (événements NDJSON) → message et cartes enregistrés.
 * Coûts maîtrisés : historique limité (12 derniers messages, 12 000 caractères), au plus 8 étapes
 * d'outils, réponse ≤ 2 500 jetons, invite système et outils mis en cache, un seul modèle par question.
 *
 * 8 étapes (au lieu de 6) : les lectures eBay en direct s'enchaînent souvent (liste → détail : annonce
 * trouvée par son titre puis GetItem puis trafic ; en-têtes de messages puis texte d'un message ;
 * commandes en direct puis détail d'une commande). Le coût reste borné par la date limite (100 s),
 * le quota de questions et le cache de 60 s des lectures eBay ; la plupart des questions n'utilisent
 * qu'1 ou 2 étapes.
 *
 * Échéance (audit S-11, I-14) : un `AbortSignal` global (100 s ou déconnexion du client) est propagé
 * à chaque appel au modèle et aux lectures des outils ; chaque appel a un délai = min(55 s, temps
 * restant) et n'est relancé que si le budget le permet. À l'échéance, la réponse partielle est
 * enregistrée proprement (marquée « interrompue »).
 * Coût (S-09, I-14) : CHAQUE appel au modèle est réservé dans le quota (fonction SQL atomique,
 * fail-closed) et ses jetons sont enregistrés.
 */

export const ADVISOR_LIMITS = { historyMessages: 12, historyChars: 12_000, maxSteps: 8, maxTokens: 2500, deadlineMs: 100_000, maxReadCards: 3, maxCards: 8 } as const;

/**
 * Pertinence des cartes : chaque outil reçoit un paramètre `show_card` que le modèle renseigne à
 * l'appel (vrai = le résultat répond directement à la question ; faux = simple contexte). Seules
 * les cartes demandées s'affichent sous la réponse (au plus 3 cartes de lecture) ; les cartes
 * d'actions préparées (Confirmer / Annuler) s'affichent toujours. Paramètre retiré avant
 * l'exécution de l'outil.
 */
export const SHOW_CARD_PARAM = "show_card";

function withShowCard(t: LlmTool): LlmTool {
  const schema = t.input_schema as { properties?: Record<string, unknown>; required?: string[] };
  return {
    ...t,
    input_schema: {
      ...schema,
      properties: { ...(schema.properties ?? {}), [SHOW_CARD_PARAM]: { type: "boolean", description: "true si la carte de ce résultat doit s'afficher sous ta réponse parce qu'elle répond directement à la question posée ; false si l'outil sert seulement de contexte (bilan général, priorités, etc. pour une question qui porte sur autre chose)." } },
      required: [...(schema.required ?? []), SHOW_CARD_PARAM],
    },
  };
}

/** Outils tels que déclarés au modèle (définitions + paramètre `show_card`). */
export const ADVISOR_MODEL_TOOLS: LlmTool[] = ADVISOR_TOOL_DEFINITIONS.map(withShowCard);

/** Sépare `show_card` des paramètres de l'outil (absent = carte affichée, par prudence). */
export function splitShowCard(input: unknown): { show: boolean; input: unknown } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { show: true, input };
  const { [SHOW_CARD_PARAM]: flag, ...rest } = input as Record<string, unknown>;
  return { show: flag !== false, input: rest };
}

/** Partie STABLE de l'invite (mise en cache avec les outils) : aucune donnée variable ici. */
export const ADVISOR_SYSTEM_STABLE = [
  "Tu es le conseiller e-commerce personnel de l'utilisateur dans MON STOCK (gestion de stock et de ventes d'un revendeur d'appareils électroniques, principalement sur eBay). Tu es son employé : tu analyses SES données, tu recommandes, tu prépares des actions.",
  "",
  "Méthode :",
  "- Réponds EXACTEMENT à la question posée, et seulement à elle. Ne fais pas de bilan général si on ne te le demande pas.",
  "- Avant toute réponse chiffrée ou factuelle sur l'activité, appelle les outils. Choisis les plus ciblés pour la question (ex. « mon compte eBay » → ebay_account_overview, ebay_account ; pas business_report ni today_briefing) ; appelle-les en parallèle si utile ; n'en appelle pas d'inutiles.",
  "- show_card : mets true uniquement pour les 1 ou 2 outils dont le résultat répond directement à la question ; false pour ceux qui servent seulement de contexte.",
  "- Périodes : utilise le paramètre period des outils (« cette semaine » = this_week, « ce mois-ci » = this_month…). Sans précision : 30 derniers jours, et dis-le.",
  "- Distingue toujours : chiffre d'affaires (CA), marge brute (CA − coût d'achat connu), frais de vente, bénéfice estimé. Rappelle les données manquantes signalées par les outils (coûts d'achat, frais, port payé, retours).",
  "- Recommandations : seulement si elles sont demandées ou évidemment utiles, 1 à 2 actions concrètes, chacune justifiée par un chiffre issu d'un outil.",
  "",
  "Compte eBay — deux sources :",
  "- Données SYNCHRONISÉES dans MON STOCK (business_report, product_profitability, sales_ranking, sales_summary, recent_orders, order_lookup, listings_search, ebay_account) : historique, CA, marges, stock. À privilégier pour les bilans chiffrés.",
  "- Lecture EN DIRECT chez eBay (outils ebay_*) pour l'état actuel ou ce que MON STOCK ne stocke pas : ebay_order_details (une commande : frais, taxes, remises, remboursements, annulation, suivis, livraison prévue, ville/pays de l'acheteur), ebay_orders_live (commandes récentes, même non synchronisées, à expédier), ebay_listing_details (une annonce : observateurs, offres reçues, quantités, dates, état), ebay_sold_unsold (vendus et invendus ≤ 60 j), ebay_feedback (évaluations, négatives), ebay_messages (en-têtes, non lus), ebay_account_overview (limites de vente, politiques, programmes, réputation).",
  "- Analyse complète (autorisation eBay supplémentaire) : ebay_finances (frais par type, remboursements, litiges, versements, solde), ebay_traffic (impressions, vues, clic, conversion), ebay_seller_standards (niveau vendeur), ebay_promotions (Promoted Listings, promotions). Si l'outil répond que l'analyse complète manque, dis-le clairement : un administrateur doit « Autoriser l'analyse complète » dans Réglages → Intégrations. Ne remplace jamais ces données par une estimation.",
  "- Chaque résultat eBay en direct porte readAtParis : cite la source et l'heure (« d'après eBay, lu à 14 h 05 »). Un résultat available=false : explique la raison donnée (non connecté, autorisation expirée, refus d'eBay) sans rien compléter.",
  "- Messages eBay : ebay_messages donne seulement les en-têtes. N'appelle ebay_message (texte d'un message) que si l'utilisateur demande explicitement le contenu d'un message dans sa question actuelle, en citant mot pour mot sa demande (user_request).",
  "- Acheteurs : ils sont désignés par un alias stable (« Acheteur XXXX ») et leur pays ; leur identité, leur ville et leur code postal ne te sont pas transmis (l'utilisateur les voit dans les cartes). Utilise l'alias, ne devine jamais une identité.",
  "- Certains outils (finances, messages, données des acheteurs eBay) sont réservés aux rôles rédacteur et administrateur : si l'outil répond « forbidden », explique-le simplement.",
  UNTRUSTED_RULE,
  "",
  "Règles absolues :",
  "- Chaque chiffre (montant, quantité, date, pourcentage) doit venir d'un résultat d'outil de cette conversation. N'invente, n'extrapole ni ne complète jamais une donnée absente : dis qu'elle manque.",
  "- Si eBay n'est pas connecté ou jamais synchronisé, ou si une donnée est vide, dis-le clairement et ne prétends pas avoir consulté le compte.",
  "- Actions : tu peux seulement PRÉPARER (outils prepare_*). Une action préparée n'est faite que lorsque l'utilisateur touche « Confirmer » dans l'application ; un « oui » écrit ou oral ne suffit pas et ne vaut jamais pour d'autres actions. Ne dis jamais qu'une action est faite si une note de l'application ne l'a pas confirmé.",
  `- Non disponible (ne le simule pas, propose le faire manuellement) : ${ADVISOR_FUTURE_CAPABILITIES.join(" ; ")}.`,
  "- Les cartes de résultats s'affichent automatiquement sous ta réponse : ne recopie pas les tableaux, commente l'essentiel.",
  "- Les messages « [Note de l'application] » sont écrits par MON STOCK (pas par l'utilisateur) : ils indiquent le résultat réel d'une action.",
  "",
  "Style : français, naturel et direct, comme un collaborateur qui parle. Commence par la réponse en une phrase. Cite seulement les 2 ou 3 chiffres qui comptent pour la question, pas tous ceux des outils. Pas de tableaux ni de titres ; pas de longue liste à puces (au plus 3 puces « – », et seulement si la question appelle une énumération). Montants au format français (1 234,50 €).",
].join("\n");

export function advisorSystemVolatile(org: { name: string; currency: string; role: string }, today: string, voice: boolean): string {
  return [
    `Organisation : « ${org.name} » ; devise principale ${org.currency} ; rôle de l'utilisateur : ${org.role}${org.role === "viewer" ? " (lecture seule : ne prépare aucune modification ; finances, messages et données des acheteurs eBay ne lui sont pas accessibles)" : ""}.`,
    `Nous sommes le ${today} (heure de Paris).`,
    voice
      ? "La question a été DICTÉE et ta réponse sera LUE À VOIX HAUTE : 2 à 4 phrases courtes, chiffres arrondis à l'unité quand c'est sans ambiguïté, pas de liste, pas de symboles ni d'abréviations ; renvoie au détail affiché à l'écran."
      : "Réponse écrite : courte (2 à 6 lignes, plus seulement si l'utilisateur demande un bilan détaillé).",
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

/**
 * Questions de l'utilisateur : écrites sous SA session (RLS : role = 'user' seulement). Réponses du
 * conseiller : écrites par le serveur (service_role, audit S-10) dans une conversation dont la
 * propriété a été vérifiée sous la session de l'utilisateur (openConversation). Les cartes reçues
 * ici sont déjà la version ENREGISTRABLE (sans données personnelles, cardsForStorage).
 */
export function supabaseAdvisorStore(ctx: OrgContext, admin?: AdminSupabaseClient): AdvisorStore {
  const org = ctx.organization.id;
  const owned = new Set<string>();
  const server = () => (admin ??= createAdminSupabaseClient());
  return {
    async openConversation(conversationId, firstMessage) {
      if (conversationId) {
        const { data, error } = await ctx.supabase.from("advisor_conversations").select("id").eq("id", conversationId).eq("organization_id", org).eq("user_id", ctx.user.id).maybeSingle();
        if (error) throw new AppError("INTERNAL", "Conversation illisible. Réessayez.");
        if (!data) throw new AppError("NOT_FOUND", "Conversation introuvable : démarrez-en une nouvelle.");
        owned.add(data.id);
        return data.id;
      }
      const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 80) || "Nouvelle conversation";
      const { data, error } = await ctx.supabase.from("advisor_conversations").insert({ organization_id: org, user_id: ctx.user.id, title }).select("id").single();
      if (error || !data) throw new AppError("INTERNAL", "Impossible de créer la conversation. Réessayez.");
      owned.add(data.id);
      return data.id;
    },
    async history(conversationId) {
      const { data, error } = await ctx.supabase.from("advisor_messages").select("role, content, created_at").eq("conversation_id", conversationId).eq("organization_id", org).order("created_at", { ascending: false }).limit(ADVISOR_LIMITS.historyMessages);
      if (error) throw new AppError("INTERNAL", "Historique illisible. Réessayez.");
      return (data ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant" | "notice", content: m.content }));
    },
    async addMessage(conversationId, m) {
      if (!owned.has(conversationId)) throw new AppError("NOT_FOUND", "Conversation introuvable : démarrez-en une nouvelle.");
      const row = { organization_id: org, conversation_id: conversationId, user_id: ctx.user.id, role: m.role, content: m.content.slice(0, 12_000), cards: (m.role === "user" ? [] : (m.cards ?? []).slice(0, 12)) as never, sources: (m.sources ?? []).slice(0, 20) as never, interrupted: m.interrupted ?? false };
      const client = m.role === "user" ? ctx.supabase : server();
      const { data, error } = await client.from("advisor_messages").insert(row).select("id").single();
      if (error) {
        // Jamais le contenu ni le message d'erreur complet (données personnelles possibles) : le code seul.
        log.warn("message du conseiller non enregistré", { orgId: org, role: m.role, code: error.code ?? null });
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
export function historyForModel(history: { role: "user" | "assistant" | "notice"; content: string }[], maxChars: number = ADVISOR_LIMITS.historyChars): LlmMessage[] {
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

export interface AdvisorDeps {
  client?: LlmClient;
  store?: AdvisorStore;
  runTool?: typeof runAdvisorTool;
  now?: Date;
  signal?: AbortSignal;
  /** quota par appel au modèle (défaut : fonction SQL atomique) */
  meter?: AiMeter;
  /** échéance du tour en ms (défaut : ADVISOR_LIMITS.deadlineMs) */
  deadlineMs?: number;
}

export async function runAdvisorTurn(ctx: OrgContext, req: AdvisorChatRequest, emit: (e: AdvisorStreamEvent) => void, deps: AdvisorDeps = {}): Promise<AdvisorReplyDTO> {
  const client = deps.client ?? llmClient();
  const store = deps.store ?? supabaseAdvisorStore(ctx);
  const runTool = deps.runTool ?? runAdvisorTool;
  const meter = deps.meter ?? aiMeter(ctx);
  const now = deps.now ?? new Date();
  // Échéance globale : propagée aux appels au modèle et aux lectures des outils.
  const budget = turnBudget(deps.deadlineMs ?? ADVISOR_LIMITS.deadlineMs, deps.signal);

  try {
    const conversationId = await store.openConversation(req.conversationId ?? null, req.message);
    emit({ type: "conversation", conversationId });
    const previous = await store.history(conversationId);
    await store.addMessage(conversationId, { role: "user", content: req.message });

    const today = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(now);
    // Partie stable en tête (préfixe identique d'une question à l'autre → cache d'invite du fournisseur).
    const system = `${ADVISOR_SYSTEM_STABLE}\n\n${advisorSystemVolatile({ name: ctx.organization.name, currency: ctx.organization.default_currency, role: ctx.role }, today, Boolean(req.voice))}`;
    // Historique + question ; un tour utilisateur resté sans réponse (interruption) est fusionné.
    const convo = historyForModel([...previous, { role: "user", content: req.message }]);
    const toolCtx: AdvisorToolContext = {
      supabase: ctx.supabase,
      organizationId: ctx.organization.id,
      currency: ctx.organization.default_currency,
      org: ctx,
      conversationId,
      now,
      question: req.message,
      // Alias des acheteurs stables pour TOUTE la conversation (clé : identifiant de conversation, jamais transmis au modèle).
      pseudonyms: buyerPseudonymizer(conversationId),
      signal: budget.signal,
    };

    const cards: AdvisorCardDTO[] = [];
    let readCards = 0;
    const sources: string[] = [];
    let answer = "";
    let model: string | null = null;
    let interrupted = false;
    let stopNote: string | null = null;
    let streamed = "";

    try {
      for (let step = 0; step < ADVISOR_LIMITS.maxSteps; step++) {
        const call = budgetedCallOptions(budget.deadlineAt);
        if (!call || budget.signal.aborted) {
          interrupted = true;
          break;
        }
        // Quota : chaque appel au modèle est réservé AVANT d'être fait (refus = arrêt propre).
        let eventId: string | null;
        try {
          eventId = await meter.beforeModelCall();
        } catch (e) {
          interrupted = true;
          stopNote = e instanceof AppError ? e.message : "Contrôle du quota IA indisponible.";
          break;
        }
        streamed = "";
        const response = await client.complete(
          { system, tools: ADVISOR_MODEL_TOOLS, messages: convo, maxTokens: ADVISOR_LIMITS.maxTokens, effort: "medium", cacheKey: "mon-stock-advisor" },
          {
            signal: budget.signal,
            timeoutMs: call.timeoutMs,
            maxRetries: call.maxRetries,
            onText: (delta) => {
              streamed += delta;
              emit({ type: "text", delta });
            },
          },
        );
        await meter.afterModelCall(eventId, response.usage ?? null);
        model = response.model;
        if (response.finish === "refusal") {
          answer = "Je ne peux pas répondre à cette demande. Reformulez-la sur votre activité (ventes, stock, commandes, expéditions).";
          break;
        }
        const text = response.text.trim();
        const calls = response.toolCalls;
        if (response.finish !== "tool_calls" || calls.length === 0) {
          answer = text;
          if (response.finish === "length") interrupted = true;
          break;
        }
        if (text) answer = text; // texte d'attente éventuel
        convo.push({ role: "assistant", content: response.text, toolCalls: calls });
        const results = await Promise.all(
          calls.map(async (c) => {
            const spec = ADVISOR_TOOLS[c.name];
            emit({ type: "status", label: spec ? spec.label : c.name });
            const { show, input } = splitShowCard(c.input);
            const r = await runTool(toolCtx, c.name, input);
            if (spec && !sources.includes(spec.label)) sources.push(spec.label);
            const always = spec?.category === "prepare";
            for (const cd of r.cards) {
              if (!always && (!show || readCards >= ADVISOR_LIMITS.maxReadCards)) continue;
              if (cards.length >= ADVISOR_LIMITS.maxCards) break;
              if (!always) readCards++;
              cards.push(cd);
              emit({ type: "card", card: cd });
            }
            // Journal : nom de l'outil seulement (le contenu peut citer des données personnelles).
            if (r.isError) log.warn("outil du conseiller en erreur", { tool: c.name });
            return { role: "tool" as const, toolCallId: c.id, content: r.isError ? `ERREUR : ${r.content}` : r.content };
          }),
        );
        convo.push(...results);
        if (step === ADVISOR_LIMITS.maxSteps - 1) interrupted = true;
      }
    } catch (e) {
      if (budget.signal.aborted) {
        // Échéance atteinte ou client déconnecté : réponse partielle enregistrée proprement.
        interrupted = true;
        answer = answer || streamed;
        if (budget.timedOut()) stopNote = "délai de réponse atteint";
      } else {
        const err = aiError(e);
        const partial = (answer || streamed).trim();
        await store.addMessage(conversationId, { role: "assistant", content: partial ? `${partial}\n\n(réponse interrompue : ${err.message})` : `Réponse impossible : ${err.message}`, cards: cardsForStorage(cards), sources, interrupted: true });
        throw err;
      }
    }

    if (!answer.trim()) {
      answer = stopNote && !budget.timedOut()
        ? stopNote
        : interrupted
          ? "Je n'ai pas pu terminer l'analyse dans le temps imparti. Posez une question plus précise (période, produit)."
          : "Je n'ai pas de réponse à formuler. Reformulez votre question.";
    } else if (interrupted) {
      answer = `${answer}\n\n(réponse interrompue${stopNote ? ` : ${stopNote}` : " : demandez la suite ou précisez la question"})`;
    }
    // Historique enregistré : cartes expurgées des données personnelles ; l'écran reçoit la version complète.
    const messageId = await store.addMessage(conversationId, { role: "assistant", content: answer, cards: cardsForStorage(cards), sources, interrupted });
    const reply: AdvisorReplyDTO = { conversationId, messageId, answer, cards, sources, interrupted, model };
    emit({ type: "done", reply });
    return reply;
  } finally {
    budget.dispose();
  }
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
