import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { speakableText } from "@/domain/ai/speakable";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { aiError, logApiError, openAISdk } from "./llm";

const log = createLogger("AI_SPEECH");

/**
 * Voix du conseiller : synthèse vocale OpenAI (lecture des réponses, PAS la conversation vocale
 * temps réel de ChatGPT, qui est un autre service).
 *
 * - Seules les RÉPONSES DU CONSEILLER déjà reçues sont lues : la route reçoit l'identifiant du
 *   message, relu sous la session de l'utilisateur (RLS : ses conversations uniquement). Aucun
 *   texte arbitraire n'est synthétisé ; chaque réponse a déjà été décomptée du quota IA.
 * - L'application garde l'audio en cache local : une réponse n'est synthétisée qu'une fois.
 * - Limite de débit par utilisateur (par instance du serveur) contre les appels répétés.
 * - Échantillon fixe (comparaison des voix) : décompté du quota IA.
 */

export const TTS_DEFAULT_MODEL = "gpt-4o-mini-tts";
/** Voix proposées à l'utilisateur (les plus naturelles de la gamme, à comparer à l'oreille). */
export const TTS_CHOICES = ["marin", "cedar"] as const;
export type TtsVoice = (typeof TTS_CHOICES)[number];
export const TTS_DEFAULT_VOICE: TtsVoice = "marin";
/** ≈ 1 minute de parole ; l'API accepte bien plus, on reste court (coût, attente). */
export const TTS_MAX_CHARS = 900;

export const TTS_INSTRUCTIONS = [
  "Tu lis à voix haute la réponse d'un conseiller à un vendeur indépendant, sur son téléphone.",
  "Langue : français de France, naturel, comme dans une vraie conversation entre collègues.",
  "Ton : chaleureux et posé ; intonation vivante mais sobre ; pauses naturelles entre les idées ; débit légèrement modéré.",
  "À éviter : ton de GPS, de standard téléphonique, de publicité ou de lecture monotone ; aucune exagération théâtrale.",
  "Prononce les montants, quantités et pourcentages comme on les dit à l'oral.",
].join(" ");

/** Texte représentatif de MON STOCK, identique pour comparer les voix. */
export const TTS_SAMPLE_TEXT =
  "Bonjour ! Ce mois-ci, vous avez réalisé mille deux cent quatre-vingts euros de chiffre d'affaires, soit douze pour cent de plus que le mois dernier. Votre iPhone 13 reconditionné reste votre meilleure vente, mais il ne vous en reste que deux en stock : je vous conseille de recommander rapidement. Bonne nouvelle aussi : vos trois colis Colissimo de mardi ont bien été livrés.";

export function ttsModel(env: Record<string, string | undefined> = process.env): string {
  const m = env.OPENAI_TTS_MODEL?.trim();
  return m && /^[a-z0-9][a-z0-9.\-_]{1,60}$/i.test(m) ? m : TTS_DEFAULT_MODEL;
}

/** Voix demandée (choix de l'utilisateur) ou voix du serveur (`OPENAI_TTS_VOICE`), sinon marin. */
export function ttsVoice(requested?: string | null, env: Record<string, string | undefined> = process.env): TtsVoice {
  for (const v of [requested, env.OPENAI_TTS_VOICE]) {
    const x = v?.trim().toLowerCase();
    if (x && (TTS_CHOICES as readonly string[]).includes(x)) return x as TtsVoice;
  }
  return TTS_DEFAULT_VOICE;
}

// ---------------------------------------------------------------------------
// Limite de débit (mémoire de l'instance ; le cache de l'application évite les répétitions)
// ---------------------------------------------------------------------------

export const TTS_RATE = { perUserPerHour: 60 } as const;
const recent = new Map<string, number[]>();

export function checkSpeechRate(userId: string, now = Date.now()): void {
  const hourAgo = now - 3_600_000;
  const list = (recent.get(userId) ?? []).filter((t) => t > hourAgo);
  if (list.length >= TTS_RATE.perUserPerHour) throw new AppError("RATE_LIMITED", "Trop de lectures vocales demandées : réessayez dans quelques minutes.");
  list.push(now);
  recent.set(userId, list);
  if (recent.size > 5_000) recent.clear();
}

export function resetSpeechRate() {
  recent.clear();
}

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

/** Sous-ensemble du SDK utilisé (simulable en test). */
export interface SpeechSdkLike {
  audio: { speech: { create(body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> } };
}

async function synthesize(input: string, voice: TtsVoice, deps: { sdk?: SpeechSdkLike; env?: Record<string, string | undefined> }, what: string): Promise<ArrayBuffer> {
  const env = deps.env ?? process.env;
  const model = ttsModel(env);
  try {
    const sdk = deps.sdk ?? (openAISdk() as unknown as SpeechSdkLike);
    const res = await sdk.audio.speech.create({ model, voice, input, instructions: TTS_INSTRUCTIONS, response_format: "mp3" });
    return await res.arrayBuffer();
  } catch (e) {
    // jamais masqué : configuration (clé, modèle), quota ou panne sont journalisés (sans secret)
    logApiError(e, model, false);
    if (e instanceof AppError) log.warn("synthèse vocale indisponible", { what, code: e.code, message: e.message });
    else log.warn("synthèse vocale en échec", { what, voice, model, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    throw aiError(e);
  }
}

export async function synthesizeAdvisorMessage(
  ctx: Pick<OrgContext, "supabase" | "organization" | "user">,
  messageId: string,
  opts: { voice?: string | null; sdk?: SpeechSdkLike; env?: Record<string, string | undefined>; now?: number } = {},
): Promise<ArrayBuffer> {
  const { data, error } = await ctx.supabase.from("advisor_messages").select("content, role").eq("id", messageId).eq("organization_id", ctx.organization.id).eq("user_id", ctx.user.id).maybeSingle();
  if (error) throw new AppError("INTERNAL", "Réponse illisible. Réessayez.");
  if (!data || data.role !== "assistant") throw new AppError("NOT_FOUND", "Réponse introuvable.");
  const input = speakableText(data.content, TTS_MAX_CHARS);
  if (!input) throw new AppError("VALIDATION", "Rien à lire pour cette réponse.");
  checkSpeechRate(ctx.user.id, opts.now);
  return synthesize(input, ttsVoice(opts.voice, opts.env), opts, "message");
}

/** Échantillon fixe pour comparer les voix (le quota IA est appliqué par la route). */
export function synthesizeVoiceSample(voice: string | null | undefined, opts: { sdk?: SpeechSdkLike; env?: Record<string, string | undefined> } = {}): Promise<ArrayBuffer> {
  return synthesize(TTS_SAMPLE_TEXT, ttsVoice(voice, opts.env), opts, "sample");
}
