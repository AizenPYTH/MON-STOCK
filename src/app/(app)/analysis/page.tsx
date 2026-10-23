import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Info, Sparkles } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { EmptyState, Callout } from "@/components/ui/page";
import { Paper, Scene, SceneHeader, Segmented } from "@/components/instrument";
import { SceneStatGrid } from "@/features/analytics/components/scene-stats";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { getAnalysis } from "@/features/analysis/queries";
import { ANALYSIS_PERIODS, parseAnalysisPeriod } from "@/features/analysis/analysis.pure";
import { WeeklyRevenueChart } from "@/features/analysis/components/weekly-revenue-chart";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Analyse" };

function signedPercent(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatPercent(Math.abs(v), 1)}`;
}

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const period = parseAnalysisPeriod((await searchParams).period);
  const d = await getAnalysis(ctx, period);
  const currency = ctx.organization.default_currency;
  const empty = d.revenue === 0 && d.orders === 0 && d.skuCount === 0;

  return (
    <>
      <Scene>
        <SceneHeader
          eyebrow={`Pilotage · ${period} derniers jours`}
          title="Analyse"
          description={`Vos ${period} derniers jours, calculés sur vos ventes et votre stock réels. Rien n'est estimé à partir de données fictives.`}
          actions={
            <ButtonLink href="/advisor" variant="night">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-mint" /> Demander au conseiller
            </ButtonLink>
          }
        />
        {!empty ? (
          <SceneStatGrid
            stats={[
              {
                label: "Chiffre d'affaires",
                value: formatMoney(d.revenue, currency, { decimals: 0 }),
                hint: d.revenueChangePercent === null ? "Pas de période précédente comparable" : `${signedPercent(d.revenueChangePercent)} vs ${period} jours précédents (${formatMoney(d.revenuePrevious, currency, { decimals: 0 })})`,
                tone: d.revenueChangePercent === null ? undefined : d.revenueChangePercent >= 0 ? "mint" : "danger",
              },
              {
                label: "Marge nette estimée",
                value: d.netProfit === null ? null : `≈ ${formatMoney(d.netProfit, currency, { decimals: 0 })}`,
                hint:
                  d.netProfitShare === null
                    ? d.netProfit === null
                      ? "Coûts d'achat inconnus"
                      : "CA nul sur la période"
                    : `${formatNumber(Math.round(d.netProfitShare))} % du CA${d.skusWithoutMargin > 0 ? ` · ${d.skusWithoutMargin} SKU exclus (coût inconnu)` : ""}${d.skusPartialMargin > 0 ? ` · provisoire (frais inconnus sur ${d.skusPartialMargin} SKU)` : ""}`,
                tone: d.netProfit !== null && d.netProfit < 0 ? "danger" : undefined,
              },
              { label: "Ventes", value: formatNumber(d.orders), hint: d.averageBasket === null ? "Panier moyen : —" : `Panier moyen ${formatMoney(d.averageBasket, currency)}` },
              {
                label: "Couverture stock",
                value: d.coverDays === null ? null : `${formatNumber(d.coverDays)} j`,
                hint: `Valeur au coût ≈ ${formatMoney(d.stockValue, currency, { decimals: 0 })}${d.stockWithoutCost > 0 ? ` · ${d.stockWithoutCost} SKU sans coût non comptés` : ""}`,
              },
            ]}
          />
        ) : null}
      </Scene>
      <Paper>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Période d'analyse" options={ANALYSIS_PERIODS.map((p) => ({ href: `/analysis?period=${p}`, label: `${p} jours`, selected: p === period }))} />
          {!empty ? <p className="text-xs text-ink-3 tnum">Calculé le {formatDateTime(d.generatedAt)}</p> : null}
        </div>

        {empty ? (
          <EmptyState icon={<BarChart3 aria-hidden="true" />} title="Pas encore de données à analyser" description="L'analyse se calcule sur vos ventes et votre stock réels. Rien n'est estimé à partir de données fictives." action={<ButtonLink href="/stock/new">Créer un produit</ButtonLink>} />
        ) : (
          <div className="space-y-5">
            {d.truncated ? (
              <Callout tone="warning" title="Analyse partielle">
                Plus de 5 000 SKU actifs : seuls les 5 000 premiers sont analysés. Les chiffres de stock ci-dessus sont partiels.
              </Callout>
            ) : null}
            {d.topAlert ? (
              <Callout tone={d.topAlert.severity === "critical" ? "danger" : "warning"} title={d.topAlert.title} action={<ButtonLink href="/stock/alerts" variant="secondary" size="sm">Voir les alertes</ButtonLink>}>
                {d.topAlert.message ?? undefined}
              </Callout>
            ) : null}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader eyebrow={`${period} derniers jours`} title="CA par semaine" description={d.weekly.length > 0 ? `${d.weekly[0]?.label} → ${d.weekly[d.weekly.length - 1]?.label} · ${currency}` : undefined} />
                <CardContent className="pt-8">
                  <WeeklyRevenueChart weeks={d.weekly} currency={currency} />
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader eyebrow="Estimation" title={`Top produits · marge (${period} j)`} description="Classés par bénéfice net estimé ; uniquement les SKU au coût d'achat connu." />
                {d.topProducts.length === 0 ? (
                  <EmptyState variant="plain" size="sm" title="Aucun produit classé" description={d.skusWithoutMargin > 0 ? `Aucun produit vendu avec un coût d'achat connu (${d.skusWithoutMargin} SKU vendus sans coût).` : "Aucune vente sur la période."} />
                ) : (
                  <Table stackOnMobile className="min-w-0" caption={`Top produits par bénéfice estimé sur ${period} jours`}>
                    <THead>
                      <tr>
                        <TH className="w-10">#</TH>
                        <TH>Produit</TH>
                        <TH align="right">Vendus</TH>
                        <TH align="right">Bénéfice est.</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {d.topProducts.map((p, i) => (
                        <TR key={p.skuId || `${p.code}-${i}`}>
                          <TD label="Rang" className="w-10 text-ink-3 tnum">
                            {i + 1}
                          </TD>
                          <TD primary>
                            {p.code ? (
                              <Link href={`/stock/${encodeURIComponent(p.code)}`} className="group block min-w-0 max-w-[300px] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                                <span className="block truncate font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">{p.label}</span>
                                <span className="ms-code text-xs font-normal text-ink-3">{p.code}</span>
                              </Link>
                            ) : (
                              <span className="block max-w-[300px] truncate font-semibold text-foreground">{p.label}</span>
                            )}
                          </TD>
                          <TD label="Vendus" numeric>
                            {formatNumber(p.units)}
                          </TD>
                          <TD label="Bénéfice est." numeric>
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {p.partial ? <Badge variant="warning">provisoire</Badge> : null}
                              <span className={p.profit < 0 ? "font-semibold text-danger" : "font-semibold text-success"}>
                                <span className="font-medium opacity-60">≈</span> {formatMoney(p.profit, currency)}
                              </span>
                            </span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            </div>

            <div className="space-y-1.5 border-t border-border pt-4 text-xs text-muted">
              {d.netProfit !== null ? (
                <p className="flex items-start gap-1.5">
                  <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-ink-3" />
                  <span>
                    ≈ Marge nette : unités vendues sur la période × bénéfice net unitaire actuel de chaque SKU (prix de vente, coût d&apos;achat et frais renseignés aujourd&apos;hui). Détail par produit dans{" "}
                    <Link href="/margins" className="font-semibold text-interactive underline underline-offset-2 hover:text-interactive-hover">
                      Marges
                    </Link>
                    .
                  </span>
                </p>
              ) : null}
              <p className="pl-5">
                Calculé le {formatDateTime(d.generatedAt)} · jours civils (heure de Paris) · montants en {currency} uniquement (ventes dans une autre devise non additionnées).
                {d.truncated ? " Plus de 5 000 SKU actifs : seuls les 5 000 premiers sont analysés." : ""}
              </p>
            </div>
          </div>
        )}
      </Paper>
    </>
  );
}
