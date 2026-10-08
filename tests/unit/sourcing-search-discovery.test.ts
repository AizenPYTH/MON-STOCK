import { describe, expect, it } from "vitest";
import { discoveryDecision, runDiscoveryWithTimeout } from "@/services/sourcing/discovery/search-discovery";
import { readDiscoveryConfig } from "@/services/sourcing/discovery/web-search-providers";
import type { DiscoveryReport } from "@/services/sourcing/discovery/discovery-service";

const enabled = readDiscoveryConfig({ SOURCING_DISCOVERY_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "key-12345678" });
const disabled = readDiscoveryConfig({});
const report: DiscoveryReport = { enabled: true, provider: "brave", message: "Découverte via l'API Brave Search — 2 requête(s)", queries: [], candidates: [], counts: { new: 0, already_known: 0, rejected: 0, skipped: 0 }, startedAt: "", finishedAt: "" };

describe("découverte pendant la recherche : décision et délai propre", () => {
  it("désactivée sans API : message honnête, procédure visible pour les administrateurs", () => {
    const d = discoveryDecision({ config: disabled, canWrite: true, isAdmin: true, parsed: { kind: "structured" }, live: true });
    expect(d.run).toBe(false);
    if (!d.run) {
      expect(d.panel).toMatchObject({ configured: false, state: "disabled", isAdmin: true });
      expect(d.panel.message).toBe("Découverte désactivée : aucune API de recherche configurée");
    }
  });

  it("réservée au rôle écriture, jamais sur requête vide ni sans recherche en direct", () => {
    expect(discoveryDecision({ config: enabled, canWrite: false, isAdmin: false, parsed: { kind: "structured" }, live: true })).toMatchObject({ run: false, panel: { state: "not_allowed" } });
    expect(discoveryDecision({ config: enabled, canWrite: true, isAdmin: false, parsed: { kind: "empty" }, live: true })).toMatchObject({ run: false, panel: { state: "skipped" } });
    expect(discoveryDecision({ config: enabled, canWrite: true, isAdmin: false, parsed: { kind: "text" }, live: false })).toMatchObject({ run: false, panel: { state: "skipped" } });
    expect(discoveryDecision({ config: enabled, canWrite: true, isAdmin: false, parsed: { kind: "text" }, live: true })).toEqual({ run: true });
  });

  it("résultat dans le délai ; au-delà : non bloquant, poursuite en arrière-plan ; erreur : message", async () => {
    const done = await runDiscoveryWithTimeout(async () => report, { timeoutMs: 1000, isAdmin: false, provider: "brave" });
    expect(done).toMatchObject({ state: "done", report, message: report.message });
    let late: unknown = null;
    const slow = await runDiscoveryWithTimeout(() => new Promise<DiscoveryReport>((_r, reject) => setTimeout(() => reject(new Error("tard")), 30)), { timeoutMs: 5, isAdmin: false, provider: "brave", onLateError: (e) => (late = e) });
    expect(slow.state).toBe("timeout");
    expect(slow.message).toMatch(/arrière-plan/);
    await new Promise((r) => setTimeout(r, 50));
    expect(late).toBeInstanceOf(Error);
    const failed = await runDiscoveryWithTimeout(async () => Promise.reject(new Error("quota")), { timeoutMs: 1000, isAdmin: false, provider: "brave" });
    expect(failed).toMatchObject({ state: "error", message: "Découverte en échec : quota" });
  });
});
