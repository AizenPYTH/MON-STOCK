import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Bookmark, Settings2 } from "lucide-react";
import { requireOrgContext, canWrite, type OrgContext } from "@/features/auth/dal";
import { FilterChip, MonoTitle, Paper, Scene, SplitBar, StageFigure } from "@/components/instrument";
import { buildRadar, buildRadarOffer } from "@/services/radar/radar";
import { countPendingMatches } from "@/features/sourcing/queries";
import type { RadarItemDTO, RadarOfferDetailDTO, RadarRestockDTO, RadarSort } from "@/features/mobile-api/contract";
import { isAppError, toUserMessage } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { FILTER_OPTIONS, FRESHNESS_LABEL, PRICE_ORIGIN_SHORT, STATUS_LABEL, filterItems, parseRadarParams, radarFigure, radarHref, signedProfit, type RadarFilter } from "@/features/radar/labels";
import { Chip, FRESH_CHIP, STATUS_CHIP } from "@/features/radar/components/chips";
import { OfferStretchLink } from "@/features/radar/components/offer-link";
import { RadarOfferDetail } from "@/features/radar/components/offer-detail";
import { RadarSortSelect } from "@/features/radar/components/sort-select";

export const metadata: Metadata = { title: "Radar d'opportunités" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESTOCK_VISIBLE = 6;

const SEGMENTS = [
  { key: "profitable", label: "Rentables", color: "var(--mint)" },
  { key: "estimated", label: "Estimations", color: "var(--amber)" },
  { key: "unprofitable", label: "Non rentables", color: "var(--danger-on-night)" },
  { key: "insufficient", label: "Incomplètes", color: "color-mix(in srgb, var(--on-night) 26%, transparent)" },
] as const;

/**
 * Radar d'opportunités d'achat : vos offres fournisseurs réelles comparées à vos ventes réelles,
 * coût complet et qualité des données à l'appui. Une estimation incomplète n'est jamais affichée
 * comme un bénéfice certain ; aucune commande n'est passée sans votre confirmation. Le détail de
 * l'offre choisie (`?offer=`) s'affiche dans la colonne de droite (pleine page sous 1280 px).
 */
export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const { sort, filter } = parseRadarParams(sp);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const rawOffer = one(sp.offer);
  const rawQty = one(sp.quantity);
  const qty = /^\d{1,6}$/.test(rawQty) && Number(rawQty) >= 1 && Number(rawQty) <= 100_000 ? Number(rawQty) : null;
  const [radar, pendingMatches] = await Promise.all([buildRadar(ctx, { sort }), countPendingMatches(ctx)]);
  const items = filterItems(radar.items, filter);
  const c = radar.counts;
  const { positive, evaluated } = radarFigure(c);
  const selected = UUID.test(rawOffer) && radar.items.some((i) => i.offer.offerId === rawOffer) ? rawOffer : (items[0]?.offer.offerId ?? null);
  const cur = ctx.organization.default_currency;
  const columnHref = (offer: string) => radarHref({ sort, filter, offer });

  return (
    <>
      <Scene>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ms-mono text-[11px] leading-[14px] tracking-[0.08em] text-on-night-muted">Sourcing · ventes réelles × offres fournisseurs</div>
            <h1 className="mt-1 text-[28px] font-extrabold leading-[34px] tracking-[-0.6px] text-on-night">Radar d&apos;opportunités</h1>
          </div>
          <Link href="/radar/settings" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-night-raised px-3 text-[13.5px] font-bold text-on-night hover:bg-night-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <Settings2 aria-hidden="true" className="h-4 w-4" /> Coûts du radar
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-x-14 gap-y-5">
          <div className="flex flex-col gap-1">
            <span className="ms-mono text-[10px] leading-[13px] text-on-night-muted">Offres à bénéfice positif</span>
            <span className="flex items-baseline gap-2">
              <StageFigure value={formatNumber(positive)} size="md" />
              <span className="text-[20px] font-medium text-on-night-muted">sur {formatNumber(evaluated)} évaluée{evaluated > 1 ? "s" : ""}</span>
            </span>
          </div>
          <div className="flex min-w-0 max-w-[640px] flex-[1_1_440px] flex-col gap-3">
            <SplitBar onNight legend={false} height={10} segments={SEGMENTS.map((s) => ({ label: s.label, value: c[s.key], color: s.color }))} />
            <dl className="grid grid-cols-2 border-t border-night-line sm:grid-cols-4">
              {SEGMENTS.map((s, i) => (
                <div key={s.key} className={cn("flex flex-col gap-1 pb-1 pr-1.5 pt-2.5", i > 0 && "sm:border-l sm:border-night-line sm:pl-4", i === 2 && "max-sm:pl-0")}>
                  <dt className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-[7px] w-[7px] rounded-[1.5px]" style={{ background: s.color }} />
                    <span className="ms-mono truncate text-[10px] leading-[13px] text-on-night-subtle">{s.label}</span>
                  </dt>
                  <dd className="text-[20px] font-bold leading-[26px] text-on-night tnum">{formatNumber(c[s.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Scene>

      <Paper>
        <Banners missing={radar.missingSettings} pendingMatches={pendingMatches} unlinked={c.unlinkedOffers} fromChannel={radar.settingsFromChannel} />
        <div className="flex flex-col gap-7 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-col gap-[22px] xl:w-[520px] xl:shrink">
            {radar.restock.length > 0 ? <Restock rows={radar.restock} currency={cur} columnHref={columnHref} /> : null}
            <section className="flex flex-col gap-2.5" aria-label="Offres évaluées">
              <MonoTitle title="Offres évaluées" count={items.length} as="h2" right={<RadarSortSelect sort={sort} filter={filter} offer={selected} />} />
              <nav aria-label="Filtrer les offres" className="flex flex-wrap gap-1.5">
                {FILTER_OPTIONS.map((o) => (
                  <FilterChip key={o.value} href={radarHref({ sort, filter: o.value })} selected={filter === o.value}>
                    {o.label}
                  </FilterChip>
                ))}
              </nav>
              {items.length === 0 ? (
                <EmptyOffers skus={c.skus} filter={filter} />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {items.map((i) => (
                    <li key={i.offer.offerId}>
                      <OfferCard item={i} selected={i.offer.offerId === selected} columnHref={columnHref(i.offer.offerId)} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs font-semibold text-ink-3">
                Calcul du {new Date(radar.computedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} sur vos paramètres de coûts. « ≈ » : bénéfice calculé avec les seuls coûts connus.
              </p>
            </section>
          </div>
          <div className="hidden min-w-0 flex-1 xl:sticky xl:top-[72px] xl:block">
            {selected ? (
              <Suspense key={`${selected}-${qty ?? ""}`} fallback={<DetailSkeleton />}>
                <DetailColumn ctx={ctx} offerId={selected} qty={qty} sort={sort} filter={filter} />
              </Suspense>
            ) : (
              <p className="rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center text-sm font-medium text-muted">Choisissez une offre pour voir son calcul.</p>
            )}
          </div>
        </div>
      </Paper>
    </>
  );
}

async function DetailColumn({ ctx, offerId, qty, sort, filter }: { ctx: OrgContext; offerId: string; qty: number | null; sort: RadarSort; filter: RadarFilter }) {
  let detail: RadarOfferDetailDTO | null = null;
  let error: string | null = null;
  try {
    detail = await buildRadarOffer(ctx, offerId, qty ? [qty] : []);
  } catch (e) {
    error = isAppError(e) && e.code === "NOT_FOUND" ? "Cette offre n'est plus dans le radar (expirée ou dissociée de son produit)." : toUserMessage(e);
  }
  if (!detail) return <p className="rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center text-sm font-medium text-muted">{error}</p>;
  const hidden: Record<string, string> = { offer: offerId };
  if (sort !== "score") hidden.sort = sort;
  if (filter !== "all") hidden.filter = filter;
  return <RadarOfferDetail detail={detail} writable={canWrite(ctx.role)} variant="column" peerHref={(id) => radarHref({ sort, filter, offer: id })} quantity={{ action: "/radar", hidden, value: qty }} />;
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <span className="sr-only">Calcul de l&apos;offre…</span>
      <span className="ms-pulse block h-7 w-2/3 rounded-lg bg-track" />
      <span className="ms-pulse block h-28 rounded-[14px] bg-background" />
      <span className="ms-pulse block h-12 w-1/2 rounded-lg bg-track" />
      <span className="ms-pulse block h-56 rounded-2xl bg-background" />
    </div>
  );
}

function Banners({ missing, pendingMatches, unlinked, fromChannel }: { missing: string[]; pendingMatches: number; unlinked: number; fromChannel: string[] }) {
  if (missing.length === 0 && pendingMatches === 0 && unlinked === 0 && fromChannel.length === 0) return null;
  return (
    <div className="mb-5 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2.5">
        {missing.length > 0 ? (
          <Link href="/radar/settings" className="flex min-h-12 flex-[1_1_360px] items-center gap-2.5 rounded-2xl border border-warning-line bg-warning-soft px-3.5 py-3 hover:brightness-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber" />
            <span className="flex-1 text-sm font-semibold leading-5 text-warning-ink">Coûts manquants ({missing.join(", ")}) : bénéfices partiels. Compléter →</span>
          </Link>
        ) : null}
        {pendingMatches > 0 ? (
          <Link href="/sourcing/matches" className="flex min-h-12 flex-[1_1_360px] items-center gap-2.5 rounded-2xl bg-inverse px-3.5 py-3 transition-colors hover:bg-inverse-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber" />
            <span className="flex-1 text-sm font-semibold leading-5 text-on-inverse">
              {formatNumber(pendingMatches)} offre{pendingMatches > 1 ? "s" : ""} à rapprocher de vos produits →
            </span>
          </Link>
        ) : null}
      </div>
      {pendingMatches === 0 && unlinked > 0 ? (
        <p className="text-xs font-semibold text-ink-3">
          {formatNumber(unlinked)} offre{unlinked > 1 ? "s" : ""} sans produit correspondant (non comptée{unlinked > 1 ? "s" : ""}).
        </p>
      ) : null}
      {fromChannel.length > 0 ? <p className="text-xs font-semibold text-ink-3">Repris de votre canal de vente faute de réglage : {fromChannel.join(", ")}.</p> : null}
    </div>
  );
}

function Restock({ rows, currency, columnHref }: { rows: RadarRestockDTO[]; currency: string; columnHref: (offer: string) => string }) {
  const row = (r: RadarRestockDTO) => (
    <li key={r.skuId} className="relative flex items-start gap-2.5 px-3.5 py-[11px] hover:bg-line-soft">
      <span aria-hidden="true" className={cn("mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full", r.quantityAvailable <= 0 ? "bg-red" : "bg-amber")} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[14.5px] font-semibold leading-5">{r.name}</span>
        <span className="text-[12.5px] font-semibold leading-[17px] text-ink-3 tnum">
          {r.quantityAvailable <= 0 ? <span className="text-danger">Rupture</span> : `Stock ${formatNumber(r.quantityAvailable)}`} · {formatNumber(r.units30d)} ventes / 30 j{r.daysOfCover !== null && r.quantityAvailable > 0 ? ` · ≈ ${formatNumber(r.daysOfCover)} j de stock` : ""} ·{" "}
          {r.bestOfferId && r.bestPrice !== null ? (
            <span className="text-success">
              meilleure offre {formatMoney(r.bestPrice, currency)} ({r.bestSupplier ?? "fournisseur"})
            </span>
          ) : (
            <span>aucune offre fournisseur liée</span>
          )}
        </span>
      </span>
      {r.bestOfferId ? (
        <OfferStretchLink columnHref={columnHref(r.bestOfferId)} pageHref={`/radar/${r.bestOfferId}`} label={`${r.name} : meilleure offre`} />
      ) : (
        <Link href={`/stock/${encodeURIComponent(r.code)}` as never} aria-label={`${r.name} : fiche produit`} className="absolute inset-0 z-[1]" />
      )}
    </li>
  );
  return (
    <section className="flex flex-col gap-2.5" aria-label="À réapprovisionner">
      <MonoTitle title="À réapprovisionner" count={rows.length} as="h2" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <ul className="divide-y divide-line-soft">{rows.slice(0, RESTOCK_VISIBLE).map(row)}</ul>
        {rows.length > RESTOCK_VISIBLE ? (
          <details className="group border-t border-line-soft">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-3.5 text-[13px] font-bold text-muted hover:bg-line-soft [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">
                {rows.length - RESTOCK_VISIBLE} autre{rows.length - RESTOCK_VISIBLE > 1 ? "s" : ""} produit{rows.length - RESTOCK_VISIBLE > 1 ? "s" : ""}
              </span>
              <span className="hidden group-open:inline">Réduire</span>
            </summary>
            <ul className="divide-y divide-line-soft border-t border-line-soft">{rows.slice(RESTOCK_VISIBLE, 40).map(row)}</ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function OfferCard({ item: i, selected, columnHref }: { item: RadarItemDTO; selected: boolean; columnHref: string }) {
  const e = i.evaluation;
  const o = i.offer;
  const cur = i.sku.currency;
  const tax = o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : "";
  return (
    <article aria-current={selected ? "true" : undefined} className={cn("relative flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2", selected && "xl:border-2 xl:border-inverse xl:p-[13px]")}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-bold leading-[21px]">{i.sku.name}</h3>
        {i.savedAt ? <Bookmark aria-label="Offre enregistrée" className="h-4 w-4 shrink-0 fill-current text-warning" /> : null}
        <span className="ms-code shrink-0 text-[10.5px] leading-[15px] text-muted tnum">{e.score}/100</span>
      </div>
      <p className="truncate text-[13px] font-semibold leading-[18px] text-ink-3 tnum">
        {o.supplierName} · {o.price !== null && o.currency ? `${formatMoney(o.price, o.currency)}${tax}` : "prix inconnu"} · {PRICE_ORIGIN_SHORT[o.priceOrigin]}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Chip className={STATUS_CHIP[e.status]}>{STATUS_LABEL[e.status]}</Chip>
        {e.estimatedProfit !== null ? (
          <Chip className="bg-inverse text-on-inverse">
            {signedProfit(e.estimatedProfit, e.status, (n) => formatMoney(n, cur))} / u{e.marginPercent !== null ? ` (${formatNumber(e.marginPercent, 1)} %)` : ""}
          </Chip>
        ) : null}
        <Chip className={FRESH_CHIP[e.freshness]}>{FRESHNESS_LABEL[e.freshness]}</Chip>
        {e.missing.length > 0 ? (
          <Chip className="bg-warning-soft text-warning">
            {e.missing.length} coût{e.missing.length > 1 ? "s" : ""} inconnu{e.missing.length > 1 ? "s" : ""}
          </Chip>
        ) : null}
      </div>
      <OfferStretchLink columnHref={columnHref} pageHref={`/radar/${o.offerId}`} label={`${i.sku.name} chez ${o.supplierName} : détail de l'offre`} />
    </article>
  );
}

function EmptyOffers({ skus, filter }: { skus: number; filter: RadarFilter }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-8 text-center">
      <p className="text-[15px] font-bold">{filter !== "all" ? "Aucune offre dans ce filtre." : "Aucune offre à évaluer"}</p>
      <p className="text-sm font-medium text-muted">{skus === 0 ? "Ajoutez vos produits : le radar les compare aux offres de vos fournisseurs." : filter !== "all" ? "Changez de filtre pour voir les autres offres évaluées." : "Importez un catalogue fournisseur, activez une source ou validez les correspondances offre ↔ produit."}</p>
      {filter === "all" ? (
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/sourcing/catalog" variant="secondary">
            Offres collectées
          </ButtonLink>
          <ButtonLink href="/suppliers" variant="ghost">
            Fournisseurs et sources
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
