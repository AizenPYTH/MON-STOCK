import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { EmptyState, Callout } from "@/components/ui/page";
import { FilterChip, Paper, Scene, SceneHeader } from "@/components/instrument";
import { SceneStatGrid } from "@/features/analytics/components/scene-stats";
import { InventoryStatus, OrderStatusBadge, type InventoryState } from "@/features/analytics/components/order-status";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/toolbar";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getSalesSummary, listOrders, PENDING_ORDERS_MAX, type OrderListRow } from "@/features/analytics/sales";
import { flattenSearchParams, ORDER_STATUSES, parseParams, salesListParamsSchema } from "@/features/analytics/schemas";
import { ORDER_STATUS_LABEL, PROVIDER_LABEL } from "@/features/analytics/labels";
import { formatDate, formatMoney, formatNumber, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Ventes" };

function inventoryState({ order, itemsCount, unmappedItems, pendingInventoryItems }: OrderListRow): InventoryState {
  if (order.status === "cancelled" || order.status === "refunded") return "void";
  if (itemsCount === 0) return "none";
  if (unmappedItems === itemsCount) return "unmapped";
  if (pendingInventoryItems > 0) return "pending";
  return order.inventory_applied ? "applied" : "partial";
}

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
  /** Puce de statut : garde les autres filtres, revient à la page 1. */
  const statusHref = (status: string | null) => {
    const sp = new URLSearchParams(flat);
    sp.delete("page");
    if (status) sp.set("status", status);
    else sp.delete("status");
    const qs = sp.toString();
    return qs ? `/sales?${qs}` : "/sales";
  };

  return (
    <>
      <Scene>
        <SceneHeader eyebrow="Pilotage · ventes" title="Ventes" description="Commandes importées depuis vos canaux ou saisies manuellement. Les statistiques excluent les commandes annulées et remboursées ; les jours sont comptés à l'heure de Paris." />
        <SceneStatGrid
          stats={[
            { label: "Aujourd'hui", value: formatMoney(summary.today.revenue, currency), hint: `${formatNumber(summary.today.orders)} commande(s) · ${formatNumber(summary.today.units)} unité(s)` },
            { label: "7 derniers jours", value: formatMoney(summary.last7d.revenue, currency), hint: `${formatNumber(summary.last7d.orders)} commande(s) · ${formatNumber(summary.last7d.units)} unité(s)` },
            { label: "30 derniers jours", value: formatMoney(summary.last30d.revenue, currency), hint: `${formatNumber(summary.last30d.orders)} commande(s) · ${formatNumber(summary.last30d.units)} unité(s)` },
          ]}
        />
      </Scene>
      <Paper>
        {foreign ? (
          <Callout tone="info" className="mb-4" title="Ventes dans une autre devise">
            Les montants ci-dessus sont en {currency} uniquement. Ventes des 30 derniers jours dans une autre devise, non converties et non additionnées : {foreign}. Les commandes et unités sont, elles, comptées.
          </Callout>
        ) : null}

        {result.partial ? (
          <Callout tone="warning" className="mb-4" title="Liste partielle">
            Beaucoup de commandes ont du stock non déduit : seules les {formatNumber(PENDING_ORDERS_MAX)} plus récentes sont listées ici. Le total affiché est un minimum.
          </Callout>
        ) : null}

        <nav aria-label="Filtrer par statut" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" data-scroll-x>
          <FilterChip href={statusHref(null)} selected={!params.status}>
            Toutes
          </FilterChip>
          {ORDER_STATUSES.map((s) => (
            <FilterChip key={s} href={statusHref(s)} selected={params.status === s}>
              {ORDER_STATUS_LABEL[s] ?? s}
            </FilterChip>
          ))}
        </nav>

        <form method="get" action="/sales" role="search" aria-label="Rechercher des commandes" className="mb-4 rounded-2xl border border-border bg-surface p-3">
          {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_12rem_12rem_auto_auto]">
            <SearchInput name="q" defaultValue={params.q ?? ""} placeholder="N° de commande, acheteur…" aria-label="Recherche" wrapperClassName="col-span-2 md:col-span-1" />
            <Select name="channel" defaultValue={params.channel ?? ""} aria-label="Canal" className="col-span-2 md:col-span-1">
              <option value="">Tous les canaux</option>
              {result.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.name}
                </option>
              ))}
            </Select>
            <label className="col-span-2 flex h-10 cursor-pointer items-center gap-2.5 rounded-xl border border-border-control bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-2 md:col-span-1 xl:order-last xl:col-span-1">
              <Checkbox name="inventory" value="pending" defaultChecked={params.inventory === "pending"} />
              <span className="truncate">Stock non déduit</span>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm xl:flex-row xl:items-center xl:gap-2">
              <span className="ms-mono shrink-0 text-[10.5px] text-ink-3 xl:w-5">Du</span>
              <Input name="from" type="date" defaultValue={params.from ?? ""} aria-label="Du" className="tnum" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm xl:flex-row xl:items-center xl:gap-2">
              <span className="ms-mono shrink-0 text-[10.5px] text-ink-3 xl:w-5">Au</span>
              <Input name="to" type="date" defaultValue={params.to ?? ""} aria-label="Au" className="tnum" />
            </label>
            <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-1 xl:order-last">
              {hasFilters ? (
                <ButtonLink href="/sales" variant="ghost">
                  Réinitialiser
                </ButtonLink>
              ) : null}
              <Button type="submit" variant="dark" className="max-md:flex-1">
                Filtrer
              </Button>
            </div>
          </div>
        </form>

        {result.rows.length === 0 ? (
          hasFilters ? (
            <EmptyState title="Aucune commande ne correspond à ces filtres." description="Élargissez la période ou retirez un filtre." action={<ButtonLink href="/sales" variant="secondary">Réinitialiser les filtres</ButtonLink>} />
          ) : (
            <EmptyState
              icon={<ShoppingBag aria-hidden="true" />}
              title="Aucune commande."
              description="Connectez eBay pour importer vos ventes : chaque commande rattachée à un SKU déduit automatiquement le stock."
              action={<ButtonLink href="/settings/integrations">Connecter eBay</ButtonLink>}
            />
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted tnum" aria-live="polite">
              <span className="font-semibold text-foreground">
                {result.partial ? "au moins " : ""}
                {formatNumber(result.total)}
              </span>{" "}
              commande{result.total > 1 ? "s" : ""}
              {hasFilters ? " correspondant aux filtres" : ""}
            </p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <Table stackOnMobile className="min-w-[960px]" caption="Commandes">
                <THead>
                  <tr>
                    <TH>N° commande</TH>
                    <TH>Date</TH>
                    <TH>Canal</TH>
                    <TH>Acheteur</TH>
                    <TH align="right">Articles</TH>
                    <TH align="right">Total</TH>
                    <TH>Statut</TH>
                    <TH>Stock</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.rows.map((row) => {
                    const { order, channel, itemsCount, units, unmappedItems, pendingInventoryItems } = row;
                    return (
                      <TR key={order.id}>
                        <TD primary>
                          <Link href={`/sales/${order.id}`} className="ms-code rounded text-[13px] font-semibold text-foreground underline-offset-4 hover:text-interactive hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                            {order.order_number ?? order.external_order_id}
                          </Link>
                        </TD>
                        <TD label="Date" className="whitespace-nowrap tnum">
                          <span>
                            <span className="text-foreground">{formatDate(order.placed_at)}</span> <span className="text-ink-3">{formatTime(order.placed_at)}</span>
                          </span>
                        </TD>
                        <TD label="Canal" className="text-muted">
                          {channel ? `${PROVIDER_LABEL[channel.provider] ?? channel.provider}` : (PROVIDER_LABEL[order.provider] ?? order.provider)}
                        </TD>
                        <TD label="Acheteur">
                          <span className="block max-w-[200px] truncate">{order.buyer_username ?? <span className="text-muted">Non communiqué</span>}</span>
                        </TD>
                        <TD label="Articles" numeric>
                          {formatNumber(itemsCount)}
                          {units !== itemsCount ? <span className="ml-1 text-xs text-ink-3">({formatNumber(units)} u.)</span> : null}
                        </TD>
                        <TD label="Total" numeric className="font-semibold text-foreground">
                          {formatMoney(order.total, order.currency)}
                        </TD>
                        <TD label="Statut">
                          <OrderStatusBadge status={order.status} />
                        </TD>
                        <TD label="Stock">
                          <span className="inline-flex flex-col items-end gap-0.5 sm:items-start">
                            <InventoryStatus state={inventoryState(row)} pendingCount={pendingInventoryItems} />
                            {unmappedItems > 0 && unmappedItems < itemsCount ? <span className="text-xs text-muted">{unmappedItems} ligne(s) non associée(s)</span> : null}
                          </span>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} makeHref={makeHref} />
          </div>
        )}
      </Paper>
    </>
  );
}
