import "server-only";
import OpenAI from "openai";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("AI_LLM");

/**
 * Accès au modèle de langage — CÔTÉ SERVEUR UNIQUEMENT. Fournisseur : OpenAI (API Chat Completions).
 *
 * La clé `OPENAI_API_KEY` est un secret de l'Edge Function (Dashboard Supabase → Edge Functions →
 * Secrets) : jamais dans le dépôt, jamais dans l'application mobile. Sans clé, les fonctions IA
 * répondent « non configuré » au lieu d'inventer une réponse.
 *
 * Le reste du code (conseiller, assistant, brouillon de produit) ne dépend que de l'interface
 * neutre ci-dessous (`LlmClient`) : changer de fournisseur ne touche que ce fichier.
 */

/** Modèle par défaut (outils, sorties structurées, coût modéré) ; remplaçable par le secret `OPENAI_MODEL`. */
export const DEFAULT_AI_MODEL = "gpt-5.4-mini";

export function aiModel(env: Record<string, string | undefined> = process.env): string {
  const m = env.OPENAI_MODEL?.trim();
  return m && /^[a-z0-9][a-z0-9.\-_:]{1,80}$/i.test(m) ? m : DEFAULT_AI_MODEL;
}

export const AI_NOT_CONFIGURED = "L'assistant IA n'est pas encore activé sur le serveur (clé OPENAI_API_KEY absente des secrets de l'Edge Function).";

export function aiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 20);
}

// ---------------------------------------------------------------------------
// Interface neutre
// ---------------------------------------------------------------------------

/** Outil exposé au modèle (schéma JSON fermé ; l'entrée est revalidée par zod à l'exécution). */
export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Arguments décodés ; `undefined` si le JSON reçu est illisible (l'outil répond alors en erreur). */
  input: unknown;
}

export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  /** Sortie JSON imposée (schéma strict). */
  json?: { name: string; schema: Record<string, unknown> };
  /** Clé de cache d'invite (préfixe stable : invite système + outils). */
  cacheKey?: string;
}

export type LlmFinish = "stop" | "tool_calls" | "length" | "refusal";

export interface LlmResult {
  text: string;
  toolCalls: LlmToolCall[];
  finish: LlmFinish;
  model: string;
}

export interface LlmClient {
  complete(req: LlmRequest, opts?: { signal?: AbortSignal; onText?: (delta: string) => void }): Promise<LlmResult>;
}

// ---------------------------------------------------------------------------
// Implémentation OpenAI
// ---------------------------------------------------------------------------

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function toOpenAIMessages(system: string, messages: LlmMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "developer", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "tool") out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    else
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) } : {}),
      });
  }
  return out;
}

export function toOpenAITools(tools: LlmTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

function parseArgs(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Sous-ensemble du SDK utilisé (le client OpenAI réel le satisfait ; simulable en test). */
export interface OpenAIChatLike {
  chat: { completions: { create(body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> } };
}

/** Assemble une réponse diffusée (texte, appels d'outils par index, motif de fin, refus). */
export async function collectStream(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>, onText?: (delta: string) => void, fallbackModel = ""): Promise<LlmResult> {
  let text = "";
  let refusal = "";
  let model = fallbackModel;
  let finish: string | null = null;
  const calls = new Map<number, { id: string; name: string; args: string }>();
  for await (const chunk of stream) {
    if (chunk.model) model = chunk.model;
    for (const choice of chunk.choices ?? []) {
      const d = choice.delta;
      if (d?.content) {
        text += d.content;
        onText?.(d.content);
      }
      if (d?.refusal) refusal += d.refusal;
      for (const tc of d?.tool_calls ?? []) {
        const cur = calls.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(tc.index, cur);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }
  const toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, input: parseArgs(c.args) }));
  const mapped: LlmFinish = refusal || finish === "content_filter" ? "refusal" : finish === "length" ? "length" : toolCalls.length > 0 ? "tool_calls" : "stop";
  return { text: refusal && !text ? "" : text, toolCalls: mapped === "refusal" ? [] : toolCalls, finish: mapped, model };
}

/**
 * Paramètre refusé par l'API (400) : `param` ou message qui le nomme. Certains modèles refusent
 * `reasoning_effort` avec des outils dans Chat Completions, ou certains paramètres facultatifs.
 */
function rejectedParam(e: unknown): string | null {
  if (!(e instanceof OpenAI.BadRequestError)) return null;
  const param = typeof e.param === "string" ? e.param : null;
  for (const p of ["reasoning_effort", "parallel_tool_calls", "prompt_cache_key", "store"]) if (param === p || (e.message ?? "").includes(p)) return p;
  return null;
}

/** Journal technique sans secret : statut, code, paramètre et message d'OpenAI (tronqué). */
export function logApiError(e: unknown, model: string, withTools: boolean) {
  if (e instanceof OpenAI.APIError) log.warn("requête OpenAI refusée", { status: e.status ?? null, code: e.code ?? null, param: e.param ?? null, type: e.type ?? null, model, withTools, message: (e.message ?? "").slice(0, 300) });
}

export function openAILlm(sdk: OpenAIChatLike, model: string): LlmClient {
  return {
    async complete(req, opts = {}) {
      const withTools = Boolean(req.tools?.length);
      const body: Record<string, unknown> = {
        model,
        messages: toOpenAIMessages(req.system, req.messages),
        max_completion_tokens: req.maxTokens,
        // Avec des outils, l'effort de raisonnement n'est pas accepté par tous les modèles en
        // Chat Completions : on laisse la valeur par défaut du modèle.
        ...(withTools ? {} : { reasoning_effort: req.effort ?? "low" }),
        stream: true,
        store: false,
        ...(req.cacheKey ? { prompt_cache_key: req.cacheKey } : {}),
        ...(withTools ? { tools: toOpenAITools(req.tools!), parallel_tool_calls: true } : {}),
        ...(req.json ? { response_format: { type: "json_schema", json_schema: { name: req.json.name, strict: true, schema: req.json.schema } } } : {}),
      };
      let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
      try {
        stream = await sdk.chat.completions.create(body, { signal: opts.signal });
      } catch (e) {
        logApiError(e, model, withTools);
        const p = rejectedParam(e);
        if (!p || !(p in body)) throw e;
        // Un seul nouvel essai, sans le paramètre facultatif refusé.
        const { [p]: _dropped, ...retry } = body;
        void _dropped;
        try {
          stream = await sdk.chat.completions.create(retry, { signal: opts.signal });
        } catch (e2) {
          logApiError(e2, model, withTools);
          throw e2;
        }
      }
      return collectStream(stream, opts.onText, model);
    },
  };
}

let sdk: OpenAI | null = null;
let client: LlmClient | null = null;

/** Client OpenAI du serveur (texte et voix) ; « non configuré » sans clé. */
export function openAISdk(): OpenAI {
  if (!aiConfigured()) throw new AppError("NOT_CONFIGURED", AI_NOT_CONFIGURED);
  // Délais compatibles avec la limite d'exécution de l'Edge Function (≈ 150 s).
  sdk ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 55_000 });
  return sdk;
}

export function llmClient(): LlmClient {
  client ??= openAILlm(openAISdk() as unknown as OpenAIChatLike, aiModel());
  return client;
}

/** Erreurs de l'API → messages utilisateur (aucun détail technique ni secret). */
export function aiError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) return new AppError("NOT_CONFIGURED", "La clé OpenAI configurée sur le serveur est refusée (clé invalide ou sans accès au modèle).");
  if (e instanceof OpenAI.RateLimitError) return new AppError("RATE_LIMITED", "L'assistant IA est très sollicité, ou le crédit du compte OpenAI est épuisé : réessayez dans un instant.");
  if (e instanceof OpenAI.NotFoundError) return new AppError("NOT_CONFIGURED", "Le modèle configuré (OPENAI_MODEL) n'est pas disponible pour ce compte OpenAI.");
  if (e instanceof OpenAI.BadRequestError) return new AppError("EXTERNAL_API", "La requête à l'assistant IA a été refusée. Reformulez ou réessayez.");
  if (e instanceof OpenAI.APIConnectionError) return new AppError("EXTERNAL_API", "L'assistant IA est injoignable pour le moment. Réessayez.");
  if (e instanceof OpenAI.APIError) return new AppError("EXTERNAL_API", "L'assistant IA est momentanément indisponible. Réessayez.");
  return new AppError("INTERNAL", "L'assistant IA a rencontré une erreur inattendue.");
}
