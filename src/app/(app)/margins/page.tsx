import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState, Stat, Callout } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getMarginsData } from "@/features/analytics/margins";
import { flattenSearchParams, marginsParamsSchema, parseParams } from "@/features/analytics/schemas";
import { PROVIDER_LABEL } from "@/features/analytics/labels";
import { UNKNOWN_COST_LABEL } from "@/domain/pricing/margin";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Marges" };

function Unknown({ children = "Coût inconnu" }: { children?: string }) {
  return <span className="text-xs text-muted">{children}</span>;
}

export default async function MarginsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const flat = flattenSearchParams(await searchParams);
  const params = parseParams(marginsParamsSchema, flat);
  const data = await getMarginsData(ctx, params);
  const currency = ctx.organization.default_currency;
  const agg = data.aggregate;
  const hasFilters = Boolean(params.unknown || params.min_margin !== undefined);

  const makeHref = (page: number) => {
    const sp = new URLSearchParams(flat);
    sp.set("page", String(page));
    return `/margins?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Marges"
        description="Bénéfice par unité et sur 30 jours, calculé uniquement quand le coût d'achat est connu. Un coût inconnu n'est jamais compté comme zéro."
        actions={<ButtonLink href="/settings/organization" variant="secondary">Renseigner les frais</ButtonLink>}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.channels.map(({ channel, ctx: c, missing }) => (
          <Card key={channel.id} className={channel.id === data.selectedChannel?.id ? "border-foreground" : undefined}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {PROVIDER_LABEL[channel.provider] ?? channel.provider}
                  {channel.id === data.selectedChannel?.id ? <Badge variant="accent">Contexte affiché</Badge> : null}
                </span>
              }
              description={channel.name}
              className="py-3"
            />
            <CardContent className="space-y-1 py-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Commission</span>
                <span className="tnum">{c.feePercent === null ? <Unknown>Inconnue</Unknown> : formatPercent(c.feePercent, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Frais de paiement</span>
                <span className="tnum">
                  {c.paymentFeePercent === null && c.paymentFeeFixed === null ? <Unknown>Inconnus</Unknown> : `${c.paymentFeePercent !== null ? formatPercent(c.paymentFeePercent, 2) : ""}${c.paymentFeePercent !== null && c.paymentFeeFixed !== null ? " + " : ""}${c.paymentFeeFixed !== null ? formatMoney(c.paymentFeeFixed, currency) : ""}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Transport / unité</span>
                <span className="tnum">{c.shippingCost === null ? <Unknown>Inconnu</Unknown> : formatMoney(c.shippingCost, currency)}</span>
              </div>
              {missing.length > 0 ? (
                <Link href="/settings/organization" className="block pt-1 text-amber-700 underline">
                  Compléter : {missing.map((m) => UNKNOWN_COST_LABEL[m]).join(", ")}
                </Link>
              ) : (
                <div className="pt-1 text-success">Tous les frais sont renseignés.</div>
              )}
            </CardContent>
          </Card>
        ))}
        {data.channels.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted">Aucun canal de vente actif.</CardContent>
          </Card>
        ) : null}
      </div>

      <form method="get" action="/margins" className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-3 md:grid-cols-5">
        <Select name="channel" defaultValue={data.selectedChannel?.id ?? ""} aria-label="Canal (contexte de frais)">
          {data.channels.map(({ channel }) => (
            <option key={channel.id} value={channel.id}>
              Frais : {PROVIDER_LABEL[channel.provider] ?? channel.provider} · {channel.name}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={params.sort} aria-label="Tri">
          <option value="profit_total">Bénéfice total 30 j</option>
          <option value="net_margin">Marge nette %</option>
          <option value="gross_margin">Marge brute %</option>
          <option value="units">Ventes 30 j</option>
          <option value="name">Nom</option>
        </Select>
        <Input name="min_margin" type="number" step="1" defaultValue={params.min_margin ?? ""} placeholder="Marge nette min. (%)" aria-label="Marge nette minimale en pourcentage" />
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox name="unknown" value="1" defaultChecked={Boolean(params.unknown)} /> Coût inconnu uniquement
        </label>
        <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:justify-end">
          <Button type="submit" variant="secondary">
            Appliquer
          </Button>
          <ButtonLink href="/margins" variant="ghost">
            Réinitialiser
          </ButtonLink>
        </div>
      </form>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="CA 30 j (sélection)" value={formatMoney(agg.revenue30d, currency)} hint={`${formatNumber(agg.units30d)} unité(s) vendue(s) · ${agg.lines} SKU`} />
        <Stat
          label="Bénéfice estimé 30 j"
          value={agg.profit30d === null ? <span className="text-base font-medium text-muted">Pas assez de données</span> : formatMoney(agg.profit30d, currency)}
          hint={agg.included > 0 ? `Sur ${agg.included} SKU (${formatNumber(agg.unitsIncluded)} unités) au coût connu` : "Aucun SKU avec prix de vente et coût connus."}
          tone={agg.profit30d !== null && agg.profit30d < 0 ? "danger" : undefined}
        />
        <Stat label="SKU exclus" value={formatNumber(agg.excludedUnknownCost + agg.excludedUnknownSalePrice + agg.excludedOtherCurrency)} hint={agg.caveat ?? "Aucune exclusion."} tone={agg.excludedUnknownCost > 0 ? "warning" : undefined} />
        <Stat
          label="Frais déduits"
          value={agg.missingFees.length === 0 ? "Complets" : <span className="text-base font-medium text-warning">Partiels</span>}
          hint={agg.missingFees.length === 0 ? "Commission, paiement et transport connus." : `Non déduits : ${agg.missingFees.map((m) => UNKNOWN_COST_LABEL[m]).join(", ")}.`}
        />
      </div>

      {agg.excludedUnknownCost > 0 && !params.unknown ? (
        <Callout tone="warning" className="mb-4" title={`${agg.excludedUnknownCost} SKU exclu${agg.excludedUnknownCost > 1 ? "s" : ""} du bénéfice : coût d'achat inconnu.`} action={<ButtonLink href="/margins?unknown=1" variant="secondary" size="sm">Voir ces SKU</ButtonLink>}>
          Renseignez le prix d'achat sur chaque fiche SKU (ou réceptionnez une commande fournisseur avec coût) pour les inclure.
        </Callout>
      ) : null}

      {data.lines.length === 0 ? (
        <EmptyState
          title={data.total === 0 && !hasFilters ? "Aucun SKU actif." : "Aucun SKU ne correspond à ces filtres."}
          description={data.total === 0 && !hasFilters ? "Créez des produits avec un prix de vente et un coût d'achat pour voir vos marges." : undefined}
          action={hasFilters ? <ButtonLink href="/margins" variant="secondary">Réinitialiser</ButtonLink> : <ButtonLink href="/stock/new">Créer un produit</ButtonLink>}
        />
      ) : (
        <div className="space-y-3">
          <Table className="min-w-[1240px]">
            <THead>
              <tr>
                <TH>Produit</TH>
                <TH align="right">Prix de vente</TH>
                <TH align="right">Prix d'achat</TH>
                <TH align="right">Frais marketplace</TH>
                <TH align="right">Frais paiement</TH>
                <TH align="right">Transport</TH>
                <TH align="right">Bénéfice / unité</TH>
                <TH align="right">Marge brute</TH>
                <TH align="right">Marge nette est.</TH>
                <TH align="right">Ventes 30 j</TH>
                <TH align="right">Bénéfice 30 j</TH>
              </tr>
            </THead>
            <TBody>
              {data.lines.map((l) => {
                const m = l.margin;
                return (
                  <TR key={l.skuId}>
                    <TD>
                      <Link href={`/stock/${encodeURIComponent(l.code)}` as never} className="block max-w-[280px]">
                        <div className="truncate font-medium text-foreground">{l.name}</div>
                        <div className="font-mono text-xs text-muted">{l.code}</div>
                      </Link>
                    </TD>
                    <TD align="right">
                      {l.salePrice === null ? <Unknown>Non renseigné</Unknown> : formatMoney(l.salePrice, l.currency)}
                      {l.salePriceSource === "avg_30d" ? <div className="text-xs text-muted">moyenne 30 j</div> : null}
                    </TD>
                    <TD align="right">
                      {l.costPrice === null ? (
                        <Link href={`/stock/${encodeURIComponent(l.code)}/edit` as never} className="text-xs text-amber-700 underline">
                          Coût inconnu
                        </Link>
                      ) : (
                        formatMoney(l.costPrice, l.currency)
                      )}
                    </TD>
                    <TD align="right">{m.marketplaceFee === null ? <Unknown>{l.salePrice === null ? "—" : "Inconnus"}</Unknown> : formatMoney(m.marketplaceFee, l.currency)}</TD>
                    <TD align="right">{m.paymentFee === null ? <Unknown>{l.salePrice === null ? "—" : "Inconnus"}</Unknown> : formatMoney(m.paymentFee, l.currency)}</TD>
                    <TD align="right">{m.shippingCost === null ? <Unknown>Inconnu</Unknown> : formatMoney(m.shippingCost, l.currency)}</TD>
                    <TD align="right" className={m.netProfit !== null && m.netProfit < 0 ? "text-danger" : ""} title={m.caveat ?? undefined}>
                      {m.netProfit === null ? <Unknown>{m.caveat ?? "Non calculable"}</Unknown> : formatMoney(m.netProfit, l.currency)}
                    </TD>
                    <TD align="right">{m.grossMarginPercent === null ? <Unknown /> : formatPercent(m.grossMarginPercent, 1)}</TD>
                    <TD align="right" title={m.caveat ?? undefined}>
                      {m.netMarginPercent === null ? (
                        <Unknown />
                      ) : (
                        <span>
                          {formatPercent(m.netMarginPercent, 1)}
                          {!m.complete ? <span className="ml-1 text-xs text-amber-700">partielle</span> : null}
                        </span>
                      )}
                    </TD>
                    <TD align="right">{formatNumber(l.units30d)}</TD>
                    <TD align="right" className={l.profit30d !== null && l.profit30d < 0 ? "font-medium text-danger" : "font-medium"}>
                      {l.profit30d === null ? <Unknown>Exclu</Unknown> : formatMoney(l.profit30d, l.currency)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} makeHref={makeHref} />
          {data.truncated ? <p className="text-xs text-muted">Plus de 5 000 SKU actifs : seuls les 5 000 premiers sont analysés.</p> : null}
        </div>
      )}
    </>
  );
}
