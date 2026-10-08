/**
 * État des sources — calculé à partir du code (catalogue, registre d'adaptateurs) et de la base
 * (sources, connexions, offres de l'organisation). Rien n'est codé en dur : chaque chiffre a sa
 * définition, et les quatre niveaux restent distincts : DOCUMENTÉ ≠ VÉRIFIÉ ≠ CONNECTÉ ≠ OFFRE DISPONIBLE.
 */
import type { CatalogSource } from "@/integrations/sourcing/catalog";

export type StatusScope = "catalog" | "organization";

export interface SourcingStatusItem {
  key: "documented" | "verified" | "adapters" | "connected" | "with_prices" | "with_stock" | "account_required" | "api_or_feed" | "usable_now";
  scope: StatusScope;
  label: string;
  value: number;
  /** précision (ex. « dont 0 testé en conditions réelles ») */
  detail: string | null;
  definition: string;
}

export interface StatusAdapterInput {
  key: string;
  access: "public" | "account";
  method: string;
  verification: "fixtures" | "live";
  search: boolean;
}

export interface StatusSourceInput {
  id: string;
  sourceType: string;
  status: string;
  attested: boolean;
  robotsAllowed: boolean | null;
  /** clé d'adaptateur (config.adapter ou connecteur), null si aucune */
  adapterKey: string | null;
  /** config.discovered / config.access (« account » / « protected » pour un site à compte) */
  discovered: boolean;
  discoveredAccess: string | null;
  /** connexion fournisseur associée et son statut */
  connectionStatus: string | null;
}

export interface StatusOfferStats {
  withPrice: number;
  withStock: number;
}

export interface SourcingStatusInput {
  catalog: readonly Pick<CatalogSource, "status" | "accountRequired">[];
  adapters: readonly StatusAdapterInput[];
  sources: readonly StatusSourceInput[];
  /** connexions « compte » sans source porteuse encore créée */
  orphanConnections?: ReadonlyArray<{ connectorKey: string; status: string }>;
  offersBySource: ReadonlyMap<string, StatusOfferStats>;
}

const FEED_TYPES = new Set(["CSV", "XML", "JSON"]);

/** Source connectée : attestée (accès automatisé confirmé par l'utilisateur, ou compte connecté) ET active. */
export function isConnectedSource(s: StatusSourceInput): boolean {
  if (s.connectionStatus !== null && s.connectionStatus !== "connected") return false; // compte non testé / en erreur
  return s.attested && s.status === "active";
}

/** Interrogeable en direct dès maintenant (mêmes règles que le pré-contrôle de la recherche en direct). */
export function isUsableNow(s: StatusSourceInput, adapters: ReadonlyMap<string, StatusAdapterInput>): boolean {
  if (s.status === "paused") return false;
  if (s.discovered && !s.attested) return false;
  const a = s.adapterKey ? adapters.get(s.adapterKey) : undefined;
  if (!a || !a.search) return false;
  if (a.access === "account") return s.connectionStatus === "connected";
  const needsAttestation = a.method === "public_html" || a.method === "public_json";
  if (needsAttestation && !s.attested) return false;
  if (needsAttestation && s.robotsAllowed === false) return false;
  return true;
}

export function requiresAccount(s: StatusSourceInput, adapters: ReadonlyMap<string, StatusAdapterInput>): boolean {
  if (s.sourceType === "SUPPLIER_ACCOUNT") return true;
  const a = s.adapterKey ? adapters.get(s.adapterKey) : undefined;
  if (a?.access === "account") return true;
  return s.discovered && (s.discoveredAccess === "account" || s.discoveredAccess === "protected");
}

export function usesApiOrFeed(s: StatusSourceInput, adapters: ReadonlyMap<string, StatusAdapterInput>): boolean {
  if (FEED_TYPES.has(s.sourceType) || s.sourceType === "API") return true;
  const a = s.adapterKey ? adapters.get(s.adapterKey) : undefined;
  return a?.method === "official_api" || a?.method === "public_feed";
}

export function computeSourcingStatus(input: SourcingStatusInput): SourcingStatusItem[] {
  const adapters = new Map(input.adapters.map((a) => [a.key, a] as const));
  const connected = input.sources.filter(isConnectedSource);
  const liveVerified = input.adapters.filter((a) => a.verification === "live").length;
  const count = <T,>(list: readonly T[], pred: (x: T) => boolean) => list.filter(pred).length;
  const orphans = input.orphanConnections ?? [];
  return [
    { key: "documented", scope: "catalog", label: "Documentées", value: input.catalog.length, detail: null, definition: "Sources décrites dans le catalogue (docs/sourcing-sources.md) d'après leur documentation publique. Documenté ≠ vérifié : rien n'a été interrogé." },
    { key: "verified", scope: "catalog", label: "Fiches vérifiées", value: count(input.catalog, (c) => c.status === "verified_official_snippets"), detail: `${count(input.catalog, (c) => c.accountRequired === true)} exigent un compte`, definition: "Fiches confirmées par des extraits du domaine officiel (pages non ouvertes, réseau bloqué lors de la recherche). Vérifié ≠ connecté." },
    { key: "adapters", scope: "catalog", label: "Adaptateurs disponibles", value: input.adapters.length, detail: `${liveVerified} testé(s) en conditions réelles, ${input.adapters.length - liveVerified} sur fixtures uniquement`, definition: "Adaptateurs implémentés dans le registre (src/integrations/sourcing/registry.ts) : le code sait lire ce format, ce qui ne connecte aucune source." },
    { key: "connected", scope: "organization", label: "Sources connectées", value: connected.length, detail: null, definition: "Sources de votre organisation attestées (accès automatisé confirmé par vous, ou compte fournisseur connecté) ET actives. Connecté ≠ offre disponible." },
    { key: "with_prices", scope: "organization", label: "Avec prix", value: count(connected, (s) => (input.offersBySource.get(s.id)?.withPrice ?? 0) > 0), detail: null, definition: "Sources connectées ayant au moins une offre active avec prix réellement enregistrée (offre disponible)." },
    { key: "with_stock", scope: "organization", label: "Avec stock", value: count(connected, (s) => (input.offersBySource.get(s.id)?.withStock ?? 0) > 0), detail: null, definition: "Sources connectées ayant au moins une offre active dont le stock (quantité ou statut) est communiqué par la source." },
    { key: "account_required", scope: "organization", label: "Compte requis", value: count(input.sources, (s) => requiresAccount(s, adapters)) + orphans.length, detail: null, definition: "Sources de votre organisation qui exigent un compte fournisseur (connecteur « compte », source découverte « Compte requis / protégé »). Aucun contournement de connexion n'est effectué." },
    { key: "api_or_feed", scope: "organization", label: "API / flux", value: count(connected, (s) => usesApiOrFeed(s, adapters)), detail: null, definition: "Sources connectées via une API officielle ou un flux (CSV / XML / JSON / Google Merchant)." },
    { key: "usable_now", scope: "organization", label: "Utilisables immédiatement", value: count(input.sources, (s) => isUsableNow(s, adapters)), detail: null, definition: "Sources interrogeables en direct dès maintenant : adaptateur avec recherche, attestation et robots.txt non bloquant (public), ou compte connecté et testé." },
  ];
}
