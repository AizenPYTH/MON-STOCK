import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState, Stat, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/tabs";
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
      <PageHeader
        title="Analyse"
        description={`Vos ${period} derniers jours, calculés sur vos ventes et votre stock réels. Rien n'est estimé à partir de données fictives.`}
        actions={
          <ButtonLink href="/advisor" variant="secondary">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> Demander au conseiller
          </ButtonLink>
        }
      />
      <LinkTabs label="Période d'analyse" current={`/analysis?period=${period}`} items={ANALYSIS_PERIODS.map((p) => ({ href: `/analysis?period=${p}`, label: `${p} jours` }))} />

      {empty ? (
        <EmptyState title="Pas encore de données à analyser" description="L'analyse se calcule sur vos ventes et votre stock réels. Rien n'est estimé à partir de données fictives." action={<ButtonLink href="/stock/new">Créer un produit</ButtonLink>} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Chiffre d'affaires"
              value={formatMoney(d.revenue, currency, { decimals: 0 })}
              hint={d.revenueChangePercent === null ? "Pas de période précédente comparable" : `${signedPercent(d.revenueChangePercent)} vs ${period} jours précédents (${formatMoney(d.revenuePrevious, currency, { decimals: 0 })})`}
              tone={d.revenueChangePercent === null ? undefined : d.revenueChangePercent >= 0 ? "success" : "danger"}
            />
            <Stat
              label="Marge nette estimée"
              value={d.netProfit === null ? "—" : `≈ ${formatMoney(d.netProfit, currency, { decimals: 0 })}`}
              hint={
                d.netProfitShare === null
                  ? d.netProfit === null
                    ? "Coûts d'achat inconnus"
                    : "CA nul sur la période"
                  : `${formatNumber(Math.round(d.netProfitShare))} % du CA${d.skusWithoutMargin > 0 ? ` · ${d.skusWithoutMargin} SKU exclus (coût inconnu)` : ""}${d.skusPartialMargin > 0 ? ` · provisoire (frais inconnus sur ${d.skusPartialMargin} SKU)` : ""}`
              }
              tone={d.netProfit !== null && d.netProfit < 0 ? "danger" : undefined}
            />
            <Stat label="Ventes" value={formatNumber(d.orders)} hint={d.averageBasket === null ? "Panier moyen : —" : `Panier moyen ${formatMoney(d.averageBasket, currency)}`} />
            <Stat
              label="Couverture stock"
              value={d.coverDays === null ? "—" : `${formatNumber(d.coverDays)} j`}
              hint={`Valeur au coût ≈ ${formatMoney(d.stockValue, currency, { decimals: 0 })}${d.stockWithoutCost > 0 ? ` · ${d.stockWithoutCost} SKU sans coût non comptés` : ""}`}
            />
          </div>

          {d.netProfit !== null ? (
            <p className="text-xs text-muted">
              ≈ Marge nette : unités vendues sur la période × bénéfice net unitaire actuel de chaque SKU (prix de vente, coût d&apos;achat et frais renseignés aujourd&apos;hui). Détail par produit dans{" "}
              <Link href="/margins" className="underline">
                Marges
              </Link>
              .
            </p>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="CA par semaine" description={d.weekly.length > 0 ? `${d.weekly[0]?.label} → ${d.weekly[d.weekly.length - 1]?.label} · ${currency}` : undefined} />
              <CardContent>
                <WeeklyRevenueChart weeks={d.weekly} currency={currency} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader title={`Top produits · marge (${period} j)`} description="Classés par bénéfice net estimé ; uniquement les SKU au coût d'achat connu." />
              {d.topProducts.length === 0 ? (
                <CardContent className="text-sm text-muted">{d.skusWithoutMargin > 0 ? `Aucun produit vendu avec un coût d'achat connu (${d.skusWithoutMargin} SKU vendus sans coût).` : "Aucune vente sur la période."}</CardContent>
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>#</TH>
                      <TH>Produit</TH>
                      <TH align="right">Vendus</TH>
                      <TH align="right">Bénéfice est.</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {d.topProducts.map((p, i) => (
                      <TR key={p.skuId || `${p.code}-${i}`}>
                        <TD className="tnum text-muted">{i + 1}</TD>
                        <TD>
                          {p.code ? (
                            <Link href={`/stock/${encodeURIComponent(p.code)}` as never} className="block max-w-[260px] hover:underline">
                              <span className="block truncate font-medium text-foreground">{p.label}</span>
                              <span className="font-mono text-xs text-muted">{p.code}</span>
                            </Link>
                          ) : (
                            <span className="block max-w-[260px] truncate font-medium text-foreground">{p.label}</span>
                          )}
                        </TD>
                        <TD align="right" className="tnum">
                          {formatNumber(p.units)}
                        </TD>
                        <TD align="right" className={p.profit < 0 ? "tnum font-medium text-danger" : "tnum font-medium text-success"}>
                          ≈ {formatMoney(p.profit, currency)}
                          {p.partial ? (
                            <span className="ml-1">
                              <Badge variant="warning">provisoire</Badge>
                            </span>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          </div>

          {d.topAlert ? (
            <Callout tone={d.topAlert.severity === "critical" ? "danger" : "warning"} title={d.topAlert.title} action={<ButtonLink href="/stock/alerts" variant="secondary" size="sm">Voir les alertes</ButtonLink>}>
              {d.topAlert.message ?? undefined}
            </Callout>
          ) : null}

          <p className="text-xs text-muted">
            Calculé le {formatDateTime(d.generatedAt)} · jours civils (heure de Paris) · montants en {currency} uniquement (ventes dans une autre devise non additionnées).
            {d.truncated ? " Plus de 5 000 SKU actifs : seuls les 5 000 premiers sont analysés." : ""}
          </p>
        </div>
      )}
    </>
  );
}
