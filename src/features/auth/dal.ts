import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { Organization, OrgRole, UserProfile } from "@/db/types";
import { AppError } from "@/lib/errors";

/**
 * Data Access Layer d'authentification. Toutes les pages et actions passent par ici :
 * c'est la seule source de vérité pour « qui est connecté » et « dans quelle organisation ».
 */

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export interface OrgContext {
  supabase: ServerSupabaseClient;
  user: User;
  profile: UserProfile;
  organization: Organization;
  role: OrgRole;
  memberships: Array<{ organization: Pick<Organization, "id" | "name" | "slug" | "is_demo">; role: OrgRole }>;
}

export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  // getCurrentUser() est mis en cache pour la requête : un seul aller-retour de validation du JWT.
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("organization_members").select("role, organization:organizations(id, name, slug, is_demo)").eq("user_id", user.id),
  ]);

  const memberships = (members ?? [])
    .filter((m) => m.organization !== null)
    .map((m) => ({ organization: m.organization as Pick<Organization, "id" | "name" | "slug" | "is_demo">, role: m.role }));

  if (memberships.length === 0) return null;

  const wantedId = profile?.current_organization_id ?? null;
  const current = memberships.find((m) => m.organization.id === wantedId) ?? memberships[0];
  if (!current) return null;

  const { data: organization } = await supabase.from("organizations").select("*").eq("id", current.organization.id).single();
  if (!organization) return null;

  const effectiveProfile: UserProfile =
    profile ?? {
      user_id: user.id,
      email: user.email ?? "",
      full_name: null,
      current_organization_id: organization.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  return { supabase, user, profile: effectiveProfile, organization, role: current.role, memberships };
});

/** Pour les pages de l'application : redirige vers /onboarding si aucune organisation. */
export async function requireOrgContext(): Promise<OrgContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

/** Message affiché lorsqu'une Server Action est appelée sans session valide (JWT expiré, déconnexion ailleurs…). */
export const SESSION_EXPIRED_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer : votre saisie n'a pas été enregistrée.";

/**
 * Pour les Server Actions : lève une AppError (pas de redirect dans une action de formulaire).
 * Le proxy laisse passer les appels d'actions sans session : c'est ICI que l'authentification
 * est vérifiée (getUser() valide le JWT auprès de Supabase), puis l'appartenance et le rôle.
 */
export async function requireOrgContextForAction(options: { write?: boolean; admin?: boolean } = {}): Promise<OrgContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("AUTH_REQUIRED", SESSION_EXPIRED_MESSAGE, { action: { label: "Se reconnecter", href: "/login" } });
  }
  const ctx = await getOrgContext();
  if (!ctx) {
    throw new AppError("FORBIDDEN", "Vous n'êtes membre d'aucune organisation active (accès retiré ?).", { action: { label: "Choisir une organisation", href: "/onboarding" } });
  }
  if (options.admin && !["owner", "admin"].includes(ctx.role)) {
    throw new AppError("FORBIDDEN", "Cette action est réservée aux administrateurs de l'organisation.");
  }
  if (options.write && ctx.role === "viewer") {
    throw new AppError("FORBIDDEN", "Votre rôle (lecture seule) ne permet pas cette action.");
  }
  return ctx;
}

export function canWrite(role: OrgRole): boolean {
  return role !== "viewer";
}

export function isAdmin(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}
