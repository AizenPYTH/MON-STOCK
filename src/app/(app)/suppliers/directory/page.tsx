import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { directoryForOrg } from "@/services/sourcing/supplier-directory";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCESS_METHOD_LABEL, countryLabel, displayStatus, segmentLabel, shortName, type DirectoryEntry } from "@/features/directory/labels";
import { ACCESS_VIEWS, directoryCountries, directoryStats, filterDirectory, filtersQuery, METHOD_FILTERS, parseDirectoryFilters, SEGMENTS, SORTS, type DirectoryFilters } from "@/features/directory/filters";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";

export const metadata: Metadata = { title: "Annuaire des fournisseurs" };

function entryHref(e: DirectoryEntry): string {
  return `/suppliers/directory/${encodeURIComponent(e.key)}`;
}

function offersFacts(e: DirectoryEntry): string | null {
  if (e.org.status === "not_connected") return null;
  const n = e.org.accountOffers + e.org.publicOffers;
  return [`${formatNumber(n)} offre${n > 1 ? "s" : ""}`, e.org.lastSyncAt ? `à jour ${formatRelative(e.org.lastSyncAt)}` : "jamais mis à jour"].join(" · ");
}

function StatLink({ label, value, href, active, tone }: { label: string; value: number; href: string; active: boolean; tone?: "success" | "danger" }) {
  return (
    <Link
      href={href as never}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-xl border bg-surface px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground" : "border-border",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tnum", tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground")}>{formatNumber(value)}</div>
    </Link>
  );
}

function GridView({ entries }: { entries: DirectoryEntry[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {entries.map((e) => {
        const status = displayStatus(e);
        const facts = offersFacts(e);
        return (
          <li key={e.key}>
            <Card className="h-full transition-colors hover:border-border-strong">
              <Link href={entryHref(e) as never} className="flex h-full flex-col gap-3 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center gap-3">
                  <SupplierBadge name={e.name} domain={e.registry.domain} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{shortName(e.name)}</div>
                    <div className="truncate text-xs text-muted">{[countryLabel(e.country), segmentLabel(e.segment)].join(" · ")}</div>
                  </div>
                  <Badge variant="outline" title="Priorité d'intégration">
                    {e.registry.priority.tier}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {facts ? <span className="text-xs text-muted tnum">{facts}</span> : null}
                </div>
                {e.org.lastError ? <p className="line-clamp-2 text-xs text-danger">{e.org.lastError}</p> : null}
                <div className="mt-auto flex flex-wrap gap-1">
                  {e.registry.accessMethods
                    .filter((m) => m !== "pro_account_first")
                    .slice(0, 2)
                    .map((m) => (
                      <span key={m} className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-strong">
                        {ACCESS_METHOD_LABEL[m]}
                      </span>
                    ))}
                  {e.registry.accessMethods.includes("pro_account_first") && e.org.status !== "connected" ? <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] text-amber-700">{ACCESS_METHOD_LABEL.pro_account_first}</span> : null}
                </div>
                {e.registry.primaryAction.kind !== "none" ? <span className="text-xs font-medium text-accent">{e.registry.primaryAction.label} →</span> : null}
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function TableView({ entries }: { entries: DirectoryEntry[] }) {
  return (
    <Table className="min-w-[1100px]">
      <caption className="sr-only">Fournisseurs de l&apos;annuaire</caption>
      <THead>
        <tr>
          <TH scope="col">Fournisseur</TH>
          <TH scope="col">Pays</TH>
          <TH scope="col">Catégorie</TH>
          <TH scope="col">Statut</TH>
          <TH scope="col">Méthodes d&apos;accès</TH>
          <TH scope="col" align="center">
            Priorité
          </TH>
          <TH scope="col" align="right">
            Offres
          </TH>
          <TH scope="col">Dernière synchro</TH>
          <TH scope="col">Prochaine étape</TH>
        </tr>
      </THead>
      <TBody>
        {entries.map((e) => {
          const status = displayStatus(e);
          const offers = e.org.accountOffers + e.org.publicOffers;
          return (
            <TR key={e.key}>
              <TD className="max-w-[280px]">
                <Link href={entryHref(e) as never} className="flex items-center gap-2.5 hover:underline">
                  <SupplierBadge name={e.name} domain={e.registry.domain} size="sm" />
                  <span className="truncate font-medium">{shortName(e.name)}</span>
                </Link>
              </TD>
              <TD className="whitespace-nowrap text-xs">{countryLabel(e.country)}</TD>
              <TD className="text-xs">{segmentLabel(e.segment)}</TD>
              <TD>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TD>
              <TD className="max-w-[260px] text-xs text-muted-strong">{e.registry.accessMethods.map((m) => ACCESS_METHOD_LABEL[m]).join(", ")}</TD>
              <TD align="center">{e.registry.priority.tier}</TD>
              <TD align="right">{e.org.status === "not_connected" ? "—" : formatNumber(offers)}</TD>
              <TD className="whitespace-nowrap text-xs">{e.org.lastSyncAt ? formatRelative(e.org.lastSyncAt) : "—"}</TD>
              <TD className="text-xs">{e.registry.primaryAction.kind !== "none" ? e.registry.primaryAction.label : "—"}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export default async function SupplierDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const f: DirectoryFilters = parseDirectoryFilters(await searchParams);
  const directory = await directoryForOrg(ctx);
  const entries = directory.entries;
  const stats = directoryStats(entries);
  const filtered = filterDirectory(entries, f);
  const countries = directoryCountries(entries);
  const isFiltered = filtered.length !== entries.length;
  const href = (patch: Partial<DirectoryFilters>) => `/suppliers/directory${filtersQuery(f, patch)}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={"/suppliers" as never} className="hover:underline">
            Fournisseurs
          </Link>
        }
        title="Annuaire des fournisseurs"
        description={`Tous les fournisseurs étudiés, leurs méthodes d'accès RÉELLES et leur état dans votre organisation. Recherche du ${formatDate(directory.researchDate)} ; dernière vérification des sites par le serveur : ${directory.lastCheckAt ? formatRelative(directory.lastCheckAt) : "—"}.`}
        actions={
          <>
            <ButtonLink href="/suppliers/accounts" variant="secondary">
              Comptes fournisseurs
            </ButtonLink>
            <ButtonLink href="/sourcing/sources" variant="secondary">
              Mes sources
            </ButtonLink>
          </>
        }
      />

      <nav aria-label="Vues rapides" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatLink label="Fournisseurs étudiés" value={stats.total} href={href({ access: "all" })} active={f.access === "all"} />
        <StatLink label="Connectés" value={stats.connected} href={href({ access: "connected" })} active={f.access === "connected"} tone={stats.connected > 0 ? "success" : undefined} />
        <StatLink label="Connectables" value={stats.connectable} href={href({ access: "connectable" })} active={f.access === "connectable"} />
        <StatLink label="Compte pro requis" value={stats.pro} href={href({ access: "pro" })} active={f.access === "pro"} />
        <StatLink label="En erreur" value={stats.errors} href={href({ access: "error" })} active={f.access === "error"} tone={stats.errors > 0 ? "danger" : undefined} />
      </nav>

      <form method="get" action="/suppliers/directory" className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-7">
        <div className="lg:col-span-2">
          <label htmlFor="dir-q" className="sr-only">
            Rechercher
          </label>
          <Input id="dir-q" name="q" type="search" defaultValue={f.q} placeholder="Nom, marque, pays, catégorie…" />
        </div>
        <Select name="access" defaultValue={f.access} aria-label="Accès / statut">
          {ACCESS_VIEWS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.value === "all" ? "Tous les statuts" : v.label}
            </option>
          ))}
        </Select>
        <Select name="segment" defaultValue={f.segment} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {segmentLabel(s)}
            </option>
          ))}
        </Select>
        <Select name="country" defaultValue={f.country} aria-label="Pays">
          <option value="">Tous les pays</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryLabel(c)}
            </option>
          ))}
        </Select>
        <Select name="method" defaultValue={f.method} aria-label="Méthode d'accès">
          <option value="">Toutes les méthodes</option>
          {METHOD_FILTERS.map((m) => (
            <option key={m} value={m}>
              {ACCESS_METHOD_LABEL[m]}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={f.sort} aria-label="Tri">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Tri : {s.label}
            </option>
          ))}
        </Select>
        {f.layout !== "grid" ? <input type="hidden" name="layout" value={f.layout} /> : null}
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-7 lg:justify-end">
          <Button type="submit" variant="secondary">
            Appliquer
          </Button>
          {isFiltered ? (
            <ButtonLink href={f.layout === "table" ? "/suppliers/directory?layout=table" : "/suppliers/directory"} variant="ghost">
              Tout effacer
            </ButtonLink>
          ) : null}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted tnum" role="status">
          {formatNumber(filtered.length)} fournisseur{filtered.length > 1 ? "s" : ""}
          {isFiltered ? ` sur ${formatNumber(entries.length)}` : ""} · tri : {SORTS.find((s) => s.value === f.sort)?.label}
        </p>
        <div className="flex gap-1" role="group" aria-label="Affichage">
          <ButtonLink href={href({ layout: "grid" })} variant={f.layout === "grid" ? "secondary" : "ghost"} size="sm" aria-label="Afficher en mur de cartes">
            <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
            Cartes
          </ButtonLink>
          <ButtonLink href={href({ layout: "table" })} variant={f.layout === "table" ? "secondary" : "ghost"} size="sm" aria-label="Afficher en tableau">
            <List aria-hidden="true" className="h-3.5 w-3.5" />
            Tableau
          </ButtonLink>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={f.access === "connected" ? "Aucun fournisseur connecté" : "Aucun fournisseur ne correspond"}
          description={f.access === "connected" ? "Connectez un compte pro (API, flux ou liste de stock) ou activez un catalogue public pour voir vos prix ici." : "Élargissez la recherche ou retirez des filtres."}
          action={
            <ButtonLink href="/suppliers/directory" variant="secondary">
              Tout afficher
            </ButtonLink>
          }
        />
      ) : f.layout === "table" ? (
        <TableView entries={filtered} />
      ) : (
        <GridView entries={filtered} />
      )}

      <p className="mt-4 text-xs text-muted">Statuts calculés sur preuves (vérification des sites par le serveur, connexions testées, imports réussis) : un fournisseur découvert n&apos;est jamais présenté comme connecté. Logos : identification uniquement, aucun partenariat.</p>
    </>
  );
}
