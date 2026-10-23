import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, List, Search } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, LevelDot, MonoLabel, Paper, Scene, SceneHeader, Segmented, StageStats } from "@/components/instrument";
import { directoryForOrg } from "@/services/sourcing/supplier-directory";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import { ACCESS_METHOD_LABEL, countryLabel, displayStatus, mainMethod, segmentLabel, shortName, statusTone, type DirectoryEntry } from "@/features/directory/labels";
import { DEFAULT_FILTERS, directoryCountries, directoryStats, filterDirectory, filtersQuery, METHOD_FILTERS, parseDirectoryFilters, SEGMENTS, SORTS, type DirectoryFilters } from "@/features/directory/filters";
import { supplierLogoUrl } from "@/features/directory/logos";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { cardActionLink } from "@/features/directory/components/primary-action";
import { internalRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Annuaire des fournisseurs" };

const WALL = 7;

function entryHref(e: DirectoryEntry): string {
  return `/suppliers/directory/${encodeURIComponent(e.key)}`;
}

function offersFacts(e: DirectoryEntry): string | null {
  if (e.org.status === "not_connected") return null;
  const n = e.org.accountOffers + e.org.publicOffers;
  return [`${formatNumber(n)} offre${n > 1 ? "s" : ""}`, e.org.lastSyncAt ? `à jour ${formatRelative(e.org.lastSyncAt)}` : "jamais mis à jour"].join(" · ");
}

const METHOD_TONE = { dark: "bg-inverse text-on-inverse ring-transparent", danger: "bg-danger-soft text-danger-ink ring-danger-line", neutral: "bg-line-soft text-muted-strong ring-border" } as const;

function DirectoryCard({ entry: e, writer }: { entry: DirectoryEntry; writer: boolean }) {
  const status = displayStatus(e);
  const facts = offersFacts(e);
  const method = mainMethod(e);
  const action = cardActionLink(e, writer);
  const external = action.external ? safeExternalUrl(action.href) : null;
  const tone = statusTone(e);
  const name = shortName(e.name);
  return (
    <li className="relative flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-surface-2 focus-within:border-border-strong">
      <div className="flex items-center gap-3">
        <SupplierBadge name={e.name} domain={e.registry.domain} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <Link href={internalRoute(entryHref(e))} className="truncate rounded text-base font-bold leading-[22px] after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring">
            {name}
          </Link>
          <span className="truncate text-[13px] font-semibold leading-[18px] text-ink-3">{[e.country ? countryLabel(e.country) : null, segmentLabel(e.segment)].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="ms-code shrink-0 self-start rounded-md border border-border px-1.5 text-[10px] leading-[18px] text-ink-3" title="Priorité d'intégration">
          {e.registry.priority.tier}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <LevelDot tone={tone} className={cn("font-bold", tone === "ok" ? "text-success" : tone === "out" ? "text-danger" : tone === "low" ? "text-warning" : "text-foreground")}>
          {status.label}
        </LevelDot>
        {facts ? <span className="text-[13px] font-semibold text-ink-3 tnum">{facts}</span> : null}
      </div>
      {e.org.lastError ? <p className="line-clamp-2 text-[13px] font-semibold leading-[18px] text-danger">{e.org.lastError}</p> : null}
      {method ? (
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="ms-mono shrink-0 text-[10px] leading-[13px] text-ink-3">Accès</span>
          <span className={cn("min-w-0 rounded-md px-2 py-[3px] text-[11.5px] font-bold leading-[15px] ring-1 ring-inset", METHOD_TONE[method.tone])}>{method.label}</span>
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-end gap-2 border-t border-line-soft pt-2.5">
        {external ? (
          <a href={external} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md", "relative z-10 shrink-0 px-3 text-[13.5px] font-extrabold")}>
            {action.label}
            <span className="sr-only"> (site de {name}, nouvel onglet)</span>
          </a>
        ) : (
          <Link href={internalRoute(action.href)} className={buttonClasses("secondary", "md", "relative z-10 shrink-0 px-3 text-[13.5px] font-extrabold")}>
            {action.label}
          </Link>
        )}
      </div>
    </li>
  );
}

function TableView({ entries }: { entries: DirectoryEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
        <caption className="sr-only">Fournisseurs de l&apos;annuaire</caption>
        <thead className="ms-mono bg-surface-2 text-[10.5px] leading-[14px] text-ink-3">
          <tr className="border-b border-border">
            {["Fournisseur", "Pays", "Catégorie", "Statut", "Méthode d'accès", "Priorité", "Offres", "Dernière synchro", "Prochaine étape"].map((h) => (
              <th key={h} scope="col" className={cn("h-10 px-3 font-medium first:pl-4 last:pr-4", h === "Offres" && "text-right", h === "Priorité" && "text-center")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {entries.map((e) => {
            const tone = statusTone(e);
            return (
              <tr key={e.key} className="transition-colors duration-150 hover:bg-surface-2">
                <td className="max-w-[260px] py-2.5 pl-4 pr-3">
                  <Link href={internalRoute(entryHref(e))} className="flex items-center gap-2.5 font-bold hover:underline">
                    <SupplierBadge name={e.name} domain={e.registry.domain} size="sm" />
                    <span className="truncate">{shortName(e.name)}</span>
                  </Link>
                </td>
                <td className="ms-code px-3 text-xs">{countryLabel(e.country)}</td>
                <td className="px-3 text-[13px] font-semibold text-muted">{segmentLabel(e.segment)}</td>
                <td className="px-3">
                  <LevelDot tone={tone}>{displayStatus(e).label}</LevelDot>
                </td>
                <td className="max-w-[220px] px-3 text-xs font-semibold text-muted">{mainMethod(e)?.label ?? "—"}</td>
                <td className="ms-code px-3 text-center text-xs">{e.registry.priority.tier}</td>
                <td className="px-3 text-right font-bold tnum">{e.org.status === "not_connected" ? "—" : formatNumber(e.org.accountOffers + e.org.publicOffers)}</td>
                <td className="whitespace-nowrap px-3 text-xs font-semibold text-muted">{e.org.lastSyncAt ? formatRelative(e.org.lastSyncAt) : "—"}</td>
                <td className="py-2.5 pl-3 pr-4 text-xs font-semibold">{e.registry.primaryAction.kind !== "none" ? e.registry.primaryAction.label : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const selectCls = "h-10 w-full min-w-0 rounded-xl sm:w-auto border border-border-control bg-surface px-2.5 text-[13px] font-semibold text-foreground transition-[border-color,box-shadow] duration-150 hover:border-muted focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25 pointer-coarse:text-base";

export default async function SupplierDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const f: DirectoryFilters = parseDirectoryFilters(await searchParams);
  const directory = await directoryForOrg(ctx);
  const writer = canWrite(ctx.role);
  const entries = directory.entries;
  const stats = directoryStats(entries);
  const filtered = filterDirectory(entries, f);
  const countries = directoryCountries(entries);
  const isFiltered = filtered.length !== entries.length;
  const href = (patch: Partial<DirectoryFilters>) => `/suppliers/directory${filtersQuery(f, patch)}`;
  const wall = filterDirectory(entries, DEFAULT_FILTERS)
    .filter((e) => supplierLogoUrl(e.registry.domain, e.name))
    .slice(0, WALL);
  const more = stats.total - wall.length;
  const clearHref = f.layout === "table" ? "/suppliers/directory?layout=table" : "/suppliers/directory";
  const quick: { value: DirectoryFilters["access"]; label: string; count?: number }[] = [
    { value: "all", label: "Tous" },
    { value: "connected", label: "Connectés", count: stats.connected },
    { value: "connectable", label: "Connectables", count: stats.connectable },
    { value: "pro", label: "Compte pro", count: stats.pro },
    { value: "error", label: "En erreur", count: stats.errors },
  ];

  return (
    <>
      <Scene>
        <SceneHeader
          eyebrow="Fournisseurs · annuaire"
          title="Annuaire des fournisseurs"
          actions={
            <>
              <ButtonLink href="/suppliers/accounts" variant="night">
                Mes comptes pro
              </ButtonLink>
              <ButtonLink href="/sourcing/sources" variant="night">
                Sources &amp; flux
              </ButtonLink>
            </>
          }
        />
        <div className="mt-4 flex flex-wrap items-end gap-x-14 gap-y-5">
          <div className="flex min-w-0 flex-col gap-1">
            <MonoLabel onNight>Fournisseurs étudiés</MonoLabel>
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
              <span className="text-[48px] font-light leading-[52px] tracking-[-1.8px] text-on-night tnum sm:text-[60px] sm:leading-[62px] sm:tracking-[-2.4px]">{formatNumber(stats.total)}</span>
              {wall.length ? (
                <span aria-hidden="true" className="flex items-center pb-2.5">
                  {wall.map((e, i) => (
                    <span key={e.key} className={cn("flex rounded-xl border-2 border-night", i > 0 && "-ml-2")}>
                      <SupplierBadge name={e.name} domain={e.registry.domain} size="wall" />
                    </span>
                  ))}
                  {more > 0 ? <span className="ms-code -ml-2 flex h-[38px] min-w-[38px] items-center justify-center rounded-xl border-2 border-night bg-night-raised px-[7px] text-[10.5px] text-on-night">+{formatNumber(more)}</span> : null}
                </span>
              ) : null}
            </div>
          </div>
          <StageStats
            className="min-w-0 max-w-[620px] flex-[1_1_440px]"
            stats={[
              { label: "Connectés", value: formatNumber(stats.connected), tone: "mint", href: href({ access: "connected" }) },
              { label: "Connectables", value: formatNumber(stats.connectable), href: href({ access: "connectable" }) },
              { label: "Compte pro", value: formatNumber(stats.pro), href: href({ access: "pro" }) },
              { label: "En erreur", value: formatNumber(stats.errors), tone: stats.errors > 0 ? "danger" : undefined, href: href({ access: "error" }) },
            ]}
          />
        </div>
        <p className="mt-4 text-[12.5px] font-semibold text-on-night-subtle">
          Recherche du {formatDate(directory.researchDate)} · dernière vérification des sites par le serveur : {directory.lastCheckAt ? formatRelative(directory.lastCheckAt) : "—"}
        </p>
      </Scene>
      <Paper>
        <div className="flex flex-wrap items-center gap-2.5">
          <form id="dir-filters" method="get" action="/suppliers/directory" role="search" className="w-full sm:w-[340px]">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border-control bg-surface px-3 text-ink-3 transition-[border-color,box-shadow] duration-150 hover:border-muted focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="sr-only">Rechercher un fournisseur</span>
              <input name="q" type="search" defaultValue={f.q} placeholder="Nom, marque, pays, catégorie…" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-ink-3 pointer-coarse:text-base" />
            </label>
            {f.access !== "all" ? <input type="hidden" name="access" value={f.access} /> : null}
            {f.segment ? <input type="hidden" name="segment" value={f.segment} /> : null}
            {f.layout !== "grid" ? <input type="hidden" name="layout" value={f.layout} /> : null}
          </form>
          <nav aria-label="Vues rapides" className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <FilterChip key={q.value} href={href({ access: q.value })} selected={f.access === q.value} count={q.count}>
                {q.label}
              </FilterChip>
            ))}
          </nav>
        </div>
        <nav aria-label="Catégories" className="mt-2.5 flex flex-wrap gap-1.5">
          <FilterChip href={href({ segment: "" })} selected={!f.segment}>
            Toutes catégories
          </FilterChip>
          {SEGMENTS.map((s) => (
            <FilterChip key={s} href={href({ segment: s })} selected={f.segment === s}>
              {segmentLabel(s)}
            </FilterChip>
          ))}
        </nav>

        <div className="mx-0.5 mb-2.5 mt-3.5 flex flex-wrap items-center justify-between gap-3">
          <p className="ms-mono text-[11px] leading-[14px] text-muted tnum" role="status">
            {formatNumber(filtered.length)} fournisseur{filtered.length > 1 ? "s" : ""}
            {isFiltered ? ` sur ${formatNumber(entries.length)}` : ""} · {SORTS.find((s) => s.value === f.sort)?.label}
          </p>
          <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <select form="dir-filters" name="country" defaultValue={f.country} aria-label="Pays" className={selectCls}>
              <option value="">Tous les pays</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryLabel(c)}
                </option>
              ))}
            </select>
            <select form="dir-filters" name="method" defaultValue={f.method} aria-label="Méthode d'accès" className={selectCls}>
              <option value="">Toutes les méthodes</option>
              {METHOD_FILTERS.map((m) => (
                <option key={m} value={m}>
                  {ACCESS_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
            <select form="dir-filters" name="sort" defaultValue={f.sort} aria-label="Tri" className={selectCls}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Tri : {s.label}
                </option>
              ))}
            </select>
            <button type="submit" form="dir-filters" className={buttonClasses("secondary", "md", "px-3.5 text-[13px]")}>
              Appliquer
            </button>
            {isFiltered || f.q ? (
              <Link href={clearHref} className={buttonClasses("ghost", "md", "px-2.5 text-[13px]")}>
                Tout effacer
              </Link>
            ) : null}
            <Segmented
              className="col-span-2 justify-self-start"
              label="Affichage"
              options={[
                {
                  href: href({ layout: "grid" }),
                  selected: f.layout === "grid",
                  label: (
                    <>
                      <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
                      Cartes
                    </>
                  ),
                },
                {
                  href: href({ layout: "table" }),
                  selected: f.layout === "table",
                  label: (
                    <>
                      <List aria-hidden="true" className="h-3.5 w-3.5" />
                      Tableau
                    </>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title={f.access === "connected" ? "Aucun fournisseur connecté" : "Aucun fournisseur ne correspond"}
            description={f.access === "connected" ? "Connectez un compte pro (API, flux ou liste de stock) ou activez un catalogue public pour voir vos prix ici." : "Élargissez la recherche ou retirez des filtres."}
            action={<ButtonLink href={clearHref}>Tout afficher</ButtonLink>}
          />
        ) : f.layout === "table" ? (
          <TableView entries={filtered} />
        ) : (
          <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]">
            {filtered.map((e) => (
              <DirectoryCard key={e.key} entry={e} writer={writer} />
            ))}
          </ul>
        )}

        <p className="mt-3.5 text-xs font-semibold leading-[17px] text-ink-3">Statuts calculés sur preuves (vérification des sites par le serveur, connexions testées, imports réussis) : un fournisseur découvert n&apos;est jamais présenté comme connecté. Logos : identification uniquement, aucun partenariat.</p>
      </Paper>
    </>
  );
}
