import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatMoney, formatNumber, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { deliveryLabel } from "@/features/sourcing/delivery";
import { retrievalMethodLabel, type OfferProvenanceView } from "@/features/sourcing/provenance";
import { STOCK_STATUS_LABEL, TAX_LABEL } from "@/features/sourcing/labels";

export interface TraceableOffer {
  title_original: string;
  brand: string | null;
  model: string | null;
  storage: string | null;
  color: string | null;
  grade: string | null;
  original_price: number;
  original_currency: string;
  tax_type: string;
  moq: number | null;
  available_quantity: number | null;
  stock_status: string;
  country: string | null;
  delivery_min_days: number | null;
  delivery_max_days: number | null;
  last_seen_at: string;
  source_url: string | null;
}

/** Bloc de traçabilité d'une offre : uniquement des données récupérées, champ absent → « Non communiqué ». */
export function OfferTraceability({ offer, supplierName, supplierCountry, provenance, duplicatesCollapsed, titleDisplay, className }: { offer: TraceableOffer; supplierName: string; supplierCountry: string | null; provenance: OfferProvenanceView; duplicatesCollapsed: number; titleDisplay?: string | null; className?: string }) {
  const normalized = titleDisplay?.trim() || [offer.brand, offer.model, offer.storage, offer.color, offer.grade ? `Grade ${offer.grade}` : null].filter(Boolean).join(" · ");
  const verifiedAt = provenance.retrievedAt ?? offer.last_seen_at;
  const sourceUrl = provenance.sourceUrl ?? offer.source_url;
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: "Fournisseur", value: supplierName },
    { label: "Produit original", value: <span className="break-words">{offer.title_original}</span> },
    { label: "Produit normalisé", value: normalized || NOT_PROVIDED },
    { label: "Prix", value: `${formatMoney(Number(offer.original_price), offer.original_currency)} · ${offer.original_currency.toUpperCase()} · ${TAX_LABEL[offer.tax_type] ?? offer.tax_type}` },
    { label: "MOQ", value: offer.moq === null ? NOT_PROVIDED : `${formatNumber(offer.moq)} unité(s)` },
    { label: "Stock", value: offer.available_quantity !== null ? `${formatNumber(offer.available_quantity)} unité(s)` : STOCK_STATUS_LABEL[offer.stock_status] ?? "Stock non communiqué" },
    { label: "Pays", value: offer.country ?? supplierCountry ?? NOT_PROVIDED },
    { label: "Livraison", value: offer.delivery_min_days === null && offer.delivery_max_days === null ? "Non communiquée" : deliveryLabel(offer.delivery_min_days, offer.delivery_max_days) },
    { label: "Dernière vérification", value: `${formatDateTime(verifiedAt)} (${formatRelative(verifiedAt)})` },
    {
      label: "Méthode de récupération",
      value: (
        <span>
          {retrievalMethodLabel(provenance)}
          {provenance.adapterKey ? (
            <>
              {" "}
              <Badge variant="outline" className="font-mono">{provenance.adapterKey}</Badge>
            </>
          ) : null}
          {!provenance.explicit ? <span className="text-muted"> · déduite du type de source</span> : null}
        </span>
      ),
    },
  ];
  if (provenance.requestUrl) rows.push({ label: "Requête effectuée", value: <span className="break-all font-mono text-[11px]">{provenance.requestUrl}</span> });
  return (
    <div className={className}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-muted">{r.label}</dt>
            <dd className="font-medium text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {sourceUrl ? (
          <ButtonLink href={sourceUrl} variant="ghost" size="sm">
            <ExternalLink className="h-3.5 w-3.5" /> Voir la source
          </ButtonLink>
        ) : (
          <span className="text-xs text-muted">URL source non communiquée</span>
        )}
        {duplicatesCollapsed > 0 ? <Badge variant="accent">{duplicatesCollapsed} offre{duplicatesCollapsed > 1 ? "s" : ""} identique{duplicatesCollapsed > 1 ? "s" : ""} fusionnée{duplicatesCollapsed > 1 ? "s" : ""}</Badge> : null}
      </div>
    </div>
  );
}
