/**
 * Filtrage et tri de l'annuaire (pur, testé) : mêmes règles que la bibliothèque mobile
 * (apps/mobile/src/app/(app)/supplier-directory/index.tsx), pilotées par les paramètres d'URL.
 */
import type { AccessMethod, DirectoryEntry } from "@/features/directory/labels";

export type AccessView = "all" | "connected" | "connectable" | "pro" | "error";
export type DirectorySort = "priority" | "name" | "country" | "recent";
export type DirectoryLayout = "grid" | "table";

export const ACCESS_VIEWS: { value: AccessView; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "connected", label: "Connectés" },
  { value: "connectable", label: "Connectables" },
  { value: "pro", label: "Compte pro" },
  { value: "error", label: "En erreur" },
];

export const SORTS: { value: DirectorySort; label: string }[] = [
  { value: "priority", label: "Pertinence" },
  { value: "name", label: "Nom" },
  { value: "country", label: "Pays" },
  { value: "recent", label: "Dernière synchro" },
];

export const SEGMENTS = ["A_refurb", "B_parts", "D_distributor", "C_liquidation", "E_specialist"] as const;

export const METHOD_FILTERS: AccessMethod[] = ["official_api", "catalog_feed", "portal_export", "manual_import", "public_integrated", "custom_development", "not_automatable"];

/** Méthodes qui permettent de brancher réellement le fournisseur dans MON STOCK. */
const CONNECTABLE: AccessMethod[] = ["official_api", "catalog_feed", "portal_export", "manual_import", "public_integrated"];

export interface DirectoryFilters {
  q: string;
  access: AccessView;
  segment: string;
  country: string;
  method: AccessMethod | "";
  sort: DirectorySort;
  layout: DirectoryLayout;
}

export const DEFAULT_FILTERS: DirectoryFilters = { q: "", access: "all", segment: "", country: "", method: "", sort: "priority", layout: "grid" };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Paramètres d'URL → filtres valides (toute valeur inconnue retombe sur la valeur par défaut). */
export function parseDirectoryFilters(sp: Record<string, string | string[] | undefined>): DirectoryFilters {
  const access = first(sp.access) as AccessView;
  const sort = first(sp.sort) as DirectorySort;
  const segment = first(sp.segment);
  const method = first(sp.method) as AccessMethod;
  const country = first(sp.country).toUpperCase();
  return {
    q: first(sp.q).trim().slice(0, 120),
    access: ACCESS_VIEWS.some((v) => v.value === access) ? access : "all",
    segment: (SEGMENTS as readonly string[]).includes(segment) ? segment : "",
    country: /^[A-Z]{2,3}$/.test(country) ? country : "",
    method: METHOD_FILTERS.includes(method) ? method : "",
    sort: SORTS.some((s) => s.value === sort) ? sort : "priority",
    layout: first(sp.layout) === "table" ? "table" : "grid",
  };
}

/** Filtres → chaîne de requête (valeurs par défaut omises), avec surcharge éventuelle. */
export function filtersQuery(f: DirectoryFilters, patch: Partial<DirectoryFilters> = {}): string {
  const merged = { ...f, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged) as [keyof DirectoryFilters, string][]) {
    if (v && v !== DEFAULT_FILTERS[k]) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Compteurs réels de l'annuaire (un fournisseur n'est « connecté » que sur preuve). Pur. */
export function directoryStats(entries: readonly DirectoryEntry[]) {
  return {
    total: entries.length,
    connected: entries.filter((e) => e.org.status === "connected").length,
    connectable: entries.filter((e) => e.org.status !== "connected" && e.registry.integrationStatus !== "abandoned" && e.registry.accessMethods.some((m) => CONNECTABLE.includes(m))).length,
    pro: entries.filter((e) => e.proAccountRequired === true).length,
    errors: entries.filter((e) => e.org.status === "error").length,
    verified: entries.filter((e) => e.stages.includes("verified")).length,
  };
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtrage et tri. Pur. */
export function filterDirectory(entries: readonly DirectoryEntry[], f: DirectoryFilters): DirectoryEntry[] {
  const needle = normalize(f.q.trim());
  const out = entries.filter((e) => {
    if (f.access === "connected" && e.org.status !== "connected") return false;
    if (f.access === "connectable" && (e.registry.integrationStatus === "abandoned" || !e.registry.accessMethods.some((m) => CONNECTABLE.includes(m)))) return false;
    if (f.access === "pro" && e.proAccountRequired !== true) return false;
    if (f.access === "error" && e.org.status !== "error") return false;
    if (f.segment && e.segment !== f.segment) return false;
    if (f.country && (e.country ?? "").toUpperCase() !== f.country) return false;
    if (f.method && !e.registry.accessMethods.includes(f.method)) return false;
    if (needle && !normalize([e.name, e.country ?? "", e.registry.domain ?? "", ...e.brands, ...e.categories, ...e.productTypes].join(" ")).includes(needle)) return false;
    return true;
  });
  const statusRank = (e: DirectoryEntry) => (e.org.status === "connected" ? 0 : e.org.status === "pending" || e.org.status === "error" ? 1 : 2);
  return out.sort((a, b) => {
    if (f.sort === "name") return a.name.localeCompare(b.name, "fr");
    if (f.sort === "country") return (a.country ?? "ZZ").localeCompare(b.country ?? "ZZ") || a.name.localeCompare(b.name, "fr");
    if (f.sort === "recent") return (b.org.lastSyncAt ?? "").localeCompare(a.org.lastSyncAt ?? "") || a.name.localeCompare(b.name, "fr");
    return statusRank(a) - statusRank(b) || b.registry.priority.score - a.registry.priority.score || a.name.localeCompare(b.name, "fr");
  });
}

/** Pays présents dans l'annuaire, triés (pour le filtre). Pur. */
export function directoryCountries(entries: readonly DirectoryEntry[]): string[] {
  return [...new Set(entries.map((e) => e.country).filter((c): c is string => Boolean(c)))].sort();
}
