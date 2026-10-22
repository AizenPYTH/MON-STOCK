import { describe, expect, it } from "vitest";
import { AI_LIMITS, aiMeter, enforceAiQuota, reserveAiUsage } from "@/services/ai/quota";
import { fakeSupabase } from "./helpers/fake-supabase";

/**
 * Quotas IA (S-09, S-10, I-14) : réservation ATOMIQUE en base (fonction SQL ai_reserve_usage, service_role),
 * AVANT tout appel au modèle, et FAIL-CLOSED : si le quota ne peut pas être vérifié, la demande est refusée.
 */
const ctx = { organization: { id: "org-1" }, user: { id: "u-1" } };

describe("quotas IA", () => {
  it("sous la limite : une seule RPC atomique (pas de lecture puis insertion), aucun accès direct à la table", async () => {
    const admin = fakeSupabase({ "rpc:ai_reserve_usage": { data: { allowed: true, reason: null, event_id: "evt-1" } } });
    await expect(reserveAiUsage(ctx, "assistant", admin.client)).resolves.toBe("evt-1");
    expect(admin.queries.map((q) => q.target)).toEqual(["rpc:ai_reserve_usage"]);
    expect(admin.queries[0]!.calls[0]!.args[0]).toEqual({
      p_organization_id: "org-1",
      p_user_id: "u-1",
      p_kind: "assistant",
      p_user_limit: AI_LIMITS.assistantPerHour,
      p_user_window_seconds: 3600,
      p_org_limit: AI_LIMITS.orgPerDay,
      p_org_window_seconds: 86_400,
      p_org_kinds: ["assistant", "product_draft"],
      p_org_token_limit: AI_LIMITS.orgTokensPerDay,
      p_burst_limit: AI_LIMITS.assistantPerMinute,
      p_burst_window_seconds: 60,
    });
  });

  it("chaque appel au modèle et chaque lecture vocale ont leur propre quota", async () => {
    const admin = fakeSupabase({ "rpc:ai_reserve_usage": { data: { allowed: true, event_id: "e" } } });
    await reserveAiUsage(ctx, "model_call", admin.client);
    await reserveAiUsage(ctx, "speech", admin.client);
    const [call, speech] = admin.queries.map((q) => q.calls[0]!.args[0] as Record<string, unknown>);
    expect(call).toMatchObject({ p_kind: "model_call", p_user_limit: AI_LIMITS.modelCallsPerUserPerHour, p_org_limit: AI_LIMITS.modelCallsPerOrgPerDay, p_org_kinds: ["model_call"], p_org_token_limit: AI_LIMITS.orgTokensPerDay });
    expect(speech).toMatchObject({ p_kind: "speech", p_user_limit: AI_LIMITS.speechPerUserPerHour, p_org_limit: AI_LIMITS.speechPerOrgPerDay, p_org_kinds: ["speech"], p_org_token_limit: null });
  });

  it("refus de la base : message clair selon la limite atteinte", async () => {
    const refuse = (reason: string) => fakeSupabase({ "rpc:ai_reserve_usage": { data: { allowed: false, reason, event_id: null } } }).client;
    await expect(enforceAiQuota(ctx, "assistant", refuse("user_limit"))).rejects.toThrow(/40 demandes à l'IA par heure/);
    await expect(enforceAiQuota(ctx, "assistant", refuse("burst_limit"))).rejects.toThrow(/d'affilée/);
    await expect(enforceAiQuota(ctx, "product_draft", refuse("org_limit"))).rejects.toThrow(/quotidienne/);
    await expect(enforceAiQuota(ctx, "model_call", refuse("org_tokens"))).rejects.toThrow(/Budget IA quotidien/);
    await expect(enforceAiQuota(ctx, "speech", refuse("user_limit"))).rejects.toThrow(/lectures vocales/);
    await expect(enforceAiQuota(ctx, "assistant", refuse("not_member"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(enforceAiQuota(ctx, "assistant", refuse("user_limit"))).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("FAIL-CLOSED : erreur de la base, exception réseau ou réponse illisible ⇒ refus (503), jamais d'appel non compté", async () => {
    const failing = [
      fakeSupabase({ "rpc:ai_reserve_usage": { error: { code: "PGRST202", message: "function not found" } } }).client,
      fakeSupabase({ "rpc:ai_reserve_usage": { data: null } }).client,
      fakeSupabase({ "rpc:ai_reserve_usage": { data: { allowed: "yes" } } }).client,
      fakeSupabase({ "rpc:ai_reserve_usage": { data: { allowed: true } } }).client,
      { rpc: () => Promise.reject(new Error("fetch failed")) } as never,
    ];
    for (const admin of failing) await expect(enforceAiQuota(ctx, "assistant", admin)).rejects.toMatchObject({ code: "INTERNAL", status: 503, message: expect.stringMatching(/quota IA/) });
  });

  it("compteur des appels au modèle : réserve avant, enregistre les jetons après", async () => {
    const admin = fakeSupabase({ "rpc:ai_reserve_usage": { data: { allowed: true, event_id: "evt-9" } }, "rpc:ai_record_usage_tokens": { data: true } });
    const meter = aiMeter(ctx, admin.client);
    const id = await meter.beforeModelCall();
    await meter.afterModelCall(id, { inputTokens: 1200, outputTokens: 80 });
    await meter.afterModelCall(id, null);
    expect(admin.queries.map((q) => q.target)).toEqual(["rpc:ai_reserve_usage", "rpc:ai_record_usage_tokens"]);
    expect(admin.queries[1]!.calls[0]!.args[0]).toEqual({ p_event_id: "evt-9", p_input_tokens: 1200, p_output_tokens: 80 });
  });
});
