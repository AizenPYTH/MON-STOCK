import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AssistantReplyDTO } from "@/features/mobile-api/contract";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { AI_BETAS, AI_MODEL, aiError, claudeClient } from "./claude";
import { ASSISTANT_TOOL_DEFINITIONS, ASSISTANT_TOOLS, runAssistantTool, type ToolContext } from "./assistant-tools";

const log = createLogger("AI_ASSISTANT");

/**
 * Assistant « Intelligence » : questions en langage naturel (dictées ou écrites) sur le compte de
 * l'utilisateur — « quel est le produit que j'ai le plus vendu ? », « combien ai-je vendu ce
 * mois-ci sur eBay ? », « qu'est-ce qui dort en stock ? ».
 *
 * Claude choisit les outils de lecture (ventes, commandes, stock, annonces, compte eBay), qui
 * interrogent les VRAIES données de l'organisation sous la session de l'utilisateur (RLS).
 * Il répond uniquement à partir de ces résultats ; sans donnée, il le dit.
 */

export const assistantRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine((m) => m[0]?.role === "user" && m[m.length - 1]?.role === "user", { message: "La conversation doit commencer et se terminer par une question." })
    .refine((m) => m.every((x, i) => i === 0 || x.role !== m[i - 1]!.role), { message: "Conversation invalide." }),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

const MAX_STEPS = 8;
/** Délai global de la boucle (la fonction serveur est interrompue au-delà d'environ 150 s). */
export const ASSISTANT_DEADLINE_MS = 110_000;

export function assistantSystemPrompt(org: { name: string; currency: string }, today: string): string {
  return [
    `Tu es l'assistant « Intelligence » de MON STOCK, le logiciel de gestion de stock et de ventes de l'organisation « ${org.name} » (revendeur d'appareils électroniques ; devise principale ${org.currency}).`,
    `Nous sommes le ${today}.`,
    "",
    "Tu réponds aux questions de l'utilisateur sur SON activité : ventes (eBay et autres canaux synchronisés), commandes, stock, marges, annonces, état du compte eBay.",
    "",
    "Méthode :",
    "- Utilise les outils pour lire les données avant de répondre à toute question chiffrée ou factuelle sur le compte. Tu peux en appeler plusieurs, en parallèle si utile.",
    "- Choisis une période cohérente avec la question (« ce mois-ci » = depuis le 1er du mois, « cette année », « depuis le début » = 730 jours). Sans précision, 30 jours, et dis-le.",
    "- Si une question ne relève pas des données disponibles (ex. prévisions météo, données d'un autre vendeur), dis-le simplement.",
    "",
    "Règles absolues :",
    "- Chaque chiffre de ta réponse (quantité, montant, date, nombre) doit provenir d'un résultat d'outil de cette conversation. N'invente, n'arrondis abusivement et n'extrapoles jamais.",
    "- Si les données sont vides (aucune vente, eBay non connecté, aucune synchronisation), dis-le clairement et indique quoi faire (ex. connecter eBay dans Réglages → Intégrations, lancer une synchronisation).",
    "- Si un résultat est tronqué ou partiel, précise-le.",
    "- Montants avec leur devise (ex. 1 234,50 €). Dates au format français.",
    "- Tu ne peux rien modifier (lecture seule) : pour une action, indique où la faire dans l'application.",
    "",
    "Style : français, direct et concis, adapté à un écran de téléphone. Réponds d'abord à la question en une phrase, puis au besoin quelques lignes de détail (listes avec « – », sans tableau, sans titres, sans gras).",
  ].join("\n");
}

export async function askAssistant(ctx: ToolContext & { organizationName: string }, request: AssistantRequest): Promise<AssistantReplyDTO> {
  const client = claudeClient();
  const today = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(ctx.now ?? new Date());
  const system = assistantSystemPrompt({ name: ctx.organizationName, currency: ctx.currency }, today);
  const messages: Anthropic.Beta.BetaMessageParam[] = request.messages.map((m) => ({ role: m.role, content: m.content }));
  const used: { tool: string; label: string }[] = [];
  let model = AI_MODEL;

  const started = Date.now();
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - started > ASSISTANT_DEADLINE_MS) throw new AppError("EXTERNAL_API", "La réponse prend trop de temps : posez une question plus précise.");
      const response = await client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 8000,
        betas: AI_BETAS,
        fallbacks: "default",
        output_config: { effort: "medium" },
        system,
        tools: ASSISTANT_TOOL_DEFINITIONS,
        messages,
      });
      model = response.model;
      if (response.stop_reason === "refusal") return { answer: "Je ne peux pas répondre à cette demande. Reformulez votre question sur vos ventes, votre stock ou votre compte eBay.", sources: used, model };

      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || calls.length === 0) {
        if (!text) throw new AppError("EXTERNAL_API", "L'assistant n'a pas formulé de réponse. Réessayez.");
        return { answer: response.stop_reason === "max_tokens" ? `${text}\n\n(réponse interrompue : posez une question plus précise)` : text, sources: used, model };
      }

      messages.push({ role: "assistant", content: response.content });
      const results = await Promise.all(
        calls.map(async (call) => {
          const r = await runAssistantTool(ctx, call.name, call.input);
          if (!used.some((u) => u.tool === call.name)) used.push({ tool: call.name, label: ASSISTANT_TOOLS[call.name]?.label ?? call.name });
          if (r.isError) log.warn("outil en erreur", { tool: call.name, error: r.content.slice(0, 200) });
          return { type: "tool_result" as const, tool_use_id: call.id, content: r.content, is_error: r.isError };
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    throw aiError(e);
  }
  throw new AppError("EXTERNAL_API", "La question demande trop d'étapes : posez-la de façon plus précise.");
}
