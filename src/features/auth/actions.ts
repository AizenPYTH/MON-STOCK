"use server";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { fail, ok, type ActionResult } from "@/lib/result";
import { createLogger } from "@/lib/logger";
import { resetPasswordSchema, signInSchema, signUpSchema, updatePasswordSchema } from "@/features/auth/schemas";

const log = createLogger("AUTH");

function fieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "_");
    (out[k] ??= []).push(i.message);
  }
  return out;
}

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Votre adresse email n'est pas encore confirmée. Vérifiez votre boîte de réception.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cette adresse email.";
  if (m.includes("password should be at least")) return "Le mot de passe est trop court.";
  if (m.includes("rate limit") || m.includes("too many requests")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("same_password")) return "Le nouveau mot de passe doit être différent de l'ancien.";
  return `Authentification impossible : ${message}`;
}

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrors(parsed.error.issues) });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    log.warn("sign-in failed", { reason: error.message });
    return fail(translateAuthError(error.message));
  }
  redirect(safeNext(parsed.data.next));
}

export async function signUpAction(_prev: ActionResult<{ needsConfirmation: boolean }> | null, formData: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrors(parsed.error.issues) });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    log.warn("sign-up failed", { reason: error.message });
    return fail(translateAuthError(error.message));
  }
  // Si la confirmation d'email est désactivée côté Supabase, une session existe déjà.
  if (data.session) redirect("/onboarding");
  return ok({ needsConfirmation: true });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(_prev: ActionResult<{ sent: boolean }> | null, formData: FormData): Promise<ActionResult<{ sent: boolean }>> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Adresse email invalide.", { fieldErrors: fieldErrors(parsed.error.issues) });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/update-password`,
  });
  if (error) {
    log.warn("password reset failed", { reason: error.message });
    return fail(translateAuthError(error.message));
  }
  return ok({ sent: true });
}

export async function updatePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrors(parsed.error.issues) });
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Le lien de réinitialisation a expiré. Demandez un nouveau lien.", { action: { label: "Nouveau lien", href: "/reset-password" } });
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(translateAuthError(error.message));
  redirect("/dashboard");
}
