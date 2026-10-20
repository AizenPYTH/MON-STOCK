import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Paper, Scene, SceneHeader, Segmented, StageStats } from "@/components/instrument";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { formatNumber } from "@/lib/format";
import type { Supplier } from "@/db/types";

export type SupplierTab = "info" | "offers" | "sources" | "orders" | "performance";

function domainOf(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Fiche d'un fournisseur de l'organisation (v5) : scène nuit (logo, nom, score, relevés réels) puis
 * papier avec les onglets ; le contenu de l'onglet est passé en `children`.
 */
export function SupplierHeader({ supplier, tab, counts, children }: { supplier: Supplier; tab: SupplierTab; counts: { offers: number; sources: number; orders: number }; children: ReactNode }) {
  const base = `/suppliers/${supplier.id}`;
  const items: { href: string; label: string; key: SupplierTab }[] = [
    { href: base, label: "Informations", key: "info" },
    { href: `${base}/offers`, label: `Offres · ${formatNumber(counts.offers)}`, key: "offers" },
    { href: `${base}/sources`, label: `Sources & flux · ${formatNumber(counts.sources)}`, key: "sources" },
    { href: `${base}/orders`, label: `Achats · ${formatNumber(counts.orders)}`, key: "orders" },
    { href: `${base}/performance`, label: "Performance", key: "performance" },
  ];
  // score et délai : inconnus (null ou absents) → « — », jamais 0 ni NaN
  const rawScore = supplier.internal_score === null || supplier.internal_score === undefined ? NaN : Number(supplier.internal_score);
  const score = Number.isFinite(rawScore) ? rawScore : null;
  return (
    <>
      <Scene>
        <SceneHeader
          back={{ href: "/suppliers", label: "Mes fournisseurs" }}
          eyebrow="Fournisseurs · fiche"
          title={
            <span className="flex flex-wrap items-center gap-3">
              <SupplierBadge name={supplier.name} domain={domainOf(supplier.website)} size="lg" />
              <span className="min-w-0 break-words">{supplier.name}</span>
              {supplier.is_archived ? <span className="ms-mono rounded-md border border-night-stroke px-1.5 py-0.5 text-[10px] leading-[13px] text-on-night-muted">Archivé</span> : null}
            </span>
          }
          description={[supplier.company, supplier.country, supplier.website].filter(Boolean).join(" · ") || "Aucune information complémentaire."}
          actions={
            <ButtonLink href={`/sourcing/catalog?supplier=${supplier.id}`} variant="night">
              <Search aria-hidden="true" className="h-4 w-4" /> Voir ses offres dans le sourcing
            </ButtonLink>
          }
        />
        <StageStats
          className="mt-6 max-w-[820px]"
          stats={[
            { label: "Offres actives", value: formatNumber(counts.offers) },
            { label: "Sources & flux", value: formatNumber(counts.sources), note: counts.sources === 0 ? "non connecté" : undefined },
            { label: "Commandes", value: formatNumber(counts.orders) },
            { label: "Score interne", value: score === null ? null : `${Math.round(score)}/100`, note: score === null ? "données insuffisantes" : undefined },
          ]}
        />
      </Scene>
      <Paper>
        <div className="mb-5 overflow-x-auto">
          <Segmented label="Sections du fournisseur" className="min-w-max" options={items.map((i) => ({ href: i.href, label: i.label, selected: i.key === tab }))} />
        </div>
        {children}
      </Paper>
    </>
  );
}
