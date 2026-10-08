"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireOrgContextForAction, getCurrentUser } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage, isAppError } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { publicEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import { changeRoleSchema, createOrganizationSchema, inviteMemberSchema, updateOrganizationSchema } from "@/features/organizations/schemas";

const log = createLogger("ORG");

function fieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
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
    await supabase.from("organizations").update(updates).eq("id", orgId);
  }
  log.info("organization created", { orgId, userId: user.id });
  redirect("/dashboard");
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgId = String(formData.get("organization_id") ?? "");
  const supabase = await createServerSupabaseClient();
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).eq("organization_id", orgId).maybeSingle();
  if (membership) {
    await supabase.from("user_profiles").update({ current_organization_id: orgId }).eq("user_id", user.id);
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
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
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
    if (error || !data) return fail(toUserMessage(fromPostgrestError(error ?? { message: "Invitation impossible" })));
    revalidatePath("/settings/users");
    // L'envoi d'email transactionnel n'est pas encore branché : le lien est affiché à l'administrateur.
    return ok({ link: `${publicEnv().NEXT_PUBLIC_APP_URL}/invite/${data.token}` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ admin: true });
  const id = String(formData.get("id") ?? "");
  await ctx.supabase.from("organization_invitations").delete().eq("id", id).eq("organization_id", ctx.organization.id);
  revalidatePath("/settings/users");
}

async function ownersCount(ctx: Awaited<ReturnType<typeof requireOrgContextForAction>>): Promise<number> {
  const { count } = await ctx.supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("role", "owner");
  return count ?? 0;
}

/**
 * Règles (doublées par la RLS) : seul un propriétaire attribue ou retire le rôle propriétaire ;
 * le dernier propriétaire ne peut être ni rétrogradé ni retiré.
 */
export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ admin: true });
  const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { data: target } = await ctx.supabase.from("organization_members").select("role").eq("organization_id", ctx.organization.id).eq("user_id", parsed.data.user_id).maybeSingle();
  if (!target) return;
  const touchesOwner = target.role === "owner" || parsed.data.role === "owner";
  if (touchesOwner && ctx.role !== "owner") return;
  if (target.role === "owner" && parsed.data.role !== "owner" && (await ownersCount(ctx)) <= 1) return; // dernier propriétaire
  await ctx.supabase.from("organization_members").update({ role: parsed.data.role }).eq("organization_id", ctx.organization.id).eq("user_id", parsed.data.user_id);
  revalidatePath("/settings/users");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ admin: true });
  const userId = String(formData.get("user_id") ?? "");
  if (userId === ctx.user.id) return;
  const { data: target } = await ctx.supabase.from("organization_members").select("role").eq("organization_id", ctx.organization.id).eq("user_id", userId).maybeSingle();
  if (!target) return;
  if (target.role === "owner" && (ctx.role !== "owner" || (await ownersCount(ctx)) <= 1)) return;
  await ctx.supabase.from("organization_members").delete().eq("organization_id", ctx.organization.id).eq("user_id", userId);
  revalidatePath("/settings/users");
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const appErr = fromPostgrestError(error);
    redirect(`/invite/${token}?error=${encodeURIComponent(isAppError(appErr) ? appErr.message : "Invitation invalide")}`);
  }
  redirect("/dashboard");
}
