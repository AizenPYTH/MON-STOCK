import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { SupplierSource } from "@/db/types";

/**
 * Source MANUAL d'un fournisseur, créée à la première saisie d'offre. Module serveur ordinaire
 * (pas un fichier « use server ») : ce helper interne n'est pas exposé comme Server Action.
 */
export async function ensureManualSource(ctx: OrgContext, supplierId: string, supplierName: string): Promise<SupplierSource> {
  const { data: existing } = await ctx.supabase.from("supplier_sources").select("*").eq("organization_id", ctx.organization.id).eq("supplier_id", supplierId).eq("source_type", "MANUAL").maybeSingle();
  if (existing) return existing;
  const { data, error } = await ctx.supabase
    .from("supplier_sources")
    .insert({ organization_id: ctx.organization.id, supplier_id: supplierId, name: `Saisie manuelle — ${supplierName}`, source_type: "MANUAL", automated_access_confirmed: true, access_conditions: "Données saisies par l'utilisateur.", status: "active", sync_frequency: "manual" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Source manuelle non créée : ${error?.message ?? "inconnu"}`);
  return data;
}
