import type { Json } from "@/db/database.types";
import { RETRIEVAL_METHOD_LABEL, SOURCE_TYPE_TO_METHOD } from "@/features/sourcing/labels";

/**
 * Provenance d'une offre telle qu'affichée (traçabilité). Module pur, sans accès serveur.
 * Rien n'est inventé : quand la provenance explicite manque, la méthode est déduite du type
 * de source et signalée comme telle (`explicit: false`).
 */
export interface OfferProvenanceView {
  method: string | null;
  adapterKey: string | null;
  retrievedAt: string | null;
  requestUrl: string | null;
  sourceUrl: string | null;
  /** true si la provenance a été enregistrée par le pipeline (et non déduite) */
  explicit: boolean;
}

type ProvenanceLike = { method?: unknown; adapterKey?: unknown; adapter_key?: unknown; adapter?: unknown; retrievedAt?: unknown; retrieved_at?: unknown; requestUrl?: unknown; request_url?: unknown; sourceUrl?: unknown; source_url?: unknown };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Provenance retournée par le pipeline de recherche (SearchOfferView.provenance) → vue d'affichage. */
export function fromSearchProvenance(p: ProvenanceLike | null | undefined, fallback: { sourceType: string; sourceUrl: string | null; lastSeenAt: string | null }): OfferProvenanceView {
  if (p && (str(p.method) || str(p.adapterKey) || str(p.adapter_key) || str(p.adapter))) {
    return {
      method: str(p.method),
      adapterKey: str(p.adapterKey) ?? str(p.adapter_key) ?? str(p.adapter),
      retrievedAt: str(p.retrievedAt) ?? str(p.retrieved_at) ?? fallback.lastSeenAt,
      requestUrl: str(p.requestUrl) ?? str(p.request_url),
      sourceUrl: str(p.sourceUrl) ?? str(p.source_url) ?? fallback.sourceUrl,
      explicit: true,
    };
  }
  return { method: SOURCE_TYPE_TO_METHOD[fallback.sourceType] ?? null, adapterKey: null, retrievedAt: fallback.lastSeenAt, requestUrl: null, sourceUrl: fallback.sourceUrl, explicit: false };
}

/** Provenance lue sur une offre enregistrée (colonne `raw`) et, à défaut, sur la configuration de sa source. */
export function readOfferProvenance(offer: { raw: Json | null; source_url: string | null; source_type: string; last_seen_at: string | null }, source?: { config?: Json | null } | null): OfferProvenanceView {
  const raw = offer.raw && typeof offer.raw === "object" && !Array.isArray(offer.raw) ? (offer.raw as Record<string, unknown>) : null;
  const candidate = raw ? ((raw.provenance ?? raw._provenance) as ProvenanceLike | undefined) : undefined;
  const view = fromSearchProvenance(candidate && typeof candidate === "object" ? candidate : null, { sourceType: offer.source_type, sourceUrl: offer.source_url, lastSeenAt: offer.last_seen_at });
  if (view.explicit) return view;
  const cfg = source?.config && typeof source.config === "object" && !Array.isArray(source.config) ? (source.config as Record<string, unknown>) : null;
  const adapterKey = cfg ? str(cfg.adapter) : null;
  return { ...view, adapterKey };
}

/** « Page publique HTML (jsonld-public) » / « Méthode non communiquée ». */
export function retrievalMethodLabel(p: Pick<OfferProvenanceView, "method" | "adapterKey">): string {
  const base = p.method ? RETRIEVAL_METHOD_LABEL[p.method] ?? p.method : null;
  if (!base) return p.adapterKey ? `Méthode non communiquée (${p.adapterKey})` : "Méthode non communiquée";
  return p.adapterKey ? `${base} (${p.adapterKey})` : base;
}
