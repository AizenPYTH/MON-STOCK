/**
 * Outils d'exécution des adaptateurs côté services (purs, sans client Supabase) :
 * configuration d'adaptateur à partir d'une ligne supplier_sources, enveloppe de provenance
 * des offres, planificateur « 1 requête à la fois par hôte + délai minimal ».
 */
import type { Json } from "@/db/database.types";
import type { TaxType } from "@/db/types";
import type { RawOffer } from "@/domain/sourcing/types";
import type { AdapterSourceConfig, RetrievalMethod } from "@/integrations/sourcing/core";

export interface AdapterSourceRow {
  base_url: string | null;
  config: Json | null;
  default_currency: string | null;
  default_tax_type: TaxType;
  country: string | null;
}

export function configObject(config: Json | null | undefined): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
}

/** Clé d'adaptateur déclarée dans supplier_sources.config (`{ adapter: "shopify-storefront", … }`). */
export function adapterKeyOf(config: Json | null | undefined): string | null {
  const c = configObject(config);
  return typeof c.adapter === "string" && c.adapter.trim() ? c.adapter.trim() : null;
}

/** Configuration passée à l'adaptateur : réglages = tout le `config` (urls, search_url, max_pages, réglages propres…). */
export function adapterConfigFromSource(row: AdapterSourceRow): AdapterSourceConfig {
  const settings = { ...configObject(row.config) };
  if (typeof settings.max_pages === "string") {
    const n = Number(settings.max_pages);
    if (Number.isFinite(n)) settings.max_pages = n;
  }
  return {
    baseUrl: row.base_url ? row.base_url.replace(/\/+$/, "") : null,
    settings,
    defaultCurrency: row.default_currency,
    defaultTaxType: row.default_tax_type,
    defaultCountry: row.country,
  };
}

/** Provenance enregistrée avec chaque offre (sourcing_offers.raw.provenance). */
export interface OfferProvenance {
  adapterKey: string;
  method: RetrievalMethod;
  retrievedAt: string;
  requestUrl: string | null;
  sourceUrl: string | null;
}

const MAX_PAYLOAD_JSON = 8_000;

function boundedPayload(raw: unknown): unknown {
  if (raw === undefined || raw === null) return null;
  try {
    const json = JSON.stringify(raw);
    if (json.length <= MAX_PAYLOAD_JSON) return raw;
    return { truncated: true, excerpt: json.slice(0, MAX_PAYLOAD_JSON) };
  } catch {
    return null;
  }
}

/** Enveloppe l'offre brute avec sa provenance : `raw = { provenance: {…}, payload: <données brutes de l'adaptateur> }`. */
export function withProvenance(offer: RawOffer, p: OfferProvenance): RawOffer {
  const requestUrl = p.requestUrl ?? (offer.raw && typeof offer.raw === "object" && typeof (offer.raw as Record<string, unknown>).request_url === "string" ? ((offer.raw as Record<string, unknown>).request_url as string) : null);
  return {
    ...offer,
    url: offer.url ?? p.sourceUrl ?? null,
    raw: {
      provenance: { adapter: p.adapterKey, adapter_key: p.adapterKey, method: p.method, retrieved_at: p.retrievedAt, request_url: requestUrl, source_url: offer.url ?? p.sourceUrl ?? null },
      payload: boundedPayload(offer.raw),
    },
  };
}

export interface StoredProvenance {
  method: RetrievalMethod | null;
  adapterKey: string | null;
  retrievedAt: string | null;
  requestUrl: string | null;
}

const METHODS: ReadonlySet<string> = new Set(["public_html", "public_json", "public_feed", "official_api", "supplier_account", "manual"]);

/** Relit la provenance d'une offre enregistrée (null si l'offre n'a pas été produite par le pipeline). */
export function parseStoredProvenance(raw: Json | null | undefined): StoredProvenance | null {
  const r = configObject(raw);
  const p = configObject((r.provenance ?? r._provenance) as Json | undefined);
  if (Object.keys(p).length === 0) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const method = str(p.method);
  const adapterKey = str(p.adapter_key) ?? str(p.adapterKey) ?? str(p.adapter);
  if (!method && !adapterKey) return null;
  return { method: method && METHODS.has(method) ? (method as RetrievalMethod) : null, adapterKey, retrievedAt: str(p.retrieved_at) ?? str(p.retrievedAt), requestUrl: str(p.request_url) ?? str(p.requestUrl) };
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Planificateur par hôte : au plus une requête en vol par hôte et un délai minimal entre deux
 * requêtes vers le même hôte, quel que soit le nombre de sources interrogées en parallèle.
 */
export class HostScheduler {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly lastAt = new Map<string, number>();
  constructor(
    private readonly minDelayMs: number,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(host) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chains.set(host, previous.then(() => gate));
    await previous;
    try {
      const last = this.lastAt.get(host);
      if (last !== undefined) {
        const wait = this.minDelayMs - (this.clock() - last);
        if (wait > 0) await this.sleep(wait);
      }
      this.lastAt.set(host, this.clock());
      return await fn();
    } finally {
      release();
    }
  }

  /** fetch sérialisé par hôte (passé aux adaptateurs via ctx.fetchImpl). */
  wrapFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
    const wrapped = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return this.run(hostOf(url) ?? "unknown", () => fetchImpl(input, init));
    };
    return wrapped as typeof fetch;
  }
}
