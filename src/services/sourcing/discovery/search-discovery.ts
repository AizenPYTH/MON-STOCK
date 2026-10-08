/**
 * Découverte de sources pendant une recherche : lancée EN PARALLÈLE de la recherche en direct,
 * bornée par son propre délai, jamais bloquante pour l'affichage des offres.
 *
 * Conditions (toutes requises) : API de recherche configurée (SOURCING_DISCOVERY_PROVIDER),
 * utilisateur avec droit d'écriture (la découverte enregistre des fournisseurs « à valider »),
 * requête non vide, recherche en direct non désactivée. Sinon : panneau explicatif, aucune requête.
 */
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { readDiscoveryConfig, DISCOVERY_DISABLED_MESSAGE, type DiscoveryConfig } from "@/services/sourcing/discovery/web-search-providers";
import type { DiscoveryReport } from "@/services/sourcing/discovery/discovery-service";

/** délai propre de la découverte (indépendant du budget de 8 s par source de la recherche en direct) */
export const SEARCH_DISCOVERY_TIMEOUT_MS = 12_000;

export type DiscoveryRunState = "disabled" | "not_allowed" | "skipped" | "done" | "timeout" | "error";

export interface DiscoveryPanelData {
  /** une API de recherche est configurée */
  configured: boolean;
  state: DiscoveryRunState;
  message: string;
  provider: string | null;
  /** l'utilisateur peut administrer (affichage de la procédure d'activation) */
  isAdmin: boolean;
  report: DiscoveryReport | null;
}

export interface DiscoveryDecisionInput {
  config: Pick<DiscoveryConfig, "enabled" | "message" | "provider">;
  canWrite: boolean;
  isAdmin: boolean;
  parsed: Pick<ParsedQuery, "kind">;
  live: boolean;
}

/** Décision pure : faut-il lancer la découverte pour cette recherche ? (sinon, panneau à afficher) */
export function discoveryDecision(input: DiscoveryDecisionInput): { run: true } | { run: false; panel: DiscoveryPanelData } {
  const base = { configured: input.config.enabled, provider: input.config.enabled ? input.config.provider : null, isAdmin: input.isAdmin, report: null };
  if (!input.config.enabled) return { run: false, panel: { ...base, state: "disabled", message: input.config.message || DISCOVERY_DISABLED_MESSAGE } };
  if (!input.canWrite) return { run: false, panel: { ...base, state: "not_allowed", message: "Découverte réservée aux membres avec droit d'écriture (elle enregistre des fournisseurs à valider)." } };
  if (input.parsed.kind === "empty") return { run: false, panel: { ...base, state: "skipped", message: "Saisissez un produit pour découvrir de nouvelles sources." } };
  if (!input.live) return { run: false, panel: { ...base, state: "skipped", message: "Recherche sans interrogation en direct : découverte non lancée." } };
  return { run: true };
}

/** Exécute une découverte avec délai propre ; au-delà, elle se poursuit en arrière-plan (résultats visibles dans « Découvertes — à valider »). */
export async function runDiscoveryWithTimeout(run: () => Promise<DiscoveryReport>, opts: { timeoutMs?: number; isAdmin: boolean; provider: string | null; onLateError?: (e: unknown) => void }): Promise<DiscoveryPanelData> {
  const timeoutMs = opts.timeoutMs ?? SEARCH_DISCOVERY_TIMEOUT_MS;
  const base = { configured: true, provider: opts.provider, isAdmin: opts.isAdmin };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const promise = run();
  try {
    const outcome = await Promise.race([promise.then((report) => ({ kind: "report" as const, report })), new Promise<{ kind: "timeout" }>((resolve) => (timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs)))]);
    if (outcome.kind === "timeout") {
      promise.catch((e: unknown) => opts.onLateError?.(e));
      return { ...base, state: "timeout", message: `Découverte toujours en cours après ${Math.round(timeoutMs / 1000)} s : elle se poursuit en arrière-plan, les nouvelles sources apparaîtront dans « Découvertes — à valider ».`, report: null };
    }
    return { ...base, provider: outcome.report.provider ?? opts.provider, state: "done", message: outcome.report.message, report: outcome.report };
  } catch (e) {
    return { ...base, state: "error", message: `Découverte en échec : ${e instanceof Error ? e.message : String(e)}`, report: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function currentDiscoveryConfig(env: Record<string, string | undefined> = process.env): DiscoveryConfig {
  return readDiscoveryConfig(env);
}
