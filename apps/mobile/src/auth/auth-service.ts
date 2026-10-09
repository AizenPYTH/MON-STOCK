import * as Linking from "expo-linking";
import { resetPasswordSchema, signInSchema, signUpSchema, updatePasswordSchema } from "@/features/auth/schemas";
import { callbackErrorCode, loginErrorMessage } from "@/features/auth/messages";
import { requireSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * Opérations d'authentification (Supabase Auth, directement : aucune donnée métier ici).
 * Validation par les MÊMES schémas que le web ; messages d'erreur traduits, jamais bruts.
 */

export type FieldErrors = Record<string, string>;
export type AuthResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: FieldErrors };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "_");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** URL de retour des liens email : monstock://auth/callback (schéma déclaré dans app.json). */
export function authRedirectUrl(next?: string): string {
  return Linking.createURL("/auth/callback", next ? { queryParams: { next } } : undefined);
}

export async function signIn(input: { email: string; password: string }): Promise<AuthResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez les champs.", fieldErrors: fieldErrors(parsed.error.issues) };
  try {
    const { error } = await requireSupabase().auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { ok: false, error: userMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

export async function signUp(input: { email: string; password: string; full_name: string }): Promise<AuthResult<{ needsConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez les champs.", fieldErrors: fieldErrors(parsed.error.issues) };
  try {
    const { data, error } = await requireSupabase().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: authRedirectUrl() },
    });
    if (error) return { ok: false, error: userMessage(error) };
    return { ok: true, data: { needsConfirmation: !data.session } };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

export async function requestPasswordReset(input: { email: string }): Promise<AuthResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez les champs.", fieldErrors: fieldErrors(parsed.error.issues) };
  try {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(parsed.data.email, { redirectTo: authRedirectUrl("/update-password") });
    // Réponse identique que le compte existe ou non (pas d'énumération des comptes), sauf limite de débit.
    if (error && /rate limit|too many/i.test(error.message)) return { ok: false, error: userMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

export async function updatePassword(input: { password: string; confirm: string }): Promise<AuthResult> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez les champs.", fieldErrors: fieldErrors(parsed.error.issues) };
  try {
    const { error } = await requireSupabase().auth.updateUser({ password: parsed.data.password });
    if (error) return { ok: false, error: userMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

export async function signOut(): Promise<void> {
  // Déconnexion locale garantie même hors ligne (la session est retirée du trousseau).
  await requireSupabase().auth.signOut({ scope: "local" });
}

/** Chemins internes autorisés après un lien email (jamais une URL externe). */
const ALLOWED_NEXT = new Set(["/update-password", "/"]);

export function safeNext(next: unknown): "/update-password" | "/" {
  return typeof next === "string" && ALLOWED_NEXT.has(next) ? (next as "/update-password" | "/") : "/";
}

/**
 * Retour d'un lien email (confirmation d'inscription, mot de passe oublié) : échange du code
 * PKCE contre une session. Le vérificateur PKCE est dans le trousseau de CET appareil : un lien
 * ouvert sur un autre appareil échoue avec un message explicite.
 */
export async function completeAuthCallback(params: { code?: string; error_code?: string; error_description?: string; next?: string }): Promise<{ ok: true; next: "/update-password" | "/" } | { ok: false; error: string }> {
  const next = safeNext(params.next);
  if (params.error_code || params.error_description) {
    return { ok: false, error: loginErrorMessage(callbackErrorCode({ errorCode: params.error_code ?? null, next })) ?? "Lien invalide." };
  }
  if (!params.code) return { ok: false, error: loginErrorMessage("link_invalid") ?? "Lien invalide." };
  try {
    const { error } = await requireSupabase().auth.exchangeCodeForSession(params.code);
    if (error) {
      const code = (error as { code?: string }).code ?? null;
      return { ok: false, error: loginErrorMessage(callbackErrorCode({ errorCode: code, next, exchangeFailed: true })) ?? "Lien invalide." };
    }
    return { ok: true, next };
  } catch (e) {
    throw new UserFacingError(userMessage(e));
  }
}
