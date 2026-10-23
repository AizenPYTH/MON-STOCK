import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileWarning,
  Library,
  Link2Off,
  Minus,
  Package,
  PackageMinus,
  PackageX,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  Sparkles,
  Tag,
  Truck,
  Upload,
  WalletCards,
} from "lucide-react";
import { MonoTitle, Kbd, ToneIcon } from "@/components/instrument";
import { StatTile } from "@/components/ui/stat-tile";
import type { RadarItemDTO } from "@/features/mobile-api/contract";
import { classifyBreakdown } from "@/features/radar/labels";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TodayDashboard } from "@/features/dashboard/queries";
import { saleTimeLabel, stockLevelHref, type SetupIcon, type Task, type TaskIcon, type SaleTone } from "@/features/dashboard/today.pure";
import { PriorityShell, TaskRows } from "@/features/dashboard/components/disclosures";
import { SupplierMark } from "@/features/dashboard/components/supplier-mark";
import { internalRoute } from "@/lib/routes";

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;
const TASK_ICON: Record<TaskIcon, ReactNode> = {
  packageX: <PackageX />,
  packageMinus: <PackageMinus />,
  fileWarning: <FileWarning />,
  link2Off: <Link2Off />,
  truck: <Truck />,
  boxes: <Boxes />,
  bell: <BellRing />,
  refresh: <RefreshCw />,
  clipboard: <ClipboardList />,
  tag: <Tag />,
  wallet: <WalletCards />,
  minus: <Minus />,
};
const SETUP_ICON: Record<SetupIcon, ReactNode> = { plus: <Plus />, wallet: <WalletCards />, library: <Library />, scan: <ScanSearch /> };
const SALE_DOT: Record<SaleTone, string> = { warning: "var(--amber)", neutral: "var(--ink-4)", success: "var(--success)", danger: "var(--red)" };
const SALE_TEXT: Record<SaleTone, string> = { warning: "text-warning", neutral: "text-foreground", success: "text-success", danger: "text-danger" };
const STATUS_BADGE: Record<RadarItemDTO["evaluation"]["status"], { label: string; cls: string }> = {
  profitable: { label: "Rentable", cls: "bg-success-soft text-success" },
  estimated: { label: "Estimée", cls: "bg-warning-soft text-warning" },
  unprofitable: { label: "Non rentable", cls: "bg-danger-soft text-danger" },
  insufficient_data: { label: "Données insuffisantes", cls: "bg-line-soft text-muted" },
};

const card = "overflow-hidden rounded-2xl border border-border bg-surface";
const rowLink = "flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 hover:bg-line-soft focus-visible:bg-line-soft";

function Chevron() {
  return <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-4" />;
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={internalRoute(href)} className="inline-flex min-h-10 items-center gap-0.5 rounded-lg text-[13px] font-bold hover:opacity-60">
      {children}
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  );
}

function signedMoney(v: number, currency: string) {
  return `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v), currency)}`;
}

// ---------------------------------------------------------------------------------------------
// État du stock : indicateurs actionnables (valeurs réelles, chacune mène à sa liste filtrée)
// ---------------------------------------------------------------------------------------------

export function StockHealthSection({ d }: { d: TodayDashboard }) {
  const c = d.stock.counts;
  if (d.stock.skus === 0) return null;
  const out = c.out_of_stock;
  const risk = c.at_risk;
  const low = c.low;
  // null = compteur inconnu : StatTile affiche « — », jamais 0 (W-14)
  const pending = d.pendingSales;
  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="État du stock" right={<SectionLink href="/stock/alerts">Toutes les alertes</SectionLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Ruptures"
          value={out}
          tone={out > 0 ? "danger" : "neutral"}
          hint={out > 0 ? (d.stock.outShare ? `${formatNumber(d.stock.outShare)} % des ventes 30 j` : "plus aucune unité disponible") : "aucune référence épuisée"}
          href={stockLevelHref("out_of_stock")}
        />
        <StatTile label="Risque de rupture" value={risk} tone={risk > 0 ? "warning" : "neutral"} hint={risk > 0 ? "couverture < délai fournisseur" : "aucune couverture trop courte"} href={stockLevelHref("at_risk")} />
        <StatTile label="Stock faible" value={low} tone={low > 0 ? "warning" : "neutral"} hint={low > 0 ? "sous le seuil de réappro." : "tout est au-dessus du seuil"} href={stockLevelHref("low")} />
        <StatTile
          label="Ventes non déduites"
          value={pending}
          tone={pending !== null && pending > 0 ? "warning" : "neutral"}
          hint={pending === null ? "compteur indisponible pour le moment" : pending > 0 ? "le stock affiché est surestimé" : "toutes les ventes sont déduites"}
          href={pending === null || pending > 0 ? "/sales?inventory=pending" : "/sales"}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// À faire maintenant
// ---------------------------------------------------------------------------------------------

export function PrioritySection({ d, writable }: { d: TodayDashboard; writable: boolean }) {
  const p = d.priority;
  const cur = d.currency;
  if (!p) {
    return (
      <section className="flex flex-col gap-2.5">
        <MonoTitle title="À faire maintenant" />
        <div className={cn(card, "flex items-center gap-3 px-4 py-4")}>
          <ToneIcon tone="success">
            <CheckCircle2 />
          </ToneIcon>
          <p className="text-[15px] font-semibold">{d.stock.skus === 0 ? "Ajoutez vos produits pour voir ici la priorité du jour." : "Aucune rupture ni stock faible sur un produit vendu ces 30 derniers jours."}</p>
        </div>
      </section>
    );
  }
  const { sku, offer: item } = p;
  const out = sku.level === "out_of_stock";
  const o = item?.offer ?? null;
  const e = item?.evaluation ?? null;
  const offerCur = o?.currency ?? cur;
  const tax = o?.taxType === "ht" ? "HT" : o?.taxType === "ttc" ? "TTC" : "HT/TTC ?";
  const moq = Math.max(1, o?.moq ?? 1);
  const stale = e?.ageDays !== null && e?.ageDays !== undefined && e.ageDays > 7;
  const aside = o?.lastSeenAt ? <span className={cn(stale && "text-warning")}>prix {formatRelative(o.lastSeenAt, d.now)}</span> : undefined;

  const left = (
    <>
      <span className={cn("inline-flex items-center gap-1.5 self-start rounded-md px-[7px] py-[3px]", out ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
        {out ? <PackageX aria-hidden="true" className="h-[13px] w-[13px]" /> : <PackageMinus aria-hidden="true" className="h-[13px] w-[13px]" />}
        <span className="ms-code text-[10.5px] font-semibold leading-[15px] tracking-[0.06em]">{out ? "RUPTURE" : sku.level === "at_risk" ? "RISQUE DE RUPTURE" : "STOCK FAIBLE"}</span>
      </span>
      <h3 className="text-[20px] font-bold leading-[26px] tracking-[-0.3px]">
        <Link href={`/stock/${encodeURIComponent(sku.code)}`} className="rounded hover:underline">
          {sku.name}
        </Link>
      </h3>
      <span className="ms-code text-[11px] leading-[15px] text-ink-3">{[sku.code, sku.category].filter(Boolean).join(" · ")}</span>
      <p className="mt-0.5 text-sm font-semibold text-muted">
        {plural(sku.units30d, "vente", "ventes")} sur 30 jours, {out ? "plus aucune unité disponible." : `${plural(sku.available, "unité restante", "unités restantes")}${sku.daysOfCover !== null ? ` (≈ ${formatNumber(sku.daysOfCover)} j)` : ""}.`}
      </p>
      <dl className="mt-2.5 grid grid-cols-3 border-t border-line-soft pt-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[11px] font-bold leading-[14px] tracking-[0.02em] text-ink-3">{out ? "CA 30 j perdu" : "Ventes 30 j"}</dt>
          <dd className={cn("truncate text-[17px] font-extrabold leading-[22px] tnum", out && p.lostRevenue !== null && "text-danger")}>
            {out ? (p.lostRevenue === null ? "—" : <>≈ {formatMoney(p.lostRevenue, cur, { decimals: 0 })}</>) : formatNumber(sku.units30d)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 border-l border-line-soft pl-3">
          <dt className="text-[11px] font-bold leading-[14px] tracking-[0.02em] text-ink-3">Prix de vente</dt>
          <dd className="truncate text-[17px] font-extrabold leading-[22px] tnum">{formatMoney(sku.salePrice, cur, { decimals: sku.salePrice !== null && Number.isInteger(sku.salePrice) ? 0 : 2 })}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 border-l border-line-soft pl-3">
          <dt className="text-[11px] font-bold leading-[14px] tracking-[0.02em] text-ink-3">Couverture</dt>
          <dd className="truncate text-[17px] font-extrabold leading-[22px] tnum">{out ? "0 j" : sku.daysOfCover === null ? "—" : `≈ ${formatNumber(sku.daysOfCover)} j`}</dd>
        </div>
      </dl>
    </>
  );

  const offerBlock =
    o && e ? (
      <Link
        href={`/radar/${o.offerId}`}
        aria-label={`Meilleure offre rapprochée : ${o.supplierName}, ${formatMoney(o.price, offerCur)} ${tax}. Ouvrir l'analyse`}
        className="flex w-full flex-col gap-2.5 rounded-xl bg-background p-3 hover:bg-line-soft"
      >
        <span className="flex w-full items-center gap-2.5">
          <SupplierMark name={o.supplierName} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="ms-mono truncate text-[10px] leading-[13px] text-ink-3">Meilleure offre rapprochée</span>
            <span className="truncate text-[15px] font-bold leading-5">{o.supplierName}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="whitespace-nowrap text-[17px] font-extrabold leading-[22px] tracking-[-0.3px] tnum">{formatMoney(o.price, offerCur)}</span>
            <span className="ms-code text-[10.5px] leading-[15px] text-ink-3">
              {tax}
              {o.moq ? ` · MOQ ${o.moq}` : ""}
            </span>
          </span>
        </span>
        <span className="flex w-full flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-[14px]", STATUS_BADGE[e.status].cls)}>
            {e.status === "profitable" ? <ArrowUpRight aria-hidden="true" className="h-[11px] w-[11px]" /> : null}
            {STATUS_BADGE[e.status].label}
          </span>
          {e.estimatedProfit !== null ? <span className={cn("text-[13px] font-bold leading-[18px] tnum", e.estimatedProfit >= 0 ? "text-success" : "text-danger")}>≈ {signedMoney(e.estimatedProfit, cur)} / u</span> : null}
          <span className="flex-1" />
          <span className="ms-code text-[10.5px] leading-[15px] text-ink-3">{o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} dispo` : o.stockStatus === "out_of_stock" ? "en rupture" : "stock ?"}</span>
        </span>
      </Link>
    ) : (
      <div className="flex w-full flex-col gap-1 rounded-xl bg-background p-3">
        <span className="ms-mono text-[10px] leading-[13px] text-ink-3">Meilleure offre rapprochée</span>
        <span className="text-[15px] font-bold leading-5">{d.radar ? "Aucune offre rapprochée" : "Radar indisponible pour le moment"}</span>
        <span className="text-[13px] font-semibold text-muted">Cherchez ce produit chez vos fournisseurs ou rapprochez une offre existante.</span>
      </div>
    );

  const primaryCls = "flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-extrabold";
  const primary =
    o && o.price !== null ? (
      writable ? (
        <Link href={`/radar/${o.offerId}?quantity=${moq}`} className={cn(primaryCls, "bg-mint text-night hover:bg-mint-pressed")} aria-label={`Préparer un brouillon de commande : ${moq} unité${moq > 1 ? "s" : ""} chez ${o.supplierName}`}>
          <ClipboardList aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          <span className="truncate">Brouillon · {moq} u.</span>
        </Link>
      ) : (
        <button type="button" disabled title="Lecture seule : votre rôle ne permet pas de préparer une commande." className={cn(primaryCls, "cursor-not-allowed bg-track text-ink-3")}>
          <ClipboardList aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          <span className="truncate">Brouillon · {moq} u.</span>
        </button>
      )
    ) : (
      <Link href={`/sourcing?q=${encodeURIComponent(sku.name)}`} className={cn(primaryCls, "bg-mint text-night hover:bg-mint-pressed")}>
        <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">Chercher une offre</span>
      </Link>
    );

  const lines = e ? classifyBreakdown(e.breakdown) : [];
  const calc =
    e && lines.length > 0 ? (
      <>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {lines.map((l, i) => (
            <div key={`${l.label}-${i}`} className="flex justify-between gap-2 border-b border-line-soft py-[7px]">
              <dt className="min-w-0 text-[13px] font-semibold leading-[18px] text-muted">{l.label}</dt>
              <dd className={cn("shrink-0 text-[13px] font-bold leading-[18px] tnum", l.kind === "result" && l.amount !== null && (l.amount >= 0 ? "text-success" : "text-danger"))}>
                {l.amount === null ? "—" : l.kind === "deduction" ? `− ${formatMoney(l.amount, cur)}` : l.kind === "result" ? `≈ ${signedMoney(l.amount, cur)}` : formatMoney(l.amount, cur)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs font-semibold leading-[17px] text-ink-3">
          {e.missing.length > 0 ? `Bénéfice provisoire : ${e.missing.join(", ")} non renseigné${e.missing.length > 1 ? "s" : ""}. ` : ""}Rien n&apos;est envoyé au fournisseur sans votre confirmation.
        </p>
      </>
    ) : null;

  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="À faire maintenant" aside={aside} />
      <PriorityShell left={left} offer={offerBlock} primary={primary} calc={calc} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// À traiter
// ---------------------------------------------------------------------------------------------

export function TasksSection({ tasks }: { tasks: Task[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="À traiter" count={tasks.length || undefined} aside={tasks.length > 1 ? "par gravité" : undefined} />
      <div className={card}>
        {tasks.length === 0 ? (
          <div className="flex min-h-[58px] items-center gap-3 px-4 py-2.5">
            <ToneIcon tone="success">
              <CheckCircle2 />
            </ToneIcon>
            <span className="text-[15px] font-semibold">Tout est à jour</span>
          </div>
        ) : (
          <TaskRows
            rows={tasks.map((t) => (
              <li key={t.key}>
                <Link href={internalRoute(t.href)} className={rowLink}>
                  <ToneIcon tone={t.tone}>{TASK_ICON[t.icon]}</ToneIcon>
                  <span className="flex min-w-0 flex-1 flex-col gap-x-2.5 sm:flex-row sm:items-baseline">
                    <span className="truncate text-[15px] font-semibold leading-5 sm:shrink-0">{t.title}</span>
                    {t.detail ? <span className="truncate text-[13px] font-semibold leading-[18px] text-ink-3">{t.detail}</span> : null}
                  </span>
                  <span className="shrink-0 text-[13px] font-bold">{t.cta}</span>
                  <Chevron />
                </Link>
              </li>
            ))}
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Activité : dernier import + ventes récentes
// ---------------------------------------------------------------------------------------------

export function ActivitySection({ d }: { d: TodayDashboard }) {
  const job = d.lastImport;
  const sales = d.recentSales;
  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="Activité" right={<SectionLink href="/sales">Toutes les ventes</SectionLink>} />
      <div className={card}>
        {!job && sales.length === 0 ? <p className="px-4 py-4 text-sm font-semibold text-muted">Aucune activité pour l&apos;instant : vos imports de catalogues et vos ventes apparaîtront ici.</p> : null}
        <ul className="divide-y divide-line-soft">
          {job ? (
            <li>
              <Link href={`/sourcing/imports/${job.id}`} className={rowLink}>
                <ToneIcon tone={job.status === "completed" ? "success" : job.status === "failed" || job.status === "quarantined" ? "danger" : job.status === "running" ? "info" : "warning"}>
                  {job.status === "completed" ? <CheckCircle2 /> : job.status === "failed" ? <AlertTriangle /> : <FileWarning />}
                </ToneIcon>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-[15px] font-semibold leading-5">
                    Import {job.supplierName ?? job.fileName ?? ""}
                    {job.status === "failed" ? " · échoué" : job.status === "quarantined" ? " · suspendu" : job.status === "running" ? " · en cours" : ""}
                  </span>
                  <span className="truncate text-[12.5px] font-semibold leading-[17px] text-ink-3">
                    {formatRelative(job.startedAt, d.now)}
                    {job.status === "failed" ? (job.message ? ` · ${job.message}` : "") : ` · ${plural(job.counts.created + job.counts.updated, "offre à jour", "offres à jour")}${job.counts.invalid + job.counts.unrecognized > 0 ? ` · ${formatNumber(job.counts.invalid + job.counts.unrecognized)} ignorées` : ""}`}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-bold">Rapport</span>
                <Chevron />
              </Link>
            </li>
          ) : null}
          {sales.map((s) => (
            <li key={s.orderId}>
              <Link
                href={`/sales/${s.orderId}`}
                className="grid min-h-[58px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-line-soft sm:grid-cols-[40px_minmax(0,1fr)_92px_64px_104px_76px]"
              >
                <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line-soft bg-background text-ink-3">
                  <Package className="h-[17px] w-[17px]" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14.5px] font-semibold leading-5">{s.title}</span>
                  <span className="ms-code truncate text-[11px] leading-[15px] text-ink-3">
                    {s.code ?? "—"}
                    <span className="sm:hidden">
                      {" "}
                      · {s.channel} · {saleTimeLabel(s.placedAt, d.now)} · {s.status.label}
                    </span>
                  </span>
                </span>
                <span className="hidden truncate text-[13px] font-semibold text-muted sm:block">{s.channel}</span>
                <span className="ms-code hidden whitespace-nowrap text-[11px] leading-[15px] text-ink-3 sm:block">{saleTimeLabel(s.placedAt, d.now)}</span>
                <span className="hidden items-center gap-1.5 sm:flex">
                  <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: SALE_DOT[s.status.tone] }} />
                  <span className={cn("truncate text-[13px] font-bold", SALE_TEXT[s.status.tone])}>{s.status.label}</span>
                </span>
                <span className="text-right text-[15px] font-extrabold tracking-[-0.3px] tnum">{s.amount === null ? "—" : formatMoney(s.amount, s.currency, { decimals: Number.isInteger(s.amount) ? 0 : 2 })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Colonne droite
// ---------------------------------------------------------------------------------------------

function Tile({ href, icon, title, detail, kbd, strong = false }: { href: string; icon: ReactNode; title: string; detail: string; kbd?: string; strong?: boolean }) {
  return (
    <Link
      href={internalRoute(href)}
      className={cn(
        "group flex min-h-24 flex-col justify-between gap-2 rounded-2xl border p-3 pb-[11px] transition-colors duration-150 ease-standard",
        strong ? "border-inverse bg-inverse hover:bg-inverse-hover" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span className="flex w-full items-start justify-between">
        <span aria-hidden="true" className={cn("flex h-[30px] w-[30px] items-center justify-center rounded-[10px] [&>svg]:h-4 [&>svg]:w-4", strong ? "bg-mint text-night" : "bg-background text-foreground")}>
          {icon}
        </span>
        {kbd ? <Kbd onNight={false}>{kbd}</Kbd> : null}
      </span>
      <span className="flex flex-col gap-px">
        <span className={cn("text-[13.5px] font-bold leading-[18px]", strong ? "text-on-inverse" : "text-foreground")}>{title}</span>
        <span className={cn("text-xs font-semibold leading-4", strong ? "text-on-inverse opacity-75" : "text-ink-3")}>{detail}</span>
      </span>
    </Link>
  );
}

export function ShortcutsSection({ writable }: { writable: boolean }) {
  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="Raccourcis" />
      <div className="grid grid-cols-2 gap-2">
        <Tile strong href="/sourcing" icon={<Search />} title="Chercher une offre" detail="Chez vos fournisseurs" />
        {writable ? <Tile href="/stock/new" icon={<Plus />} title="Ajouter un produit" detail="Variantes, saisie ou import" kbd="N" /> : <Tile href="/stock" icon={<Package />} title="Voir le stock" detail="Lecture seule" />}
        <Tile href="/sourcing/imports/new" icon={<Upload />} title="Importer un catalogue" detail="CSV, XLSX, XML, JSON" />
        <Tile href="/suppliers" icon={<Library />} title="Fournisseurs" detail="Annuaire et comptes pro" />
      </div>
    </section>
  );
}

export function RadarSection({ d }: { d: TodayDashboard }) {
  const r = d.radar;
  const items = r?.opportunities ?? [];
  const cur = d.currency;
  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="Opportunités du radar" count={items.length || undefined} right={<SectionLink href="/radar">Comparer</SectionLink>} />
      <div className={card}>
        {items.length === 0 ? (
          <Link href="/radar" className={rowLink}>
            <ToneIcon tone="neutral">
              <ScanSearch />
            </ToneIcon>
            <span className="flex-1 text-[15px] font-semibold">{r ? "Aucune opportunité rentable pour l'instant" : "Radar indisponible pour le moment"}</span>
            <span className="text-[13px] font-bold">Radar</span>
            <Chevron />
          </Link>
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((i) => {
              const e = i.evaluation;
              const o = i.offer;
              const tax = o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : "";
              const stale = e.ageDays !== null && e.ageDays > 7;
              return (
                <li key={o.offerId}>
                  <Link href={`/radar/${o.offerId}`} className="flex min-h-[62px] items-center gap-3 px-3.5 py-2.5 hover:bg-line-soft">
                    <SupplierMark name={o.supplierName} size={34} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[14.5px] font-semibold leading-5">{i.sku.name}</span>
                      <span className="ms-code truncate text-[11px] leading-[15px] text-ink-3">
                        {o.supplierName} · {formatMoney(o.price, o.currency ?? cur)}
                        {tax}
                        {o.availableQuantity !== null ? ` · ${formatNumber(o.availableQuantity)} dispo` : ""}
                        {o.lastSeenAt ? <span className={cn(stale && "text-warning")}> · {formatRelative(o.lastSeenAt, d.now)}</span> : " · date du prix inconnue"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="text-base font-extrabold leading-[22px] tracking-[-0.3px] text-success tnum">≈ +{formatMoney(e.estimatedProfit, cur)}</span>
                      <span className="ms-code text-[10.5px] leading-[15px] text-ink-3">/u{e.marginPercent !== null ? ` · ${formatNumber(e.marginPercent, 1)} %` : ""}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {r && r.provisional && r.missingSettings.length > 0 ? (
        <p className="text-xs font-semibold leading-[17px] text-warning">
          Marges provisoires ·{" "}
          <Link href="/radar/settings" className="font-bold underline">
            compléter mes coûts
          </Link>
        </p>
      ) : null}
    </section>
  );
}

export function AdvisorEntry() {
  return (
    <Link href="/advisor" className="group flex items-center gap-3 rounded-2xl border border-border bg-surface py-3.5 pl-4 pr-3.5 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-inverse text-mint">
        <Sparkles className="h-[18px] w-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] font-bold leading-5 text-foreground">Votre conseiller</span>
        <span className="truncate text-[13px] font-semibold leading-[18px] text-ink-3">« Que dois-je racheter cette semaine ? »</span>
      </span>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-night transition-transform duration-150 ease-standard group-hover:translate-x-0.5">
        <ArrowRight className="h-[18px] w-[18px]" />
      </span>
    </Link>
  );
}

export function SetupSection({ d }: { d: TodayDashboard }) {
  const steps = d.setup;
  const done = steps.filter((s) => s.done).length;
  if (steps.length === 0 || done === steps.length) return null;
  const todo = steps.filter((s) => !s.done);
  const pct = Math.round((done / steps.length) * 100);
  return (
    <section className="flex flex-col gap-2.5">
      <MonoTitle title="Bien démarrer" aside={`${done} / ${steps.length}`} />
      <div className={card}>
        <div className="px-4 pb-3 pt-4">
          <div role="progressbar" aria-label={`Configuration : ${done} étape${done > 1 ? "s" : ""} sur ${steps.length}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-track">
            <div className="ms-grow-x h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {todo.map((s) => (
            <li key={s.key}>
              <Link href={internalRoute(s.href)} className={rowLink}>
                <ToneIcon tone="neutral">{SETUP_ICON[s.icon]}</ToneIcon>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="text-[15px] font-semibold leading-5">{s.title}</span>
                  <span className="text-[12.5px] font-semibold leading-[17px] text-ink-3">{s.detail}</span>
                </span>
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
