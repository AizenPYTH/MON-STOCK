"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireOrgContextForAction, getCurrentUser } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { publicEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import { changeRoleSchema, createOrganizationSchema, inviteMemberSchema, memberRefSchema, updateOrganizationSchema } from "@/features/organizations/schemas";
import { feedbackCodeFromError, inviteErrorCode, organizationDbErrorMessage, type FeedbackCode } from "@/features/organizations/feedback";

const log = createLogger("ORG");

function fieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

/** Message utilisateur pour une erreur base : contraintes métier d'abord, puis traduction générique. */
function dbErrorMessage(error: { code?: string; message?: string; details?: string | null }): string {
  return organizationDbErrorMessage(error.message) ?? toUserMessage(fromPostgrestError(error));
}

function uniqueSlug(base: string): string {
  // Les organisations ne sont pas visibles avant adhésion : un suffixe aléatoire court évite les collisions.
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slugify(base)}-${suffix}`;
}

export async function createOrganizationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Connexion requise.");
  const parsed = createOrganizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrors(parsed.error.issues) });

  const supabase = await createServerSupabaseClient();
  const slug = uniqueSlug(parsed.data.name);
  const { data: orgId, error } = await supabase.rpc("create_organization_with_owner", { p_name: parsed.data.name, p_slug: slug, p_is_demo: false });
  if (error || !orgId) return fail(toUserMessage(fromPostgrestError(error ?? { message: "Création impossible" })));

  const updates: { country?: string; default_currency?: string } = {};
  if (parsed.data.country) updates.country = parsed.data.country;
  if (parsed.data.default_currency) updates.default_currency = parsed.data.default_currency;
  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await supabase.from("organizations").update(updates).eq("id", orgId);
    // L'organisation existe déjà : on ne bloque pas l'utilisateur, les paramètres restent modifiables ensuite.
    if (updErr) log.warn("organization settings not applied", { orgId, reason: updErr.message });
  }
  log.info("organization created", { orgId, userId: user.id });
  redirect("/dashboard");
}

/**
 * Changement d'organisation active : uniquement vers une organisation dont l'utilisateur est membre
 * (vérifié ici ET par le trigger user_profiles_enforce_current_org en base).
 */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?error=session_expired");
  const parsed = memberRefSchema.shape.organization_id.safeParse(formData.get("organization_id"));
  if (!parsed.success) redirect("/dashboard");
  const orgId = parsed.data;
  const supabase = await createServerSupabaseClient();
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).eq("organization_id", orgId).maybeSingle();
  if (membership) {
    const { error } = await supabase.from("user_profiles").update({ current_organization_id: orgId }).eq("user_id", user.id);
    if (error) log.warn("organization switch refused", { userId: user.id, orgId, reason: error.message });
    revalidatePath("/", "layout");
  } else {
    log.warn("organization switch to non-member organization", { userId: user.id, orgId });
  }
  redirect("/dashboard");
}

export async function updateOrganizationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = updateOrganizationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrors(parsed.error.issues) });
    const current = (ctx.organization.settings ?? {}) as Record<string, Json>;
    const settings: Record<string, Json> = {
      ...current,
      default_shipping_cost: parsed.data.default_shipping_cost === "" || parsed.data.default_shipping_cost === undefined ? null : parsed.data.default_shipping_cost,
      vat_rate: parsed.data.vat_rate === "" || parsed.data.vat_rate === undefined ? null : parsed.data.vat_rate,
    };
    const { error } = await ctx.supabase
      .from("organizations")
      .update({
        name: parsed.data.name,
        country: parsed.data.country || null,
        default_currency: parsed.data.default_currency,
        settings,
      })
      .eq("id", ctx.organization.id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/settings/organization");
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function inviteMemberAction(_prev: ActionResult<{ link: string }> | null, formData: FormData): Promise<ActionResult<{ link: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrors(parsed.error.issues) });
    const { data, error } = await ctx.supabase
      .from("organization_invitations")
      .insert({ organization_id: ctx.organization.id, email: parsed.data.email, role: parsed.data.role, invited_by: ctx.user.id })
      .select("token")
      .single();
    if (error || !data) return fail(dbErrorMessage(error ?? { message: "Invitation impossible" }));
    revalidatePath("/settings/users");
    // L'envoi d'email transactionnel n'est pas encore branché : le lien est affiché à l'administrateur.
    return ok({ link: `${publicEnv().NEXT_PUBLIC_APP_URL}/invite/${data.token}` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

const USERS_PATH = "/settings/users";

/**
 * Les actions de gestion des membres sont des actions de formulaire (sans JavaScript) :
 * elles ne lèvent jamais, et redirigent avec un code de retour affiché par la page.
 * Session expirée → page de connexion (retour sur la page des utilisateurs ensuite).
 */
function finishMemberAction(code: FeedbackCode | "session_expired"): never {
  if (code === "session_expired") redirect(`/login?error=session_expired&next=${encodeURIComponent(USERS_PATH)}`);
  revalidatePath(USERS_PATH);
  redirect(`${USERS_PATH}?status=${code}`);
}

async function runMemberAction(fn: () => Promise<FeedbackCode>): Promise<never> {
  let code: FeedbackCode | "session_expired";
  try {
    code = await fn();
  } catch (e) {
    log.warn("member action failed", { reason: toUserMessage(e) });
    code = feedbackCodeFromError(e);
  }
  finishMemberAction(code);
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  await runMemberAction(async () => {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = memberRefSchema.pick({ id: true }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return "invalid";
    const { data, error } = await ctx.supabase.from("organization_invitations").delete().eq("id", parsed.data.id).eq("organization_id", ctx.organization.id).select("id");
    if (error) return feedbackCodeFromError(error) as FeedbackCode;
    return data && data.length > 0 ? "invitation_revoked" : "not_found";
  });
}

async function ownersCount(ctx: Awaited<ReturnType<typeof requireOrgContextForAction>>): Promise<number> {
  const { count } = await ctx.supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("role", "owner");
  return count ?? 0;
}

/**
 * Règles (doublées par la RLS et des triggers en base) : seul un propriétaire attribue ou retire
 * le rôle propriétaire ; personne ne modifie son propre rôle ; le dernier propriétaire ne peut
 * être ni rétrogradé ni retiré.
 */
export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  await runMemberAction(async () => {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return "invalid";
    if (parsed.data.user_id === ctx.user.id) return "self_role";
    const { data: target } = await ctx.supabase.from("organization_members").select("role").eq("organization_id", ctx.organization.id).eq("user_id", parsed.data.user_id).maybeSingle();
    if (!target) return "not_found";
    if (target.role === parsed.data.role) return "role_updated";
    const touchesOwner = target.role === "owner" || parsed.data.role === "owner";
    if (touchesOwner && ctx.role !== "owner") return "owner_only";
    if (target.role === "owner" && (await ownersCount(ctx)) <= 1) return "last_owner";
    const { data, error } = await ctx.supabase
      .from("organization_members")
      .update({ role: parsed.data.role })
      .eq("organization_id", ctx.organization.id)
      .eq("user_id", parsed.data.user_id)
      .select("user_id");
    if (error) return feedbackCodeFromError(error) as FeedbackCode;
    return data && data.length > 0 ? "role_updated" : "forbidden";
  });
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  await runMemberAction(async () => {
    const ctx = await requireOrgContextForAction({ admin: true });
    const parsed = memberRefSchema.pick({ user_id: true }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return "invalid";
    const userId = parsed.data.user_id;
    if (userId === ctx.user.id) return "self_remove";
    const { data: target } = await ctx.supabase.from("organization_members").select("role").eq("organization_id", ctx.organization.id).eq("user_id", userId).maybeSingle();
    if (!target) return "not_found";
    if (target.role === "owner" && ctx.role !== "owner") return "owner_only";
    if (target.role === "owner" && (await ownersCount(ctx)) <= 1) return "last_owner";
    const { data, error } = await ctx.supabase.from("organization_members").delete().eq("organization_id", ctx.organization.id).eq("user_id", userId).select("user_id");
    if (error) return feedbackCodeFromError(error) as FeedbackCode;
    return data && data.length > 0 ? "member_removed" : "forbidden";
  });
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const parsed = memberRefSchema.pick({ token: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard");
  const token = parsed.data.token;
  const invitePath = `/invite/${encodeURIComponent(token)}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?error=session_expired&next=${encodeURIComponent(invitePath)}`);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    log.warn("invitation refused", { userId: user.id, reason: error.message });
    redirect(`${invitePath}?error=${inviteErrorCode(error.message)}`);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
