import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, GitMerge, Layers, Library, Radar, Upload } from "lucide-react";
import { requireOrgContext } from "@/features/auth/dal";
import { MonoTitle, Paper } from "@/components/instrument";
import { countPendingMatches, countUnseenAlertEvents } from "@/features/sourcing/queries";
import { legacyCatalogHref } from "@/features/sourcing-search/legacy";
import { MIN_QUERY_LENGTH, normalizeQuery } from "@/features/sourcing-search/display";
import { SearchExamples, SourcingScene } from "@/features/sourcing-search/components/search-scene";
import { SearchPending, SearchSection } from "@/features/sourcing-search/components/search-section";
import { internalRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Recherche fournisseurs" };
// recherche en direct : jusqu'à ~35 s chez les fournisseurs, puis lecture et analyse des offres
export const maxDuration = 60;

export default async function SourcingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  // anciens liens du moteur complet (mode SKU, filtres) → Offres collectées
  const legacy = legacyCatalogHref(raw);
  if (legacy) redirect(internalRoute(legacy));
  const ctx = await requireOrgContext();
  const query = normalizeQuery(raw.q);

  if (query.length >= MIN_QUERY_LENGTH) {
    return (
      <Suspense key={query} fallback={<SearchPending query={query} />}>
        <SearchSection ctx={ctx} query={query} />
      </Suspense>
    );
  }

  const [pendingMatches, unseenEvents] = await Promise.all([countPendingMatches(ctx), countUnseenAlertEvents(ctx)]);
  return (
    <>
      <SourcingScene
        query={query}
        below={
          query ? (
            <p role="status" className="text-[13px] font-semibold text-amber">
              Tapez au moins {MIN_QUERY_LENGTH} caractères, par exemple « iPhone 13 » ou « batterie trottinette ».
            </p>
          ) : (
            <SearchExamples />
          )
        }
      />
      <Paper>
        <div className="grid max-w-[1280px] gap-8 lg:grid-cols-[7fr_5fr]">
          <section className="min-w-0 space-y-2.5" aria-label="Comment fonctionne la recherche">
            <MonoTitle title="Comment ça marche" as="h2" />
            <ol className="divide-y divide-line-soft rounded-2xl border border-border bg-surface">
              {[
                ["Vos fournisseurs en direct", "MON STOCK interroge vos comptes pro, vos flux et les sources publiques autorisées (jusqu'à ~35 s), puis les offres déjà enregistrées."],
                ["Du moins cher au plus cher", "Vos comptes passent en premier, puis toutes les offres par catégorie détectée (appareils, écrans, batteries…), prix d'origine et conversion « ≈ € »."],
                ["Marge estimée, jamais inventée", "Une marge n'est calculée que face à des produits équivalents ; sans tous vos coûts, elle est « provisoire ». Un inconnu s'affiche « — »."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3 px-3.5 py-3">
                  <span className="ms-code flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-[11px] text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold leading-5">{t}</span>
                    <span className="block text-[13px] font-semibold leading-[18px] text-ink-3">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="min-w-0 space-y-2.5" aria-label="Explorer">
            <MonoTitle title="Explorer" as="h2" />
            <div className="grid grid-cols-2 gap-2">
              <Tile href="/sourcing/catalog" icon={<Layers />} label="Offres collectées" />
              <Tile href="/radar" icon={<Radar />} label="Radar d'achat" />
              <Tile href="/sourcing/matches" icon={<GitMerge />} label="Correspondances" count={pendingMatches} />
              <Tile href="/sourcing/alerts" icon={<Bell />} label="Alertes" count={unseenEvents} />
              <Tile href="/suppliers" icon={<Library />} label="Fournisseurs" />
              <Tile href="/sourcing/imports" icon={<Upload />} label="Imports" />
            </div>
          </section>
        </div>
      </Paper>
    </>
  );
}

function Tile({ href, icon, label, count }: { href: string; icon: ReactNode; label: string; count?: number }) {
  return (
    <Link href={internalRoute(href)} className="flex min-h-[88px] flex-col justify-between rounded-2xl border border-border bg-surface p-3 hover:bg-line-soft">
      <span className="flex items-center justify-between">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-background [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
        {count ? <span className="ms-code text-[11px] text-foreground tnum">{count}</span> : null}
      </span>
      <span className="flex items-center justify-between text-[13.5px] font-bold">
        {label}
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-3" />
      </span>
    </Link>
  );
}
