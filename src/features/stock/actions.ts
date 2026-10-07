"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage, AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { addSkuSchema, adjustStockSchema, createProductSchema, emptyToNull, fieldErrorsOf, updateProductSchema, updateSkuSchema } from "@/features/stock/schemas";
import type { Json } from "@/db/database.types";

const log = createLogger("STOCK");

type SkuJson = Record<string, Json>;

function variantPayload(d: { variant_name?: string; condition?: string; grade?: string; storage?: string; color?: string; ean?: string; mpn?: string }): SkuJson {
  const attributes: Record<string, string> = {};
  if (d.storage) attributes.storage = d.storage;
  if (d.color) attributes.color = d.color;
  if (d.grade) attributes.grade = d.grade;
  const autoName = [d.storage, d.color, d.grade ? `Grade ${d.grade}` : null].filter(Boolean).join(" / ");
  return {
    name: d.variant_name || autoName || "Standard",
    condition: d.condition ?? "unknown",
    grade: emptyToNull(d.grade),
    ean: emptyToNull(d.ean),
    mpn: emptyToNull(d.mpn),
    attributes,
  };
}

function skuPayload(d: { code: string; barcode?: string; cost_price?: number | ""; sale_price?: number | ""; location?: string; reorder_point?: number | ""; safety_stock?: number | ""; lead_time_days?: number | ""; default_supplier_id?: string }, currency: string): SkuJson {
  return {
    code: d.code,
    barcode: emptyToNull(d.barcode),
    cost_price: emptyToNull(d.cost_price),
    sale_price: emptyToNull(d.sale_price),
    currency,
    location: emptyToNull(d.location),
    reorder_point: emptyToNull(d.reorder_point) ?? 0,
    safety_stock: emptyToNull(d.safety_stock) ?? 0,
    lead_time_days: emptyToNull(d.lead_time_days),
    default_supplier_id: emptyToNull(d.default_supplier_id),
  };
}

function translateCreateError(e: { code?: string; message?: string }): string {
  if (e.message?.includes("SKU_CODE_EXISTS")) return "Ce code SKU existe déjà dans votre organisation.";
  if (e.message?.includes("PRODUCT_NOT_FOUND")) return "Produit introuvable.";
  return toUserMessage(fromPostgrestError(e));
}

export async function createProductAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let code: string;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = createProductSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const { data, error } = await ctx.supabase.rpc("create_sku", {
      p_organization_id: ctx.organization.id,
      p_product: { name: d.name, brand: emptyToNull(d.brand), category: emptyToNull(d.category), description: emptyToNull(d.description), image_url: emptyToNull(d.image_url) },
      p_variant: variantPayload(d),
      p_sku: skuPayload(d, ctx.organization.default_currency),
      p_initial_quantity: emptyToNull(d.initial_quantity) ?? 0,
    });
    if (error) return fail(translateCreateError(error));
    log.info("product created", { orgId: ctx.organization.id, result: data });
    code = d.code;
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath("/stock");
  redirect(`/stock/${encodeURIComponent(code)}`);
}

export async function addSkuAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let code: string;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = addSkuSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const { error } = await ctx.supabase.rpc("create_sku", {
      p_organization_id: ctx.organization.id,
      p_product_id: d.product_id,
      p_variant: variantPayload(d),
      p_sku: skuPayload(d, ctx.organization.default_currency),
      p_initial_quantity: emptyToNull(d.initial_quantity) ?? 0,
    });
    if (error) return fail(translateCreateError(error));
    code = d.code;
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath("/stock");
  redirect(`/stock/${encodeURIComponent(code)}`);
}

export async function updateSkuAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = updateSkuSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const { data: sku, error: skuErr } = await ctx.supabase
      .from("skus")
      .update({
        barcode: emptyToNull(d.barcode),
        cost_price: emptyToNull(d.cost_price),
        sale_price: emptyToNull(d.sale_price),
        location: emptyToNull(d.location),
        reorder_point: emptyToNull(d.reorder_point) ?? 0,
        safety_stock: emptyToNull(d.safety_stock) ?? 0,
        lead_time_days: emptyToNull(d.lead_time_days),
        default_supplier_id: emptyToNull(d.default_supplier_id),
        ...(d.is_active ? { is_active: d.is_active === "true" } : {}),
      })
      .eq("id", d.sku_id)
      .eq("organization_id", ctx.organization.id)
      .select("code, variant_id")
      .single();
    if (skuErr || !sku) return fail(toUserMessage(fromPostgrestError(skuErr ?? { message: "SKU introuvable" })));

    if (d.variant_name !== undefined || d.condition || d.grade !== undefined || d.ean !== undefined || d.mpn !== undefined) {
      const { error: vErr } = await ctx.supabase
        .from("product_variants")
        .update({
          ...(d.variant_name ? { name: d.variant_name } : {}),
          ...(d.condition ? { condition: d.condition } : {}),
          grade: emptyToNull(d.grade),
          ean: emptyToNull(d.ean),
          mpn: emptyToNull(d.mpn),
        })
        .eq("id", sku.variant_id);
      if (vErr) return fail(toUserMessage(fromPostgrestError(vErr)));
    }
    revalidatePath("/stock");
    revalidatePath(`/stock/${encodeURIComponent(sku.code)}`);
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function updateProductAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = updateProductSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const { error } = await ctx.supabase
      .from("products")
      .update({ name: d.name, brand: emptyToNull(d.brand), category: emptyToNull(d.category), description: emptyToNull(d.description), image_url: emptyToNull(d.image_url) })
      .eq("id", d.product_id)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath("/stock");
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function adjustStockAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = adjustStockSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const inbound = d.type === "receipt" || d.type === "return" || d.type === "transfer_in" || (d.type !== "transfer_out" && d.direction === "in");
    const signed = inbound ? d.quantity : -d.quantity;
    const { data, error } = await ctx.supabase.rpc("apply_inventory_movement", {
      p_organization_id: ctx.organization.id,
      p_sku_id: d.sku_id,
      p_type: d.type,
      p_quantity: signed,
      p_reference_type: "manual",
      p_channel: "manual",
      p_note: emptyToNull(d.note) ?? undefined,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    const { data: sku } = await ctx.supabase.from("skus").select("code").eq("id", d.sku_id).single();
    log.info("stock adjusted", { orgId: ctx.organization.id, skuId: d.sku_id, quantity: signed, type: d.type, after: data?.quantity_after });
    revalidatePath("/stock");
    if (sku) revalidatePath(`/stock/${encodeURIComponent(sku.code)}`);
    revalidatePath("/dashboard");
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function applyPendingSalesAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const skuId = String(formData.get("sku_id") ?? "");
  const code = String(formData.get("code") ?? "");
  const { error } = await ctx.supabase.rpc("apply_pending_sales_for_sku", { p_sku_id: skuId });
  if (error) throw new AppError("INTERNAL", toUserMessage(fromPostgrestError(error)));
  revalidatePath(`/stock/${encodeURIComponent(code)}`);
  revalidatePath("/stock");
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const productId = String(formData.get("product_id") ?? "");
  const archive = String(formData.get("archive") ?? "true") === "true";
  await ctx.supabase.from("products").update({ is_archived: archive }).eq("id", productId).eq("organization_id", ctx.organization.id);
  await ctx.supabase.from("skus").update({ is_active: !archive }).eq("product_id", productId).eq("organization_id", ctx.organization.id);
  revalidatePath("/stock");
  redirect("/stock");
}
