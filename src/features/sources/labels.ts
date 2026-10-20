/**
 * Sources fournisseurs et flux distants (web) — libellés et fonctions pures, repris de
 * l'application iPhone (sourcing-connections.tsx, sourcing-sources.tsx, sourcing-feed-new.tsx,
 * data/sourcing-b2b.ts, data/sourcing-live.ts).
 */
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import type { LibraryEntryDTO } from "@/services/sourcing/source-library";
import type { BadgeVariant } from "@/components/ui/badge";

export type Frequency = SourceOverviewDTO["frequency"];

/** Fréquences d'une source planifiable (POST /sourcing/sources/schedule). */
export const SCHEDULE_FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "manual", label: "Manuelle" },
  { value: "weekly", label: "1 fois / semaine" },
  { value: "daily", label: "1 fois / jour" },
  { value: "every_6_hours", label: "Toutes les 6 h" },
  { value: "hourly", label: "Toutes les heures" },
];

/** Fréquences proposées à la création d'un flux (le schéma serveur n'accepte pas « hebdomadaire »). */
export const FEED_FREQUENCIES: { value: Exclude<Frequency, "weekly">; label: string }[] = [
  { value: "daily", label: "1 fois / jour" },
  { value: "every_6_hours", label: "Toutes les 6 h" },
  { value: "hourly", label: "Toutes les heures" },
  { value: "manual", label: "Manuelle" },
];

export const SOURCE_STATUS_VARIANT: Record<SourceOverviewDTO["status"], BadgeVariant> = {
  connected: "success",
  to_configure: "warning",
  manual_import: "neutral",
  running: "info",
  error: "danger",
  disabled: "outline",
};

export const PRIMARY_ACTION_LABEL: Record<SourceOverviewDTO["primaryAction"], string> = {
  sync_now: "Synchroniser maintenant",
  import_file: "Importer la nouvelle liste",
  enable: "Réactiver",
  configure: "Configurer",
};

/** Âge lisible d'une donnée (« il y a 3 h », « il y a 5 j ») ; jamais synchronisée → « jamais ». Pur. */
export function ageText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "jamais";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export function isFailing(s: Pick<SourceOverviewDTO, "status" | "consecutiveFailures">): boolean {
  return s.status === "error" || s.consecutiveFailures > 0;
}

/**
 * Groupes affichés : synchronisation automatique (planifiable), recherche en direct (rien à
 * planifier), fichiers et saisie. Les sources en difficulté d'abord dans chaque groupe. Pur.
 */
export function groupSources(list: readonly SourceOverviewDTO[]): { automatic: SourceOverviewDTO[]; live: SourceOverviewDTO[]; manual: SourceOverviewDTO[] } {
  const sorted = [...list].sort((a, b) => Number(isFailing(b)) - Number(isFailing(a)));
  return {
    automatic: sorted.filter((s) => s.schedulable),
    live: sorted.filter((s) => s.kind === "live_search"),
    manual: sorted.filter((s) => !s.schedulable && s.kind !== "live_search"),
  };
}

/** Compteurs réels (actives = connectées ou en cours, offres exploitables, dernier succès). Pur. */
export function sourcesStats(list: readonly SourceOverviewDTO[]): { total: number; active: number; toFix: number; offers: number; lastSuccess: string | null } {
  return {
    total: list.length,
    active: list.filter((s) => s.status === "connected" || s.status === "running").length,
    toFix: list.filter(isFailing).length,
    offers: list.reduce((a, s) => a + s.activeOffers, 0),
    lastSuccess:
      list
        .map((s) => s.lastSuccessfulSyncAt)
        .filter((x): x is string => Boolean(x))
        .sort()
        .at(-1) ?? null,
  };
}

export type FeedAuthInput = { kind: "none" } | { kind: "header"; name: string; value: string } | { kind: "basic"; username: string; password: string };

/** Contrôles locaux avant l'envoi d'un flux (le serveur revalide tout, protection SSRF comprise). Pur. */
export function remoteFeedIssues(d: { url: string; auth: FeedAuthInput }): string[] {
  const issues: string[] = [];
  let u: URL | null = null;
  try {
    u = new URL(d.url.trim());
  } catch {
    issues.push("Collez le lien complet du flux (https://…).");
  }
  if (u && u.protocol !== "https:") issues.push("Le lien doit commencer par https:// (connexion chiffrée).");
  if (u && (u.username || u.password)) issues.push("Ne mettez pas d'identifiant dans le lien : utilisez la section « Authentification ».");
  if (d.auth.kind === "header" && (!/^[A-Za-z0-9-]{1,64}$/.test(d.auth.name) || !d.auth.value)) issues.push("En-tête d'authentification incomplet (nom en lettres, chiffres et tirets, et valeur).");
  if (d.auth.kind === "basic" && (!d.auth.username || !d.auth.password)) issues.push("Identifiant et mot de passe requis.");
  return issues;
}

// ---------------------------------------------------------------------------
// Bibliothèque de sources publiques vérifiées
// ---------------------------------------------------------------------------

export const LIBRARY_SEGMENT_LABEL: Record<LibraryEntryDTO["segment"], string> = {
  parts: "Pièces détachées",
  refurbished: "Reconditionné",
  lots: "Lots / déstockage",
  marketplace: "Marketplace (API officielle)",
};

export const LIBRARY_ACCESS_LABEL: Record<LibraryEntryDTO["access"], string> = {
  official_api: "API officielle",
  public_json: "Catalogue public (JSON)",
  public_html: "Catalogue public (plan du site + données structurées)",
};

export const CHECK_STATUS_LABEL: Record<string, string> = {
  ok: "Vérifiée en direct",
  robots_disallowed: "Refusée : robots.txt interdit l'accès",
  no_products: "Aucun produit avec prix trouvé",
  http_error: "Pas de catalogue lisible publiquement",
  unreachable: "Site injoignable",
  not_configured: "Clés requises sur le serveur",
};

/** Exemples relevés lors de la dernière vérification réelle (au plus 3, prix inconnu conservé null). Pur. */
export function sampleOf(entry: Pick<LibraryEntryDTO, "check">): { title: string; price: number | null; currency: string | null }[] {
  const s = entry.check?.sample;
  if (!Array.isArray(s)) return [];
  return s
    .filter((x): x is { title: string; price: number | null; currency: string | null } => Boolean(x) && typeof x === "object" && typeof (x as { title?: unknown }).title === "string")
    .map((x) => ({ title: x.title, price: typeof x.price === "number" && Number.isFinite(x.price) ? x.price : null, currency: typeof x.currency === "string" ? x.currency : null }))
    .slice(0, 3);
}

/** Activées / vérifiées et activables / non activables. Pur. */
export function groupLibrary<T extends Pick<LibraryEntryDTO, "sourceId" | "activatable">>(entries: readonly T[]): { active: T[]; ready: T[]; blocked: T[] } {
  return {
    active: entries.filter((e) => e.sourceId),
    ready: entries.filter((e) => !e.sourceId && e.activatable),
    blocked: entries.filter((e) => !e.sourceId && !e.activatable),
  };
}
