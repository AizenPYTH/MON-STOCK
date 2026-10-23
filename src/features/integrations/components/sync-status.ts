import type { Json } from "@/db/database.types";
import type { StatusTone } from "@/components/ui/status-badge";

/**
 * Présentation des statuts de synchronisation (module pur, testé, utilisable côté client).
 *
 * Un passage arrêté par son budget de temps (moteur : `BUDGET_REACHED_MESSAGE`, statut « partial »)
 * n'est PAS une erreur : il s'est arrêté proprement après la dernière étape confirmée et reprend au
 * passage suivant. Il se lit donc comme une reprise normale (ton « info »), jamais en ambre ou en rouge.
 * Le préfixe ci-dessous doit rester le début de `BUDGET_REACHED_MESSAGE` (vérifié par un test).
 */
export const BUDGET_RESUME_PREFIX = "Budget de temps atteint";
/** Code de l'entrée de journal posée par le moteur quand le budget est atteint (`BUDGET_REACHED_CODE`). */
export const BUDGET_RESUME_CODE = "SYNC_BUDGET_REACHED";

/** Le message (dernière erreur d'une connexion, résumé d'un run) annonce-t-il une reprise programmée ? */
export function isBudgetResume(message: string | null | undefined): boolean {
  return typeof message === "string" && message.trimStart().startsWith(BUDGET_RESUME_PREFIX);
}

/** Autres erreurs signalées en plus de l'arrêt programmé (« … (+2 autre(s)) » ajouté par le moteur). */
export function extraErrorsAfterResume(message: string | null | undefined): number {
  if (!isBudgetResume(message)) return 0;
  const m = /\(\+(\d+) autre\(s\)\)\s*$/.exec(message ?? "");
  return m ? Number(m[1]) : 0;
}

type RunLike = { status: string; stats?: Json | null; error_summary?: string | null; error_count?: number | null };

function statsFlag(stats: Json | null | undefined, key: string): boolean {
  return Boolean(stats && typeof stats === "object" && !Array.isArray(stats) && (stats as Record<string, unknown>)[key] === true);
}

/** Passage « partial » arrêté par le budget de temps (reprise au prochain passage). */
export function runStoppedByBudget(run: RunLike): boolean {
  return run.status === "partial" && (statsFlag(run.stats, "budget_reached") || isBudgetResume(run.error_summary));
}

/**
 * Erreurs RÉELLES d'un passage : l'entrée « budget atteint » que le moteur ajoute au journal est un
 * arrêt programmé, pas une erreur ; elle est retirée du compte affiché (elle reste dans le journal).
 */
export function runIssueCount(run: RunLike): number {
  const total = Math.max(0, run.error_count ?? 0);
  return runStoppedByBudget(run) ? Math.max(0, total - 1) : total;
}

export interface StatusView {
  tone: StatusTone;
  label: string;
  /** Explication courte (infobulle, lecteur d'écran). */
  hint?: string;
}

/** Statut d'un passage de synchronisation. */
export function runStatusView(run: RunLike): StatusView {
  switch (run.status) {
    case "success":
      return { tone: "success", label: "Réussie" };
    case "failed":
      return { tone: "danger", label: "Échouée" };
    case "running":
      return { tone: "pending", label: "En cours" };
    case "partial":
      return runStoppedByBudget(run)
        ? { tone: "info", label: "Reprise prévue", hint: "Budget de temps atteint : arrêt propre après la dernière étape confirmée, reprise au prochain passage. Aucune donnée perdue." }
        : { tone: "warning", label: "Partielle", hint: "Certains éléments n'ont pas pu être traités ; ils sont repris au prochain passage." };
    default:
      return { tone: "neutral", label: run.status };
  }
}

/** Statut d'une connexion de canal (eBay…). */
export function connectionStatusView(status: string | null | undefined): StatusView {
  switch (status) {
    case "connected":
      return { tone: "success", label: "Connecté" };
    case "error":
      return { tone: "warning", label: "Erreur à vérifier" };
    case "expired":
      return { tone: "danger", label: "Autorisation expirée" };
    case "pending":
      return { tone: "pending", label: "En attente d'autorisation" };
    case "disconnected":
      return { tone: "neutral", label: "Déconnecté" };
    case "unconfigured":
      return { tone: "neutral", label: "Non configuré" };
    case null:
    case undefined:
      return { tone: "neutral", label: "Non connecté" };
    default:
      return { tone: "neutral", label: status };
  }
}
