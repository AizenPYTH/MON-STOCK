import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Settings2 } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState, Callout, Stat, Section } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buildRadar } from "@/services/radar/radar";
import { countPendingMatches } from "@/features/sourcing/queries";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FILTER_OPTIONS, ageDaysText, FRESHNESS_LABEL, PRICE_ORIGIN_LABEL, SORT_OPTIONS, STATUS_LABEL, STATUS_VARIANT, VERDICT_LABEL, VERDICT_VARIANT, filterItems, parseRadarParams, profitPrefix, type RadarFilter } from "@/features/radar/labels";
import type { RadarSort } from "@/features/mobile-api/contract";

export const metadata: Metadata = { title: "Radar d'achat" };

/**
 * Radar d'opportunités d'achat : vos offres fournisseurs réelles comparées à vos ventes réelles,
 * coût complet et qualité des données à l'appui. Une estimation incomplète n'est jamais affichée
 * comme un bénéfice certain ; aucune commande n'est passée sans votre confirmation.
 */
export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { sort, filter } = parseRadarParams(await searchParams);
  const [radar, pendingMatches] = await Promise.all([buildRadar(ctx, { sort }), countPendingMatches(ctx)]);
  const items = filterItems(radar.items, filter);
  const c = radar.counts;
  const href = (next: { sort?: RadarSort; filter?: RadarFilter }) => {
    const sp = new URLSearchParams();
    const s = next.sort ?? sort;
    const f = next.filter ?? filter;
    if (s !== "score") sp.set("sort", s);
    if (f !== "all") sp.set("filter", f);
    const q = sp.toString();
    return `/radar${q ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sourcing" className="hover:text-foreground">
            Sourcing
          </Link>
        }
        title="Radar d'achat"
        description="Vos offres fournisseurs rapprochées de vos produits, évaluées avec vos ventes réelles et vos paramètres de coûts. Rien n'est commandé sans votre confirmation."
        actions={
          <ButtonLink href="/radar/settings" variant="secondary">
            <Settings2 className="h-4 w-4" aria-hidden="true" /> Paramètres de coûts
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Rentables" value={formatNumber(c.profitable)} hint="coûts complets" tone={c.profitable > 0 ? "success" : "neutral"} />
          <Stat label="Estimations" value={formatNumber(c.estimated)} hint="coûts partiels" tone={c.estimated > 0 ? "warning" : "neutral"} />
          <Stat label="Non rentables" value={formatNumber(c.unprofitable)} />
          <Stat label="Incomplètes" value={formatNumber(c.insufficient)} hint="données insuffisantes" />
        </div>

        {radar.missingSettings.length > 0 ? (
          <Callout tone="warning" title="Coûts manquants : bénéfices partiels" action={<ButtonLink href="/radar/settings" variant="secondary" size="sm">Compléter mes coûts</ButtonLink>}>
            Non renseignés : {radar.missingSettings.join(", ")}.
          </Callout>
        ) : null}
        {radar.settingsFromChannel.length > 0 ? <Callout tone="neutral">Repris de votre canal de vente faute de réglage : {radar.settingsFromChannel.join(", ")}.</Callout> : null}
        {pendingMatches > 0 ? (
          <Callout tone="info" title={`${formatNumber(pendingMatches)} correspondance${pendingMatches > 1 ? "s" : ""} à valider`} action={<ButtonLink href="/sourcing/matches" variant="secondary" size="sm">Valider</ButtonLink>}>
            Seules les offres rattachées à un SKU sont évaluées par le radar.
          </Callout>
        ) : c.unlinkedOffers > 0 ? (
          <p className="text-xs text-muted">{formatNumber(c.unlinkedOffers)} offre{c.unlinkedOffers > 1 ? "s" : ""} sans produit correspondant (non comptée{c.unlinkedOffers > 1 ? "s" : ""}).</p>
        ) : null}

        {radar.restock.length > 0 ? (
          <Section title={`À réapprovisionner (${radar.restock.length})`} description="Produits vendus en rupture ou dont le stock couvre moins de 14 jours, face à la meilleure offre rapprochée.">
            <Table>
              <THead>
                <tr>
                  <TH>Produit</TH>
                  <TH align="right">Stock</TH>
                  <TH align="right">Ventes 30 j</TH>
                  <TH align="right">Couverture</TH>
                  <TH>Meilleure offre</TH>
                </tr>
              </THead>
              <TBody>
                {radar.restock.slice(0, 30).map((r) => (
                  <TR key={r.skuId}>
                    <TD>
                      <Link href={`/stock/${encodeURIComponent(r.code)}` as never} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="font-mono text-xs text-muted">{r.code}</div>
                    </TD>
                    <TD align="right" className={cn("tnum", r.quantityAvailable <= 0 ? "font-semibold text-danger" : "")}>
                      {r.quantityAvailable <= 0 ? "Rupture" : formatNumber(r.quantityAvailable)}
                    </TD>
                    <TD align="right" className="tnum">
                      {formatNumber(r.units30d)}
                    </TD>
                    <TD align="right" className="tnum">
                      {r.daysOfCover === null ? "—" : `~${r.daysOfCover} j`}
                    </TD>
                    <TD>
                      {r.bestOfferId && r.bestPrice !== null ? (
                        <Link href={`/radar/${r.bestOfferId}` as never} className="hover:underline">
                          {formatMoney(r.bestPrice, ctx.organization.default_currency)} · {r.bestSupplier ?? "Fournisseur"}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Aucune offre fournisseur liée</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Section>
        ) : null}

        <Section title="Offres évaluées" description={`${formatNumber(items.length)} offre${items.length > 1 ? "s" : ""} · calcul du ${new Date(radar.computedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Filtrer les offres" className="flex flex-wrap gap-1.5">
              {FILTER_OPTIONS.map((o) => (
                <Link key={o.value} href={href({ filter: o.value }) as never} aria-current={filter === o.value ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === o.value ? "border-foreground bg-foreground text-white" : "border-border bg-surface text-muted-strong hover:bg-surface-muted")}>
                  {o.label}
                </Link>
              ))}
            </nav>
            <nav aria-label="Trier les offres" className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted">Tri :</span>
              {SORT_OPTIONS.map((o) => (
                <Link key={o.value} href={href({ sort: o.value }) as never} aria-current={sort === o.value ? "page" : undefined} className={cn("rounded-md px-2 py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sort === o.value ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground")}>
                  {o.label}
                </Link>
              ))}
            </nav>
          </div>
          {items.length === 0 ? (
            <EmptyState
              title="Aucune offre à évaluer"
              description={c.skus === 0 ? "Ajoutez vos produits : le radar les compare aux offres de vos fournisseurs." : filter !== "all" ? "Aucune offre ne correspond à ce filtre." : "Importez un catalogue fournisseur, activez une source ou validez les correspondances offre ↔ produit."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href="/sourcing/catalog" variant="secondary">
                    Offres collectées
                  </ButtonLink>
                  <ButtonLink href="/suppliers" variant="ghost">
                    Fournisseurs et sources
                  </ButtonLink>
                </div>
              }
            />
          ) : (
            <Table className="min-w-[1100px]">
              <THead>
                <tr>
                  <TH>Produit</TH>
                  <TH>Fournisseur</TH>
                  <TH align="right">Prix</TH>
                  <TH>Évaluation</TH>
                  <TH align="right">Bénéfice / unité</TH>
                  <TH align="right">Score</TH>
                  <TH>Prix</TH>
                  <TH>
                    <span className="sr-only">Détail</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {items.map((i) => {
                  const e = i.evaluation;
                  const o = i.offer;
                  const cur = i.sku.currency;
                  return (
                    <TR key={o.offerId}>
                      <TD className="max-w-[260px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium" title={i.sku.name}>
                            {i.sku.name}
                          </span>
                          {i.savedAt ? <Bookmark className="h-3.5 w-3.5 shrink-0 fill-current text-warning" aria-label="Offre enregistrée" /> : null}
                        </div>
                        <div className="text-xs text-muted">
                          <span className="font-mono">{i.sku.code}</span> · stock {formatNumber(i.sku.quantityAvailable)} · {formatNumber(i.sku.units30d)} ventes / 30 j
                        </div>
                      </TD>
                      <TD className="max-w-[200px]">
                        <div className="truncate">{o.supplierName}</div>
                        <div className="truncate text-xs text-muted" title={PRICE_ORIGIN_LABEL[o.priceOrigin]}>
                          {PRICE_ORIGIN_LABEL[o.priceOrigin]}
                        </div>
                      </TD>
                      <TD align="right" className="whitespace-nowrap tnum">
                        {o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"}
                        <span className="ml-1 text-xs text-muted">{o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : "HT/TTC ?"}</span>
                        <div className="text-xs text-muted">{o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} dispo` : o.stockStatus === "out_of_stock" ? "en rupture" : "stock ?"}{o.moq ? ` · MOQ ${o.moq}` : ""}</div>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                          <Badge variant={VERDICT_VARIANT[i.assessment.verdict]}>{VERDICT_LABEL[i.assessment.verdict]}</Badge>
                        </div>
                        {e.missing.length > 0 ? <div className="mt-0.5 text-xs text-warning">{e.missing.length} coût{e.missing.length > 1 ? "s" : ""} inconnu{e.missing.length > 1 ? "s" : ""}</div> : null}
                        {e.reasons[0] ? <div className="mt-0.5 line-clamp-1 max-w-[260px] text-xs text-muted" title={e.reasons.join(" ")}>{e.reasons[0]}</div> : null}
                      </TD>
                      <TD align="right" className={cn("whitespace-nowrap tnum", e.estimatedProfit === null ? "text-muted" : e.estimatedProfit >= 0 ? "font-semibold text-success" : "font-semibold text-danger")}>
                        {e.estimatedProfit === null ? "—" : `${profitPrefix(e.status)}${formatMoney(e.estimatedProfit, cur)}`}
                        {e.marginPercent !== null ? <div className="text-xs font-normal text-muted">{formatNumber(e.marginPercent, 1)} %</div> : null}
                      </TD>
                      <TD align="right" className="tnum">
                        {e.score}
                      </TD>
                      <TD className={cn("whitespace-nowrap text-xs", e.freshness === "stale" || e.freshness === "unknown" ? "font-medium text-warning" : "text-muted")}>
                        {FRESHNESS_LABEL[e.freshness]}
                        {e.ageDays !== null ? <div className="text-muted">{ageDaysText(e.ageDays)}</div> : null}
                      </TD>
                      <TD>
                        <ButtonLink href={`/radar/${o.offerId}`} size="sm" variant="secondary" aria-label={`Détail de l'offre ${o.supplierName} pour ${i.sku.name}`}>
                          Détail
                        </ButtonLink>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          <p className="text-xs text-muted">Estimation sur vos paramètres de coûts. « ≈ » : bénéfice calculé avec les seuls coûts connus.</p>
        </Section>
      </div>
    </>
  );
}
