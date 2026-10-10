import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/errors";

/**
 * Accès à l'API Claude (Anthropic) — CÔTÉ SERVEUR UNIQUEMENT.
 *
 * La clé `ANTHROPIC_API_KEY` est un secret de l'Edge Function (Dashboard Supabase → Edge
 * Functions → Secrets) : jamais dans le dépôt, jamais dans l'application mobile. Sans clé, les
 * fonctions IA répondent « non configuré » au lieu d'inventer une réponse.
 */
export const AI_MODEL = "claude-opus-5-5";

/** Repli côté serveur si le modèle décline une requête (configuration par défaut d'Anthropic). */
export const AI_BETAS = ["server-side-fallback-2026-07-01"];

export const AI_NOT_CONFIGURED = "L'assistant IA n'est pas encore activé sur le serveur (clé ANTHROPIC_API_KEY absente des secrets de l'Edge Function).";

export function aiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 20);
}

let client: Anthropic | null = null;

export function claudeClient(): Anthropic {
  if (!aiConfigured()) throw new AppError("NOT_CONFIGURED", AI_NOT_CONFIGURED);
  // Délais compatibles avec la limite d'exécution de l'Edge Function (≈ 150 s).
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  return client;
}

/** Erreurs de l'API Claude → messages utilisateur (aucun détail technique ni secret). */
export function aiError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AppError("NOT_CONFIGURED", "La clé de l'API Claude configurée sur le serveur est refusée par Anthropic.");
  if (e instanceof Anthropic.RateLimitError) return new AppError("RATE_LIMITED", "L'assistant IA est très sollicité : réessayez dans un instant.");
  if (e instanceof Anthropic.BadRequestError) return new AppError("EXTERNAL_API", "La requête à l'assistant IA a été refusée. Reformulez ou réessayez.");
  if (e instanceof Anthropic.APIConnectionError) return new AppError("EXTERNAL_API", "L'assistant IA est injoignable pour le moment. Réessayez.");
  if (e instanceof Anthropic.APIError) return new AppError("EXTERNAL_API", "L'assistant IA est momentanément indisponible. Réessayez.");
  return new AppError("INTERNAL", "L'assistant IA a rencontré une erreur inattendue.");
}
