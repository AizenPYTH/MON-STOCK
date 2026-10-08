import type { Metadata } from "next";
import Link from "next/link";
import { Bell, GitMerge } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState, Callout } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { searchOffers } from "@/services/sourcing/search";
import { sourcingSearchParamsSchema, toOfferFilters } from "@/features/sourcing/schemas";
import { countPendingMatches, countUnseenAlertEvents } from "@/features/sourcing/queries";
import { SourcingSearchForm } from "@/features/sourcing/components/search-form";
import { ResultsHeader } from "@/features/sourcing/components/results-header";
import { OfferCard } from "@/features/sourcing/components/offer-card";
import { SourcesPanel } from "@/features/sourcing/components/sources-panel";
import { SavingsCalculator } from "@/features/sourcing/components/savings-calculator";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Sourcing" };

export default async function SourcingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) flat[k] = val;
  }
  const parsedParams = sourcingSearchParamsSchema.safeParse(flat);
  const params = parsedParams.success ? parsedParams.data : sourcingSearchParamsSchema.parse({});
  const filters = toOfferFilters(params);
  const [result, { data: supplierRows }, pendingMatches, unseenEvents] = await Promise.all([
    searchOffers(ctx, { query: params.q ?? "", skuCode: params.sku ?? null, filters }),
    ctx.supabase.from("suppliers").select("id, name").eq("organization_id", ctx.organization.id).eq("is_archived", false).order("name").limit(300),
    countPendingMatches(ctx),
    countUnseenAlertEvents(ctx),
  ]);
  const currency = ctx.organization.default_currency;
  const hasQuery = Boolean(params.q) || Boolean(result.sku);
  const makeHref = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams(flat);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return `/sourcing${s ? `?${s}` : ""}`;
  };
  const alertHref = (() => {
    const sp = new URLSearchParams({ new: "1" });
    sp.set("q", params.q || (result.sku ? `${result.sku.brand ?? ""} ${result.sku.productName} ${result.sku.variantName ?? ""}`.trim() : ""));
    if (params.max_price) sp.set("max_price", String(params.max_price));
    if (params.qty) sp.set("min_quantity", String(params.qty));
    if (params.country) sp.set("countries", params.country);
    if (params.max_moq) sp.set("max_moq", String(params.max_moq));
    if (params.grade) sp.set("grades", params.grade);
    if (params.condition) sp.set("condition", params.condition);
    if (params.max_delivery) sp.set("max_delivery_days", String(params.max_delivery));
    if (result.sku) sp.set("sku_id", result.sku.id);
    return `/sourcing/alerts?${sp.toString()}`;
  })();
  const skuMode = result.sku;
  const bestView = result.views[0] ?? null;

  return (
    <>
      <PageHeader
        title={skuMode ? (skuMode.costPrice !== null ? "Trouver moins cher" : "Trouver du stock") : "Sourcing"}
        description={skuMode ? <span>Offres fournisseurs pour <code className="font-mono text-foreground">{skuMode.code}</code> — {skuMode.productName}{skuMode.variantName && skuMode.variantName !== "Standard" ? ` · ${skuMode.variantName}` : ""}.</span> : "Moteur de recherche B2B : comparez les offres de vos sources (flux, pages autorisées, saisie) — prix normalisés, MOQ, délais, marge potentielle. Rien n'est inventé : une donnée absente est affichée « Non communiqué »."}
        actions={
          <>
            <ButtonLink href="/sourcing/matches" variant="ghost">
              <GitMerge className="h-4 w-4" /> Correspondances{pendingMatches > 0 ? ` (${pendingMatches})` : ""}
            </ButtonLink>
            <ButtonLink href="/sourcing/alerts" variant="secondary">
              <Bell className="h-4 w-4" /> Alertes{unseenEvents > 0 ? ` (${unseenEvents})` : ""}
            </ButtonLink>
          </>
        }
      />
      <div className="space-y-5">
        <SourcingSearchForm params={params} suppliers={supplierRows ?? []} skuCode={result.sku?.code ?? params.sku ?? null} />
        {params.sku && !result.sku ? <Callout tone="warning">SKU « {params.sku} » introuvable : la recherche porte uniquement sur le texte saisi.</Callout> : null}

        {skuMode ? (
          <Card>
            <CardHeader title={skuMode.costPrice !== null ? "Votre fournisseur actuel" : "Coût d'achat actuel inconnu"} description={skuMode.costPrice !== null ? "Comparaison avec votre coût d'achat enregistré sur le SKU." : "Renseignez le coût d'achat du SKU pour calculer les économies potentielles."} />
            <CardContent>
              {skuMode.costPrice !== null && bestView && bestView.comparableUnitPrice !== null ? (
                <SavingsCalculator costPrice={skuMode.costPrice} bestPrice={result.aggregates.bestPrice ?? bestView.comparableUnitPrice} currency={currency} defaultQuantity={result.requestedQuantity} />
              ) : skuMode.costPrice !== null ? (
                <p className="text-sm text-muted">Votre fournisseur actuel : <span className="font-semibold text-foreground">{formatMoney(skuMode.costPrice, skuMode.currency)}</span>. Aucune offre comparable trouvée pour l'instant.</p>
              ) : (
                <ButtonLink href={`/stock/${encodeURIComponent(skuMode.code)}/edit`} variant="secondary" size="sm">
                  Renseigner le coût d'achat
                </ButtonLink>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {!hasQuery && result.total === 0 ? (
              <EmptyState title="Que recherchez-vous ?" description="Saisissez un produit (ex. « iPhone 13 128 Go noir grade A »), un EAN ou une référence fabricant. Les filtres avancés permettent aussi de parcourir toutes les offres d'un fournisseur ou d'une source." />
            ) : result.total === 0 ? (
              <EmptyState
                title="Aucune offre trouvée."
                description={result.connectedSources === 0 ? "Aucune source n'est connectée : ajoutez un fournisseur, importez un flux CSV/XML/JSON ou déclarez une page publique autorisée." : "Aucune offre de vos sources connectées ne correspond. Élargissez les filtres, vérifiez l'orthographe ou créez une alerte pour être prévenu dès qu'une offre apparaît."}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <ButtonLink href="/suppliers" variant="secondary">
                      Ajouter un fournisseur ou une source
                    </ButtonLink>
                    {hasQuery ? <ButtonLink href={alertHref}>Créer une alerte</ButtonLink> : null}
                  </div>
                }
              />
            ) : (
              <>
                <ResultsHeader aggregates={result.aggregates} sort={params.sort} makeHref={makeHref} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    Recherche {result.stage === "identifier" ? "par identifiant exact (EAN / MPN)" : result.stage === "structured" ? `par attributs normalisés (${[result.parsed.criteria.brand, result.parsed.criteria.model, result.parsed.criteria.storage, result.parsed.criteria.color, result.parsed.criteria.grade ? `grade ${result.parsed.criteria.grade}` : null].filter(Boolean).join(" · ")})` : result.stage === "text" ? "par texte" : "par filtres"} · page {result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))}
                  </span>
                  <Link href={alertHref as never} className="font-medium text-foreground underline-offset-2 hover:underline">
                    Créer une alerte pour cette recherche
                  </Link>
                </div>
                <div className="space-y-3">
                  {result.views.map((v) => (
                    <OfferCard key={v.offer.id} view={v} currency={currency} sku={result.sku} requestedQuantity={result.requestedQuantity} />
                  ))}
                </div>
                <Pagination page={result.page} pageSize={result.pageSize} total={result.total} makeHref={(p) => makeHref({ page: String(p) })} />
              </>
            )}
          </div>
          <div className="space-y-4">
            <SourcesPanel sources={result.sources} />
            {result.vatRate === null ? (
              <Callout tone="neutral" title="TVA non renseignée">
                Les prix TTC ne peuvent pas être ramenés en HT pour la comparaison. <Link href="/settings/organization" className="underline">Renseigner le taux de TVA</Link>.
              </Callout>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
