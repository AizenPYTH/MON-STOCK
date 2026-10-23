/**
 * W-10 : « Synchroniser maintenant » depuis le site (Server Action). La durée maximale est déclarée
 * par chaque page qui héberge le formulaire, et le moteur reçoit une échéance cohérente (il finalise
 * le run avant la coupure : jamais de run laissé « en cours »).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ options: [] as Array<{ deadlineAt?: number }> }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/dal", () => ({
  requireOrgContextForAction: async () => ({ user: { id: "u1" }, organization: { id: "o1" }, role: "owner" }),
}));
vi.mock("@/features/integrations/sync-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/integrations/sync-service")>();
  return {
    ...actual,
    syncConnectionNow: async (_ctx: unknown, _id: string, options: { deadlineAt?: number }) => {
      calls.options.push(options);
      return { result: { runId: "r1", status: "partial", stats: { errors: 0 }, durationMs: 1, errorSummary: null, connectionId: "c1", stoppedByBudget: true }, summary: "ok" };
    },
  };
});

const { WEB_SYNC_ACTION_MAX_DURATION_S, WEB_SYNC_ACTION_BUDGET_MS, WEB_SYNC_ACTION_MARGIN_MS, webSyncActionDeadline } = await import("@/features/integrations/sync-service");
const { syncNowAction } = await import("@/features/integrations/actions");
const { RUNNING_STALE_MINUTES, MAX_SYNC_RUN_BUDGET_MS, MIN_SYNC_RUN_BUDGET_MS } = await import("@/services/sync/engine");

const ROOT = path.resolve(import.meta.dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "page.tsx") out.push(p);
  }
  return out;
}

describe("W-10 : maxDuration des pages hôtes et échéance du moteur", () => {
  it("chaque page qui affiche « Synchroniser maintenant » déclare maxDuration = WEB_SYNC_ACTION_MAX_DURATION_S", () => {
    const hosts = walk(path.join(ROOT, "src/app")).filter((p) => fs.readFileSync(p, "utf8").includes("SyncNowForm"));
    expect(hosts.length).toBeGreaterThanOrEqual(3);
    for (const p of hosts) {
      const m = fs.readFileSync(p, "utf8").match(/^export const maxDuration = (\d+);$/m);
      expect(m, path.relative(ROOT, p)).not.toBeNull();
      expect(Number(m![1]), path.relative(ROOT, p)).toBe(WEB_SYNC_ACTION_MAX_DURATION_S);
    }
  });

  it("budget cohérent : marge de finalisation, dans les bornes du moteur, bien avant le seuil d'abandon", () => {
    expect(WEB_SYNC_ACTION_BUDGET_MS).toBe(WEB_SYNC_ACTION_MAX_DURATION_S * 1000 - WEB_SYNC_ACTION_MARGIN_MS);
    expect(WEB_SYNC_ACTION_MARGIN_MS).toBeGreaterThanOrEqual(20_000);
    expect(WEB_SYNC_ACTION_BUDGET_MS).toBeGreaterThanOrEqual(MIN_SYNC_RUN_BUDGET_MS);
    expect(WEB_SYNC_ACTION_BUDGET_MS).toBeLessThanOrEqual(MAX_SYNC_RUN_BUDGET_MS);
    expect(WEB_SYNC_ACTION_MAX_DURATION_S * 1000).toBeLessThan(RUNNING_STALE_MINUTES * 60_000);
    expect(webSyncActionDeadline(1_000)).toBe(1_000 + WEB_SYNC_ACTION_BUDGET_MS);
  });

  it("syncNowAction transmet au moteur une échéance comptée dès l'entrée dans l'action", async () => {
    const before = Date.now();
    const fd = new FormData();
    fd.set("connection_id", "00000000-0000-4000-8000-000000000001");
    fd.set("trigger", "manual");
    fd.set("scope", "full");
    const res = await syncNowAction(null, fd);
    expect(res.ok).toBe(true);
    const deadlineAt = calls.options.at(-1)?.deadlineAt;
    expect(deadlineAt).toBeGreaterThanOrEqual(before + WEB_SYNC_ACTION_BUDGET_MS);
    expect(deadlineAt).toBeLessThanOrEqual(Date.now() + WEB_SYNC_ACTION_BUDGET_MS);
  });
});
