import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { fromPostgrestError } from "@/lib/errors";

/** Fournisseurs actifs de l'organisation (choix du fournisseur d'un import ou d'un flux), sous RLS. */
export async function activeSupplierOptions(ctx: OrgContext): Promise<{ id: string; name: string }[]> {
  const { data, error } = await ctx.supabase.from("suppliers").select("id, name").eq("organization_id", ctx.organization.id).eq("is_archived", false).order("name").limit(500);
  if (error) throw fromPostgrestError(error);
  return data ?? [];
}
