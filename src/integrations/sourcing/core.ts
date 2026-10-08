/**
 * =============================================================================
 * Contrat des ADAPTATEURS DE SOURCE du moteur de sourcing.
 *
 * Un adaptateur = un dossier indépendant sous src/integrations/sourcing/<key>/
 *   crawler.ts  → comment obtenir les documents (URLs de recherche / catalogue, API)
 *   parser.ts   → document (HTML / JSON / XML) → RawOffer[] (pur, testé sur fixtures)
 *   mapper.ts   → adaptations propres à la source (grades, pays, devise…)
 *   index.ts    → export de l'objet SourceAdapter enregistré dans ../registry.ts
 *
 * Règles absolues :
 *   - accès public conforme aux conditions du site, API/feeds officiels, ou compte
 *     fournisseur connecté par le vendeur lui-même (identifiants chiffrés côté serveur) ;
 *   - jamais de contournement (login, CAPTCHA, anti-bot, paywall) ;
 *   - rien n'est inventé : champ absent → null (« Non communiqué ») ;
 *   - chaque offre conserve sa provenance (URL source, méthode de récupération, horodatage).
 * =============================================================================
 */
import type { RawOffer } from "@/domain/sourcing/types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";

/** Comment les données sont obtenues (affiché dans l'interface : traçabilité). */
export type RetrievalMethod =
  | "public_html"        // page HTML publique (parser dédié ou JSON-LD)
  | "public_json"        // endpoint JSON public documenté par la plateforme (ex. Shopify products.json)
  | "public_feed"        // flux CSV/XML/JSON publié par le fournisseur
  | "official_api"       // API officielle avec identifiants du vendeur
  | "supplier_account"   // compte fournisseur connecté par le vendeur
  | "manual";            // saisie manuelle

/** Accès requis pour utiliser l'adaptateur. */
export type AccessLevel = "public" | "account";

export interface CredentialField {
  name: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

export interface ConfigField {
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface AdapterCapabilities {
  /** recherche en direct par requête texte (search(query)) */
  search: boolean;
  /** parcours du catalogue (fetchCatalog) */
  catalog: boolean;
  /** la source expose une quantité disponible fiable */
  stockQuantity: boolean;
}

export interface AdapterSourceConfig {
  /** URL de base de la boutique / de l'API (sans slash final) */
  baseUrl: string | null;
  /** réglages propres à l'adaptateur (validés par `configSchema`) */
  settings: Record<string, unknown>;
  /** valeurs par défaut documentées par l'utilisateur pour cette source */
  defaultCurrency: string | null;
  defaultTaxType: "ht" | "ttc" | "unknown";
  defaultCountry: string | null;
}

export interface AdapterRunContext {
  userAgent: string;
  fetchImpl?: typeof fetch;
  /** identifiants déchiffrés (adaptateurs `access: "account"` uniquement) */
  credentials?: Record<string, string>;
  /** délai minimal entre deux requêtes vers le même hôte (robots.txt / politesse) */
  minDelayMs?: number;
  /** budget de temps pour une recherche en direct */
  timeoutMs?: number;
  /** URLs interdites par robots.txt (déjà évaluées par l'appelant) */
  disallowedUrls?: string[];
  sleep?: (ms: number) => Promise<void>;
}

export interface AdapterRequestTrace {
  url: string;
  status: number | null;
  durationMs: number;
  offers: number;
  error: string | null;
}

export interface AdapterSearchResult {
  offers: RawOffer[];
  method: RetrievalMethod;
  requests: AdapterRequestTrace[];
  /** la source n'a pas pu être interrogée (robots.txt, compte requis, erreur) */
  error: string | null;
  /** true si une limite (pages, temps) a été atteinte */
  truncated: boolean;
}

export interface AdapterCatalogPage {
  offers: RawOffer[];
  method: RetrievalMethod;
  requests: AdapterRequestTrace[];
  nextCursor: string | null;
}

export interface SourceAdapter {
  key: string;
  label: string;
  /** description honnête (ce qui est réellement extrait, limites connues) */
  description: string;
  method: RetrievalMethod;
  access: AccessLevel;
  capabilities: AdapterCapabilities;
  /** champs d'identifiants (access = "account") */
  credentialFields: CredentialField[];
  /** champs de configuration de la source (URL de recherche, devise…) */
  configFields: ConfigField[];
  /** URLs à soumettre à robots.txt avant une recherche (sources HTML/JSON publiques) ; null = non applicable */
  urlsForQuery?(config: AdapterSourceConfig, query: ParsedQuery, rawQuery: string): string[];
  /** recherche en direct d'offres pour une requête */
  search(config: AdapterSourceConfig, query: ParsedQuery, rawQuery: string, ctx: AdapterRunContext): Promise<AdapterSearchResult>;
  /** page de catalogue (synchronisation planifiée) */
  fetchCatalog?(config: AdapterSourceConfig, cursor: string | null, ctx: AdapterRunContext): Promise<AdapterCatalogPage>;
  /** vérification de la configuration / des identifiants (sans effet de bord) */
  testConnection(config: AdapterSourceConfig, ctx: AdapterRunContext): Promise<{ ok: boolean; message: string }>;
}

/** Offre brute enrichie de sa provenance, telle que produite par le pipeline de recherche en direct. */
export interface TracedRawOffer extends RawOffer {
  adapterKey: string;
  method: RetrievalMethod;
  retrievedAt: string;
}
