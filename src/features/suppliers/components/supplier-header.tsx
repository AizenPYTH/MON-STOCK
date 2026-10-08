import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/tabs";
import type { Supplier } from "@/db/types";

export type SupplierTab = "info" | "offers" | "sources" | "orders" | "performance";

export function SupplierHeader({ supplier, tab, counts }: { supplier: Supplier; tab: SupplierTab; counts: { offers: number; sources: number; orders: number } }) {
  const base = `/suppliers/${supplier.id}`;
  const items = [
    { href: base, label: "Informations", key: "info" },
    { href: `${base}/offers`, label: "Produits / Offres", key: "offers", count: counts.offers },
    { href: `${base}/sources`, label: "Sources & flux", key: "sources", count: counts.sources },
    { href: `${base}/orders`, label: "Historique des achats", key: "orders", count: counts.orders },
    { href: `${base}/performance`, label: "Performance", key: "performance" },
  ];
  const current = items.find((i) => i.key === tab)?.href ?? base;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/suppliers" className="hover:text-foreground">
            Fournisseurs
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {supplier.name}
            {supplier.is_archived ? <Badge variant="outline">Archivé</Badge> : null}
            {supplier.internal_score === null ? <Badge variant="neutral">Score : données insuffisantes</Badge> : <Badge variant="success">Score {Math.round(supplier.internal_score)}/100</Badge>}
          </span>
        }
        description={[supplier.company, supplier.country, supplier.website].filter(Boolean).join(" · ") || "Aucune information complémentaire."}
        actions={
          <ButtonLink href={`/sourcing?supplier=${supplier.id}`} variant="secondary">
            <Search className="h-4 w-4" /> Voir ses offres dans le sourcing
          </ButtonLink>
        }
      />
      <LinkTabs items={items.map(({ href, label, count }) => ({ href, label, count }))} current={current} />
    </>
  );
}
