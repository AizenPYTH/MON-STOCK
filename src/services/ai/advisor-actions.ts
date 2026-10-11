import "server-only";
import { z } from "zod";
import type { OrgContext } from "@/features/auth/dal";
import type { AdvisorActionDTO, AdvisorActionDecisionDTO, AdvisorActionStatus, AdvisorActionType } from "@/features/mobile-api/contract";
import { applyManualMovement } from "@/features/stock/movement-service";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ToolContext } from "./assistant-tools";

const log = createLogger("AI_ADVISOR_ACTIONS");

/**
 * Actions du conseiller : PRÉPARATION (par un outil du modèle) puis DÉCISION (par l'utilisateur).
 *
 *   1. prepareAdvisorAction : insère une demande « pending » (session de l'utilisateur, RLS),
 *      valable 10 minutes, avec une phrase de confirmation exacte (action, objet, montant).
 *   2. decideAdvisorAction  : appelée UNIQUEMENT par la route /advisor/actions/confirm|cancel
 *      (bouton de l'application). Revérifie : propriétaire, organisation active, rôle rédacteur,
 *      statut « pending », non expirée ; réserve l'action atomiquement (pending → executing, une
 *      seule fois) ; revalide l'objet (stock / prix inchangés depuis la préparation) ; exécute avec
 *      la session de l'utilisateur (règles et RLS de la base) ; enregistre le résultat.
 * Une confirmation vaut pour CETTE action seulement : jamais pour les suivantes.
 */

export const ACTION_TTL_MS = 10 * 60_000;

type ActionRow = {
  id: string;
  organization_id: string;
  user_id: string;
  conversation_id: string | null;
  kind: AdvisorActionType;
  sku_id: string | null;
  payload: Record<string, unknown>;
  summary: string;
  amount: number | null;
  currency: string | null;
  status: AdvisorActionStatus;
  expires_at: string;
  result: Record<string, unknown> | null;
  error: string | null;
};

const ACTION_COLUMNS = "id, organization_id, user_id, conversation_id, kind, sku_id, payload, summary, amount, currency, status, expires_at, result, error";

export function actionToDTO(r: Pick<ActionRow, "id" | "kind" | "status" | "summary" | "amount" | "currency" | "expires_at" | "result" | "error">): AdvisorActionDTO {
  const outcome = r.error ?? (typeof r.result?.message === "string" ? r.result.message : null);
  return { id: r.id, type: r.kind, status: r.status, summary: r.summary, amount: r.amount === null ? null : Number(r.amount).toFixed(2), currency: r.currency, expiresAt: r.expires_at, outcome };
}

export async function prepareAdvisorAction(
  ctx: ToolContext & { org: OrgContext; conversationId: string },
  input: { kind: AdvisorActionType; skuId: string; summary: string; amount: string | null; currency: string | null; payload: Record<string, unknown> },
): Promise<AdvisorActionDTO> {
  const now = ctx.now ?? new Date();
  const { data, error } = await ctx.supabase
    .from("advisor_actions")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.org.user.id,
      conversation_id: ctx.conversationId,
      kind: input.kind,
      sku_id: input.skuId,
      payload: input.payload as never,
      summary: input.summary,
      amount: input.amount === null ? null : Number(input.amount),
      currency: input.currency,
      expires_at: new Date(now.getTime() + ACTION_TTL_MS).toISOString(),
    })
    .select(ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "préparation impossible");
  return actionToDTO(data as unknown as ActionRow);
}

const adjustPayload = z.object({ change: z.number().int(), reason: z.enum(["receipt", "adjustment", "return", "correction"]), note: z.string().nullable(), expectedAvailable: z.number().int(), code: z.string() });
const pricePayload = z.object({ newPrice: z.string().regex(/^\d+(\.\d{1,2})?$/), expectedPrice: z.number().nullable(), code: z.string() });

type Admin = ReturnType<typeof createAdminSupabaseClient>;

async function finish(admin: Admin, id: string, status: AdvisorActionStatus, patch: { result?: Record<string, unknown>; error?: string }, now: Date): Promise<ActionRow> {
  const { data, error } = await admin
    .from("advisor_actions")
    .update({ status, decided_at: now.toISOString(), result: (patch.result ?? null) as never, error: patch.error?.slice(0, 400) ?? null })
    .eq("id", id)
    .select(ACTION_COLUMNS)
    .single();
  if (error || !data) throw new AppError("INTERNAL", "Résultat de l'action non enregistré : vérifiez l'état dans l'application.");
  return data as unknown as ActionRow;
}

async function notice(ctx: OrgContext, conversationId: string | null, text: string) {
  if (!conversationId) return;
  await ctx.supabase.from("advisor_messages").insert({ organization_id: ctx.organization.id, conversation_id: conversationId, user_id: ctx.user.id, role: "notice", content: text });
}

async function execute(ctx: OrgContext, row: ActionRow): Promise<{ message: string; result: Record<string, unknown> }> {
  if (!row.sku_id) throw new AppError("VALIDATION", "Action sans objet : annulée.");
  if (row.kind === "adjust_stock") {
    const p = adjustPayload.parse(row.payload);
    const { data: cur, error } = await ctx.supabase.from("v_stock_overview").select("quantity_available").eq("organization_id", ctx.organization.id).eq("sku_id", row.sku_id).maybeSingle();
    if (error || !cur) throw new AppError("NOT_FOUND", "SKU introuvable : action annulée.");
    if ((cur.quantity_available ?? 0) !== p.expectedAvailable) {
      throw new AppError("CONFLICT", `Le stock de ${p.code} a changé depuis la préparation (${p.expectedAvailable} → ${cur.quantity_available ?? 0}) : rien n'a été modifié. Redemandez l'ajustement.`);
    }
    const r = await applyManualMovement(ctx, { sku_id: row.sku_id, type: p.reason, direction: p.change > 0 ? "in" : "out", quantity: Math.abs(p.change), note: p.note ? `Conseiller IA : ${p.note}` : "Conseiller IA (confirmé par l'utilisateur)" });
    return { message: `Stock de ${p.code} mis à jour : ${r.quantityAfter ?? "?"} disponible(s).`, result: { quantityAfter: r.quantityAfter } };
  }
  const p = pricePayload.parse(row.payload);
  let q = ctx.supabase.from("skus").update({ sale_price: Number(p.newPrice) }).eq("organization_id", ctx.organization.id).eq("id", row.sku_id);
  q = p.expectedPrice === null ? q.is("sale_price", null) : q.eq("sale_price", p.expectedPrice);
  const { data, error } = await q.select("id, sale_price");
  if (error) throw new AppError("FORBIDDEN", "Modification refusée par la base (droits ou règle) : rien n'a été modifié.");
  if (!data || data.length !== 1) throw new AppError("CONFLICT", `Le prix de ${p.code} a changé depuis la préparation : rien n'a été modifié. Redemandez le changement.`);
  return { message: `Prix de vente de ${p.code} mis à jour dans MON STOCK (${p.newPrice.replace(".", ",")} ${row.currency ?? ""}). Les annonces eBay sont inchangées.`.replace(/\s+\)/, ")"), result: { salePrice: data[0]!.sale_price } };
}

export async function decideAdvisorAction(ctx: OrgContext, actionId: string, decision: "confirm" | "cancel", deps: { admin?: Admin; now?: Date } = {}): Promise<AdvisorActionDecisionDTO> {
  const now = deps.now ?? new Date();
  // Lecture sous la session de l'utilisateur : RLS → seulement SES actions, dans une organisation dont il est membre.
  const { data: own, error } = await ctx.supabase.from("advisor_actions").select(ACTION_COLUMNS).eq("id", actionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (error) throw new AppError("INTERNAL", "Action illisible. Réessayez.");
  const row = own as unknown as ActionRow | null;
  if (!row || row.user_id !== ctx.user.id) throw new AppError("NOT_FOUND", "Action introuvable (ou préparée par un autre utilisateur).");
  if (row.status !== "pending") return { action: actionToDTO(row), message: "Cette action a déjà été traitée." };
  const admin = deps.admin ?? createAdminSupabaseClient();

  if (decision === "cancel") {
    const { data } = await admin.from("advisor_actions").update({ status: "cancelled", decided_at: now.toISOString() }).eq("id", row.id).eq("status", "pending").select(ACTION_COLUMNS).maybeSingle();
    const final = (data as unknown as ActionRow | null) ?? row;
    await notice(ctx, row.conversation_id, `Action annulée par l'utilisateur : ${row.summary}`);
    return { action: actionToDTO(final), message: "Action annulée : rien n'a été modifié." };
  }

  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    const final = await finish(admin, row.id, "expired", { error: "Demande expirée (10 min) : rien n'a été modifié." }, now);
    return { action: actionToDTO(final), message: "Demande expirée : rien n'a été modifié. Redemandez-la au conseiller." };
  }
  if (ctx.role === "viewer") {
    throw new AppError("FORBIDDEN", "Votre rôle (lecture seule) ne permet pas d'exécuter cette action.");
  }
  // Réservation atomique : une seule exécution, même en cas de double appui ou de rejeu.
  const { data: claimed } = await admin.from("advisor_actions").update({ status: "executing" }).eq("id", row.id).eq("status", "pending").gt("expires_at", now.toISOString()).select(ACTION_COLUMNS).maybeSingle();
  if (!claimed) return { action: actionToDTO(row), message: "Cette action est déjà en cours ou traitée." };

  try {
    const done = await execute(ctx, claimed as unknown as ActionRow);
    const final = await finish(admin, row.id, "executed", { result: { message: done.message, ...done.result } }, now);
    log.info("action du conseiller exécutée", { orgId: ctx.organization.id, actionId: row.id, kind: row.kind });
    await notice(ctx, row.conversation_id, `Action confirmée et exécutée : ${done.message}`);
    return { action: actionToDTO(final), message: done.message };
  } catch (e) {
    const message = e instanceof AppError ? e.message : "Exécution impossible : rien n'a été modifié.";
    const final = await finish(admin, row.id, "failed", { error: message }, now);
    log.warn("action du conseiller en échec", { orgId: ctx.organization.id, actionId: row.id, kind: row.kind, error: message });
    await notice(ctx, row.conversation_id, `Action confirmée mais non exécutée : ${message}`);
    return { action: actionToDTO(final), message };
  }
}
