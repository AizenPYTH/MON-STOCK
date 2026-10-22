import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { Organization, OrgRole, UserProfile } from "@/db/types";
import { AppError } from "@/lib/errors";
import { DISPLAYED_ORGANIZATION_HEADER, parseDisplayedOrganization } from "@/lib/displayed-organization";

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
  /**
   * Vrai si l'organisation mémorisée dans le profil n'est plus accessible (adhésion retirée,
   * organisation supprimée, aucune mémorisée) et qu'une autre a été retenue à sa place (W-28) :
   * l'interface le signale au lieu de basculer en silence.
   */
  fallback?: boolean;
}

/**
 * Résout l'organisation active d'un utilisateur à partir d'un client Supabase qui agit EN SON
 * NOM (RLS). `preferredOrganizationId` (en-tête X-Organization-Id du mobile) prime sur
 * l'organisation mémorisée dans le profil ; il doit désigner une organisation dont
 * l'utilisateur est membre, sinon `null` (l'appelant refuse l'accès).
 */
export async function resolveOrgContext(
  supabase: ServerSupabaseClient,
  user: User,
  preferredOrganizationId?: string | null,
): Promise<OrgContext | null> {
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("organization_members").select("role, organization:organizations(id, name, slug, is_demo)").eq("user_id", user.id),
  ]);

  const memberships = (members ?? [])
    .filter((m) => m.organization !== null)
    .map((m) => ({ organization: m.organization as Pick<Organization, "id" | "name" | "slug" | "is_demo">, role: m.role }));

  if (memberships.length === 0) return null;

  let current: (typeof memberships)[number] | undefined;
  let fallback = false;
  if (preferredOrganizationId) {
    current = memberships.find((m) => m.organization.id === preferredOrganizationId);
    if (!current) return null;
  } else {
    const wantedId = profile?.current_organization_id ?? null;
    current = memberships.find((m) => m.organization.id === wantedId);
    if (!current) {
      // Organisation mémorisée perdue (le retrait d'un membre remet current_organization_id à null en
      // base) : on retient la première adhésion, mais on le signale (W-28).
      current = memberships[0];
      fallback = true;
    }
  }
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

  return { supabase, user, profile: effectiveProfile, organization, role: current.role, memberships, fallback };
}

export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  // getCurrentUser() est mis en cache pour la requête : un seul aller-retour de validation du JWT.
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();
  return resolveOrgContext(supabase, user);
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
  assertDisplayedOrganization(ctx, await displayedOrganizationFromRequest());
  if (options.admin && !["owner", "admin"].includes(ctx.role)) {
    throw new AppError("FORBIDDEN", "Cette action est réservée aux administrateurs de l'organisation.");
  }
  if (options.write && ctx.role === "viewer") {
    throw new AppError("FORBIDDEN", "Votre rôle (lecture seule) ne permet pas cette action.");
  }
  return ctx;
}

/**
 * Organisation affichée par l'onglet qui envoie la requête (en-tête posé par le navigateur, voir
 * src/lib/displayed-organization.ts), ou null : formulaire sans JavaScript, client ancien, appel hors
 * requête (tests). Absente, la vérification est simplement sautée (comportement antérieur).
 */
async function displayedOrganizationFromRequest(): Promise<string | null> {
  try {
    return parseDisplayedOrganization((await headers()).get(DISPLAYED_ORGANIZATION_HEADER));
  } catch {
    return null;
  }
}

/** Message lorsque l'onglet affiche une autre organisation que l'organisation active (W-07). */
export function organizationChangedMessage(displayedName: string, activeName: string): string {
  return `Cet onglet affiche l'organisation « ${displayedName} », mais l'organisation active est maintenant « ${activeName} » (changée dans un autre onglet). Rien n'a été enregistré : rechargez la page pour continuer.`;
}

/**
 * Refuse une action si l'onglet affiche une autre organisation que celle retenue par le serveur
 * (W-07) : plus aucune écriture silencieuse dans l'organisation choisie depuis un autre onglet.
 */
export function assertDisplayedOrganization(ctx: Pick<OrgContext, "organization" | "memberships">, displayedId: string | null): void {
  if (!displayedId || displayedId === ctx.organization.id.toLowerCase()) return;
  const displayed = ctx.memberships.find((m) => m.organization.id.toLowerCase() === displayedId);
  if (!displayed) {
    throw new AppError("FORBIDDEN", "Vous n'avez plus accès à l'organisation affichée dans cet onglet. Rien n'a été enregistré : rechargez la page.", {
      action: { label: "Recharger", href: "/dashboard" },
    });
  }
  throw new AppError("CONFLICT", organizationChangedMessage(displayed.organization.name, ctx.organization.name), {
    action: { label: "Recharger", href: "/dashboard" },
    details: { displayedOrganizationId: displayedId, activeOrganizationId: ctx.organization.id },
  });
}

export function canWrite(role: OrgRole): boolean {
  return role !== "viewer";
}

export function isAdmin(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}
