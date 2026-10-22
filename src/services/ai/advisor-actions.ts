import "server-only";
import { z } from "zod";
import type { OrgContext } from "@/features/auth/dal";
import type { AdvisorActionDTO, AdvisorActionDecisionDTO, AdvisorActionStatus, AdvisorActionType } from "@/features/mobile-api/contract";
import { stockErrorMessage } from "@/features/stock/db-errors";
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
 *      seule fois, claimed_at) ; puis advisor_execute_action (SQL, session de l'utilisateur) fait EN
 *      UNE TRANSACTION le contrôle « stock / prix attendu », le mouvement ou le prix, et le statut
 *      « executed » (audit S-19) : une erreur annule tout, rien n'est modifié à moitié.
 *   3. Une action restée « executing » (instance arrêtée) est reprise : advisor_recover_stuck_actions
 *      la passe en « failed » (rien n'a été modifié, l'exécution étant atomique).
 * Une confirmation vaut pour CETTE action seulement : jamais pour les suivantes.
 * Les notes de l'application (« Action confirmée… ») sont écrites par le serveur (service_role) dans
 * la conversation de l'utilisateur, après vérification de sa propriété.
 */

export const ACTION_TTL_MS = 10 * 60_000;
/** Une action « executing » depuis plus longtemps est considérée interrompue (reprise). */
export const ACTION_STUCK_AFTER = "2 minutes";

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

/** Enregistre la décision ; `from` : seulement si l'action est encore dans cet état (sinon null). */
async function finish(admin: Admin, id: string, status: AdvisorActionStatus, patch: { result?: Record<string, unknown>; error?: string }, now: Date, from?: AdvisorActionStatus): Promise<ActionRow | null> {
  let q = admin
    .from("advisor_actions")
    .update({ status, decided_at: now.toISOString(), result: (patch.result ?? null) as never, error: patch.error?.slice(0, 400) ?? null })
    .eq("id", id);
  if (from) q = q.eq("status", from);
  const { data, error } = await q.select(ACTION_COLUMNS).maybeSingle();
  if (error) throw new AppError("INTERNAL", "Résultat de l'action non enregistré : vérifiez l'état dans l'application.");
  if (!data && !from) throw new AppError("INTERNAL", "Résultat de l'action non enregistré : vérifiez l'état dans l'application.");
  return (data as unknown as ActionRow | null) ?? null;
}

async function reread(admin: Admin, id: string): Promise<ActionRow | null> {
  const { data } = await admin.from("advisor_actions").select(ACTION_COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as ActionRow | null) ?? null;
}

/** Note de l'application dans la conversation de l'utilisateur (écrite par le serveur, S-10). */
async function notice(ctx: OrgContext, admin: Admin, conversationId: string | null, text: string) {
  if (!conversationId) return;
  // Propriété vérifiée sous la session de l'utilisateur (RLS : ses conversations seulement).
  const { data: conv } = await ctx.supabase.from("advisor_conversations").select("id").eq("id", conversationId).eq("organization_id", ctx.organization.id).eq("user_id", ctx.user.id).maybeSingle();
  if (!conv) return;
  const { error } = await admin.from("advisor_messages").insert({ organization_id: ctx.organization.id, conversation_id: conversationId, user_id: ctx.user.id, role: "notice", content: text.slice(0, 12_000) });
  if (error) log.warn("note de l'application non enregistrée", { orgId: ctx.organization.id, code: error.code ?? null });
}

/** Erreur de advisor_execute_action → message utilisateur (rien n'a été modifié : transaction annulée). */
export function executionErrorMessage(row: Pick<ActionRow, "payload">, e: { code?: string; message?: string; details?: string | null }): string {
  const code = typeof row.payload?.code === "string" ? row.payload.code : "ce SKU";
  const msg = e.message ?? "";
  if (msg.includes("ADVISOR_STOCK_CHANGED")) {
    const expected = typeof row.payload?.expectedAvailable === "number" ? row.payload.expectedAvailable : "?";
    return `Le stock de ${code} a changé depuis la préparation (${expected} → ${e.details ?? "?"}) : rien n'a été modifié. Redemandez l'ajustement.`;
  }
  if (msg.includes("ADVISOR_PRICE_CHANGED")) return `Le prix de ${code} a changé depuis la préparation : rien n'a été modifié. Redemandez le changement.`;
  if (msg.includes("SKU_NOT_FOUND")) return "SKU introuvable : rien n'a été modifié.";
  if (msg.includes("ADVISOR_ACTION_INVALID")) return "Action invalide : rien n'a été modifié.";
  if (msg.includes("ADVISOR_ACTION_NOT_CLAIMED") || msg.includes("ADVISOR_ACTION_NOT_FOUND")) return "Cette action n'est plus en attente : rien n'a été modifié.";
  if (msg.includes("FORBIDDEN") || e.code === "42501") return "Modification refusée par la base (droits ou règle) : rien n'a été modifié.";
  const stock = stockErrorMessage(e);
  return stock ? `${stock} Rien n'a été modifié.` : "Exécution impossible : rien n'a été modifié.";
}

function successMessage(row: ActionRow, result: Record<string, unknown>): string {
  if (row.kind === "adjust_stock") {
    const p = adjustPayload.safeParse(row.payload);
    const code = p.success ? p.data.code : String(result.code ?? "");
    return `Stock de ${code} mis à jour : ${typeof result.quantityAfter === "number" ? result.quantityAfter : "?"} disponible(s).`;
  }
  const p = pricePayload.safeParse(row.payload);
  const price = p.success ? p.data.newPrice : String(result.salePrice ?? "");
  const code = p.success ? p.data.code : String(result.code ?? "");
  return `Prix de vente de ${code} mis à jour dans MON STOCK (${price.replace(".", ",")} ${row.currency ?? ""}). Les annonces eBay sont inchangées.`.replace(/\s+\)/, ")");
}

export async function decideAdvisorAction(ctx: OrgContext, actionId: string, decision: "confirm" | "cancel", deps: { admin?: Admin; now?: Date } = {}): Promise<AdvisorActionDecisionDTO> {
  const now = deps.now ?? new Date();
  // Lecture sous la session de l'utilisateur : RLS → seulement SES actions, dans une organisation dont il est membre.
  const { data: own, error } = await ctx.supabase.from("advisor_actions").select(ACTION_COLUMNS).eq("id", actionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (error) throw new AppError("INTERNAL", "Action illisible. Réessayez.");
  const row = own as unknown as ActionRow | null;
  if (!row || row.user_id !== ctx.user.id) throw new AppError("NOT_FOUND", "Action introuvable (ou préparée par un autre utilisateur).");
  const admin = deps.admin ?? createAdminSupabaseClient();
  if (row.status === "executing") {
    // Instance arrêtée pendant une exécution : reprise (atomique → rien n'a été modifié).
    const { data: recovered } = await admin.rpc("advisor_recover_stuck_actions", { p_older_than: ACTION_STUCK_AFTER, p_action_id: row.id });
    if (typeof recovered === "number" && recovered > 0) {
      const final = (await reread(admin, row.id)) ?? row;
      return { action: actionToDTO(final), message: final.error ?? "Exécution interrompue : rien n'a été modifié. Redemandez l'action au conseiller." };
    }
    return { action: actionToDTO(row), message: "Cette action est déjà en cours d'exécution." };
  }
  if (row.status !== "pending") return { action: actionToDTO(row), message: "Cette action a déjà été traitée." };

  if (decision === "cancel") {
    const { data } = await admin.from("advisor_actions").update({ status: "cancelled", decided_at: now.toISOString() }).eq("id", row.id).eq("status", "pending").select(ACTION_COLUMNS).maybeSingle();
    const final = (data as unknown as ActionRow | null) ?? row;
    await notice(ctx, admin, row.conversation_id, `Action annulée par l'utilisateur : ${row.summary}`);
    return { action: actionToDTO(final), message: "Action annulée : rien n'a été modifié." };
  }

  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    const final = (await finish(admin, row.id, "expired", { error: "Demande expirée (10 min) : rien n'a été modifié." }, now, "pending")) ?? row;
    return { action: actionToDTO(final), message: "Demande expirée : rien n'a été modifié. Redemandez-la au conseiller." };
  }
  if (ctx.role === "viewer") {
    throw new AppError("FORBIDDEN", "Votre rôle (lecture seule) ne permet pas d'exécuter cette action.");
  }
  // Réservation atomique : une seule exécution, même en cas de double appui ou de rejeu.
  const { data: claimed } = await admin.from("advisor_actions").update({ status: "executing", claimed_at: now.toISOString() }).eq("id", row.id).eq("status", "pending").gt("expires_at", now.toISOString()).select(ACTION_COLUMNS).maybeSingle();
  if (!claimed) return { action: actionToDTO(row), message: "Cette action est déjà en cours ou traitée." };

  // Contrôle « valeur attendue » + modification + statut « executed » : une seule transaction SQL,
  // sous la session de l'utilisateur (ses droits, auth.uid()).
  const { data: result, error: execError } = await ctx.supabase.rpc("advisor_execute_action", { p_action_id: row.id });
  if (execError) {
    const message = executionErrorMessage(row, execError);
    // Seulement si l'action est toujours « executing » (si la transaction avait abouti malgré une
    // erreur de transport, l'action est « executed » et le reste).
    const final = (await finish(admin, row.id, "failed", { error: message }, now, "executing")) ?? (await reread(admin, row.id)) ?? row;
    if (final.status === "executed") return { action: actionToDTO(final), message: "Action exécutée." };
    log.warn("action du conseiller en échec", { orgId: ctx.organization.id, actionId: row.id, kind: row.kind, code: execError.code ?? null });
    await notice(ctx, admin, row.conversation_id, `Action confirmée mais non exécutée : ${message}`);
    return { action: actionToDTO(final), message };
  }
  const values = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : {};
  const message = successMessage(row, values);
  const final = (await finish(admin, row.id, "executed", { result: { message, ...values } }, now, "executed")) ?? (await reread(admin, row.id)) ?? { ...row, status: "executed" as const };
  log.info("action du conseiller exécutée", { orgId: ctx.organization.id, actionId: row.id, kind: row.kind });
  await notice(ctx, admin, row.conversation_id, `Action confirmée et exécutée : ${message}`);
  return { action: actionToDTO(final), message };
}
