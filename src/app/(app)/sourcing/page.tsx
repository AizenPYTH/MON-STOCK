import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, GitMerge, Layers, Radar } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, Callout } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { countPendingMatches, countUnseenAlertEvents } from "@/features/sourcing/queries";
import { legacyCatalogHref } from "@/features/sourcing-search/legacy";
import { MIN_QUERY_LENGTH, SEARCH_EXAMPLES, normalizeQuery } from "@/features/sourcing-search/display";
import { SupplierSearchForm } from "@/features/sourcing-search/components/search-form";
import { SearchPending, SearchSection } from "@/features/sourcing-search/components/search-section";

export const metadata: Metadata = { title: "Sourcing" };
// recherche en direct : jusqu'à ~35 s chez les fournisseurs, puis lecture et analyse des offres
export const maxDuration = 60;

export default async function SourcingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  // anciens liens du moteur complet (mode SKU, filtres) → Offres collectées
  const legacy = legacyCatalogHref(raw);
  if (legacy) redirect(legacy as never);
  const ctx = await requireOrgContext();
  const query = normalizeQuery(raw.q);
  const [pendingMatches, unseenEvents] = await Promise.all([countPendingMatches(ctx), countUnseenAlertEvents(ctx)]);

  return (
    <>
      <PageHeader
        title="Sourcing"
        description="Cherchez un produit : MON STOCK interroge vos fournisseurs, compare les prix du moins cher au plus cher et estime la marge quand des produits équivalents existent. Les estimations sont signalées « ≈ »."
        actions={
          <>
            <ButtonLink href="/sourcing/catalog" variant="ghost">
              <Layers className="h-4 w-4" aria-hidden="true" /> Offres collectées
            </ButtonLink>
            <ButtonLink href="/radar" variant="ghost">
              <Radar className="h-4 w-4" aria-hidden="true" /> Radar d&apos;achat
            </ButtonLink>
            <ButtonLink href="/sourcing/matches" variant="ghost">
              <GitMerge className="h-4 w-4" aria-hidden="true" /> Correspondances{pendingMatches > 0 ? ` (${pendingMatches})` : ""}
            </ButtonLink>
            <ButtonLink href="/sourcing/alerts" variant="secondary">
              <Bell className="h-4 w-4" aria-hidden="true" /> Alertes{unseenEvents > 0 ? ` (${unseenEvents})` : ""}
            </ButtonLink>
          </>
        }
      />
      <div className="space-y-5">
        <SupplierSearchForm query={query} />
        {!query ? (
          <Intro />
        ) : query.length < MIN_QUERY_LENGTH ? (
          <Callout tone="warning">Tapez au moins {MIN_QUERY_LENGTH} caractères, par exemple « iPhone 13 » ou « batterie trottinette ».</Callout>
        ) : (
          <Suspense key={query} fallback={<SearchPending query={query} />}>
            <SearchSection ctx={ctx} query={query} />
          </Suspense>
        )}
      </div>
    </>
  );
}

function Intro() {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Essayez</p>
        <ul className="flex flex-wrap gap-2">
          {SEARCH_EXAMPLES.map((e) => (
            <li key={e}>
              <Link href={`/sourcing?q=${encodeURIComponent(e)}` as never} className="inline-flex rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Chercher ${e}`}>
                {e}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ShortcutCard href="/sourcing/catalog" title="Offres collectées" text="Toutes les offres de vos sources : podium, filtres avancés (grade, MOQ, pays…), mode « Trouver moins cher » pour un SKU." />
        <ShortcutCard href="/radar" title="Radar d'achat" text="Vos produits en rupture ou en stock faible face aux offres rapprochées : bénéfice estimé, verdict, brouillon de commande." />
        <ShortcutCard href="/suppliers" title="Fournisseurs et sources" text="Ajoutez une page publique autorisée, un flux ou un compte fournisseur : vos prix pro passent en premier." />
      </div>
    </div>
  );
}

function ShortcutCard({ href, title, text }: { href: "/sourcing/catalog" | "/radar" | "/suppliers"; title: string; text: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <Link href={href} className="text-sm font-semibold text-foreground hover:underline">
          {title}
        </Link>
        <p className="text-xs text-muted">{text}</p>
      </CardContent>
    </Card>
  );
}
