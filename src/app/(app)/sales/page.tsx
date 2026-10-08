import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState, Stat, Callout } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getSalesSummary, listOrders } from "@/features/analytics/sales";
import { flattenSearchParams, ORDER_STATUSES, parseParams, salesListParamsSchema } from "@/features/analytics/schemas";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, PROVIDER_LABEL } from "@/features/analytics/labels";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Ventes" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const flat = flattenSearchParams(await searchParams);
  const params = parseParams(salesListParamsSchema, flat);
  const [result, summary] = await Promise.all([listOrders(ctx, params), getSalesSummary(ctx)]);
  const currency = ctx.organization.default_currency;
  const hasFilters = Object.keys(flat).some((k) => k !== "page");
  const foreign = summary.otherCurrencies.map((f) => `${formatMoney(f.revenue, f.currency)} (${f.orders} commande${f.orders > 1 ? "s" : ""})`).join(" · ");

  const makeHref = (page: number) => {
    const sp = new URLSearchParams(flat);
    sp.set("page", String(page));
    return `/sales?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader title="Ventes" description="Commandes importées depuis vos canaux ou saisies manuellement. Les statistiques excluent les commandes annulées et remboursées ; les jours sont comptés à l'heure de Paris." />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Aujourd'hui" value={formatMoney(summary.today.revenue, currency)} hint={`${formatNumber(summary.today.orders)} commande(s) · ${formatNumber(summary.today.units)} unité(s)`} />
        <Stat label="7 derniers jours" value={formatMoney(summary.last7d.revenue, currency)} hint={`${formatNumber(summary.last7d.orders)} commande(s) · ${formatNumber(summary.last7d.units)} unité(s)`} />
        <Stat label="30 derniers jours" value={formatMoney(summary.last30d.revenue, currency)} hint={`${formatNumber(summary.last30d.orders)} commande(s) · ${formatNumber(summary.last30d.units)} unité(s)`} />
      </div>
      {foreign ? (
        <Callout tone="info" className="mb-5" title="Ventes dans une autre devise">
          Les montants ci-dessus sont en {currency} uniquement. Ventes des 30 derniers jours dans une autre devise, non converties et non additionnées : {foreign}. Les commandes et unités sont, elles, comptées.
        </Callout>
      ) : null}

      <form method="get" action="/sales" className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-3 md:grid-cols-4 xl:grid-cols-8">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="N° de commande, acheteur…" className="col-span-2" aria-label="Recherche" />
        <Select name="channel" defaultValue={params.channel ?? ""} aria-label="Canal">
          <option value="">Canal</option>
          {result.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={params.status ?? ""} aria-label="Statut">
          <option value="">Statut</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={params.from ?? ""} aria-label="Du" />
        <Input name="to" type="date" defaultValue={params.to ?? ""} aria-label="Au" />
        <label className="col-span-2 flex h-9 items-center gap-2 text-sm md:col-span-1">
          <Checkbox name="inventory" value="pending" defaultChecked={params.inventory === "pending"} /> Stock non déduit
        </label>
        <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:justify-end">
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
          <ButtonLink href="/sales" variant="ghost">
            Réinitialiser
          </ButtonLink>
        </div>
      </form>

      {result.rows.length === 0 ? (
        hasFilters ? (
          <EmptyState title="Aucune commande ne correspond à ces filtres." action={<ButtonLink href="/sales" variant="secondary">Réinitialiser les filtres</ButtonLink>} />
        ) : (
          <EmptyState
            title="Aucune commande."
            description="Connectez eBay pour importer vos ventes : chaque commande rattachée à un SKU déduit automatiquement le stock."
            action={<ButtonLink href="/settings/integrations">Connecter eBay</ButtonLink>}
          />
        )
      ) : (
        <div className="space-y-3">
          <Table className="min-w-[980px]">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Canal</TH>
                <TH>N° commande</TH>
                <TH>Acheteur</TH>
                <TH align="right">Articles</TH>
                <TH align="right">Total</TH>
                <TH>Statut</TH>
                <TH>Stock déduit ?</TH>
              </tr>
            </THead>
            <TBody>
              {result.rows.map(({ order, channel, itemsCount, units, unmappedItems, pendingInventoryItems }) => {
                const cancelled = order.status === "cancelled" || order.status === "refunded";
                return (
                  <TR key={order.id}>
                    <TD className="text-muted">{formatDateTime(order.placed_at)}</TD>
                    <TD>{channel ? `${PROVIDER_LABEL[channel.provider] ?? channel.provider}` : PROVIDER_LABEL[order.provider] ?? order.provider}</TD>
                    <TD>
                      <Link href={`/sales/${order.id}` as never} className="font-mono text-xs font-medium hover:underline">
                        {order.order_number ?? order.external_order_id}
                      </Link>
                    </TD>
                    <TD>{order.buyer_username ?? <span className="text-xs text-muted">Non communiqué</span>}</TD>
                    <TD align="right">
                      {itemsCount}
                      {units !== itemsCount ? <span className="ml-1 text-xs text-muted">({units} u.)</span> : null}
                    </TD>
                    <TD align="right">{formatMoney(order.total, order.currency)}</TD>
                    <TD>
                      <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? "neutral"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                    </TD>
                    <TD>
                      {cancelled ? (
                        <span className="text-xs text-muted">Recrédité / sans effet</span>
                      ) : itemsCount === 0 ? (
                        <span className="text-xs text-muted">—</span>
                      ) : unmappedItems === itemsCount ? (
                        <Badge variant="outline">Non associée</Badge>
                      ) : pendingInventoryItems > 0 ? (
                        <Badge variant="warning">Non déduit ({pendingInventoryItems})</Badge>
                      ) : order.inventory_applied ? (
                        <Badge variant="success">Oui</Badge>
                      ) : (
                        <Badge variant="neutral">Partiel</Badge>
                      )}
                      {unmappedItems > 0 && unmappedItems < itemsCount ? <div className="text-xs text-muted">{unmappedItems} ligne(s) non associée(s)</div> : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} makeHref={makeHref} />
        </div>
      )}
    </>
  );
}
