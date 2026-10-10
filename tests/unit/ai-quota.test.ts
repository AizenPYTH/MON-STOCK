import { describe, expect, it } from "vitest";
import { AI_LIMITS, enforceAiQuota } from "@/services/ai/quota";
import { fakeSupabase } from "./helpers/fake-supabase";

/** Quotas IA : contrôlés AVANT tout appel à Claude ; l'événement est journalisé sous la session de l'utilisateur. */
const ctx = (count: number) => {
  const user = fakeSupabase({ ai_usage_events: { data: null, count } });
  return { user, ctx: { supabase: user.client, organization: { id: "org-1" }, user: { id: "u-1" } } as never };
};

describe("quotas IA", () => {
  it("sous la limite : événement enregistré pour l'utilisateur et l'organisation", async () => {
    const { ctx: c, user } = ctx(3);
    const admin = fakeSupabase({ ai_usage_events: { data: null, count: 10 } });
    await enforceAiQuota(c, "assistant", new Date("2026-10-10T12:00:00Z"), admin.client);
    const insert = user.queries.flatMap((q) => q.calls).find((x) => x.method === "insert");
    expect(insert?.args[0]).toEqual({ organization_id: "org-1", user_id: "u-1", kind: "assistant" });
    const filters = user.queries[0]!.calls;
    expect(filters).toContainEqual({ method: "eq", args: ["user_id", "u-1"] });
    expect(filters).toContainEqual({ method: "gte", args: ["created_at", "2026-10-10T11:00:00.000Z"] });
  });

  it("limite horaire de l'utilisateur atteinte : refus, rien n'est journalisé", async () => {
    const { ctx: c, user } = ctx(AI_LIMITS.assistantPerHour);
    await expect(enforceAiQuota(c, "assistant", new Date(), fakeSupabase({ ai_usage_events: { count: 0 } }).client)).rejects.toThrow(/par heure/);
    expect(user.queries.flatMap((q) => q.calls).some((x) => x.method === "insert")).toBe(false);
  });

  it("limite quotidienne de l'organisation atteinte : refus", async () => {
    const { ctx: c } = ctx(0);
    await expect(enforceAiQuota(c, "product_draft", new Date(), fakeSupabase({ ai_usage_events: { count: AI_LIMITS.orgPerDay } }).client)).rejects.toThrow(/quotidienne/);
  });
});
