import type { Database } from "@/db/database.types";
import { createOrganizationSchema } from "@/features/organizations/schemas";
import { uniqueOrganizationSlug } from "@/lib/slug";
import type { MobileSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export interface Membership {
  role: OrgRole;
  organization: { id: string; name: string; slug: string; isDemo: boolean; currency: string; settings: unknown };
}

export interface OrgPermissions {
  canWrite: boolean;
  isAdmin: boolean;
}

/** Mêmes règles que le web (src/features/auth/dal.ts : canWrite / isAdmin) ; la RLS reste l'arbitre. */
export function permissionsFor(role: OrgRole): OrgPermissions {
  return { canWrite: role !== "viewer", isAdmin: role === "owner" || role === "admin" };
}

export const ROLE_LABEL: Record<OrgRole, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecture seule" };

/** Organisations de l'utilisateur (RLS : seules celles dont il est membre sont visibles). */
export async function loadMemberships(supabase: MobileSupabase, userId: string): Promise<{ memberships: Membership[]; profileOrgId: string | null }> {
  const [members, profile] = await Promise.all([
    supabase.from("organization_members").select("role, organization:organizations(id, name, slug, is_demo, default_currency, settings)").eq("user_id", userId),
    supabase.from("user_profiles").select("current_organization_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (members.error) throw members.error;
  const memberships: Membership[] = (members.data ?? [])
    .filter((m) => m.organization !== null)
    .map((m) => ({
      role: m.role,
      organization: {
        id: m.organization!.id,
        name: m.organization!.name,
        slug: m.organization!.slug,
        isDemo: m.organization!.is_demo,
        currency: m.organization!.default_currency,
        settings: m.organization!.settings,
      },
    }))
    .sort((a, b) => a.organization.name.localeCompare(b.organization.name, "fr"));
  return { memberships, profileOrgId: profile.data?.current_organization_id ?? null };
}

/** Organisation active : choix mémorisé sur l'appareil s'il est toujours valide, sinon celle du profil, sinon la première. */
export function pickActiveOrganization(memberships: readonly Membership[], storedId: string | null, profileOrgId: string | null): Membership | null {
  return memberships.find((m) => m.organization.id === storedId) ?? memberships.find((m) => m.organization.id === profileOrgId) ?? memberships[0] ?? null;
}

export async function createOrganization(supabase: MobileSupabase, input: { name: string }): Promise<string> {
  const parsed = createOrganizationSchema.safeParse({ name: input.name });
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Nom invalide.", "VALIDATION");
  const { data, error } = await supabase.rpc("create_organization_with_owner", {
    p_name: parsed.data.name,
    p_slug: uniqueOrganizationSlug(parsed.data.name),
    p_is_demo: false,
  });
  if (error || !data) throw new UserFacingError(error ? userMessage(error) : "Création impossible.", "CREATE_FAILED");
  return data;
}
