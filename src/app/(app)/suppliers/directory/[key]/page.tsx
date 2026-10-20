import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, CircleAlert, ExternalLink, FileUp, KeyRound, Link2, Lock, Plug, Rss, TriangleAlert, Wrench, X, Ban, Globe } from "lucide-react";
import { requireOrgContext, canWrite, isAdmin } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { MonoTitle, Panel, Paper, Scene, Segmented, StageStats, ToneIcon } from "@/components/instrument";
import { directoryForOrg } from "@/services/sourcing/supplier-directory";
import { supplierOffers } from "@/services/sourcing/pro-accounts";
import { listImportJobs } from "@/services/sourcing/catalog-import";
import { sourceLibrary, type LibraryEntryDTO } from "@/services/sourcing/source-library";
import type { ImportJobDTO, SupplierOffersDTO } from "@/features/mobile-api/contract";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import {
  ACCESS_METHOD_LABEL,
  ACCESS_MODE_LABEL,
  advantagesAndLimits,
  countryLabel,
  displayStatus,
  METHOD_DETAIL,
  progressSteps,
  RELIABILITY_LABEL,
  segmentLabel,
  shortName,
  statusTone,
  TIER_HINT,
  TIER_LABEL,
  type AccessMethod,
  type DirectoryEntry,
  type StepState,
} from "@/features/directory/labels";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { AccessEmail } from "@/features/directory/components/access-email";
import { importHref, PrimaryAction } from "@/features/directory/components/primary-action";
import { DisconnectAccountForm, SyncAccountForm } from "@/features/pro-accounts/components/account-forms";
import { SupplierOffersTable } from "@/features/pro-accounts/components/offers-table";
import { SupplierOfferRows } from "@/features/pro-accounts/components/offer-rows";
import { countsText } from "@/features/catalog-imports/labels";

export const metadata: Metadata = { title: "Fiche fournisseur (annuaire)" };

type Tab = "apercu" | "produits" | "acces" | "fiche";
const STEP_SR: Record<StepState, string> = { done: "fait", current: "en cours", todo: "à faire", error: "en erreur" };
const WRITE_KINDS = new Set(["sync", "connect_api", "add_feed", "import_catalog", "activate_public"]);
const DOT_ON_NIGHT = { ok: "bg-mint", low: "bg-amber", out: "bg-danger-on-night", neutral: "bg-on-night-muted" } as const;
const TEXT_ON_NIGHT = { ok: "text-mint", low: "text-amber", out: "text-danger-on-night", neutral: "text-on-night-muted" } as const;
const METHOD_ICON: Record<AccessMethod, typeof Plug> = {
  official_api: Plug,
  oauth: KeyRound,
  catalog_feed: Rss,
  portal_export: Link2,
  manual_import: FileUp,
  custom_development: Wrench,
  pro_account_first: Lock,
  not_automatable: Ban,
  public_integrated: Globe,
};
const METHOD_TONE: Record<AccessMethod, "success" | "warning" | "danger" | "info" | "neutral"> = {
  official_api: "success",
  public_integrated: "success",
  oauth: "info",
  catalog_feed: "info",
  portal_export: "neutral",
  manual_import: "neutral",
  custom_development: "neutral",
  pro_account_first: "warning",
  not_automatable: "danger",
};

/** Action principale sur la scène (menthe) : exécutée pour de vrai, ou renvoyée vers l'onglet Accès où elle s'exécute. */
function SceneAction({ e, writer, library, baseHref }: { e: DirectoryEntry; writer: boolean; library: LibraryEntryDTO | null; baseHref: string }) {
  const a = e.registry.primaryAction;
  if (a.kind === "none") return null;
  if (!writer && WRITE_KINDS.has(a.kind)) return <p className="text-[13px] font-semibold text-on-night-muted">Lecture seule : votre rôle ne permet pas de modifier les sources. Demandez à un administrateur.</p>;
  const site = e.catalogUrl ?? e.website;
  switch (a.kind) {
    case "sync":
      return e.org.connectionId ? <SyncAccountForm connectionId={e.org.connectionId} label={a.label} size="lg" block /> : <ButtonLink href="/sourcing/sources" size="lg" className="w-full">{a.label}</ButtonLink>;
    case "connect_api":
      return e.connector ? <ButtonLink href={`${baseHref}?tab=acces#action`} size="lg" className="w-full">{a.label}</ButtonLink> : <p className="text-[13px] font-semibold text-on-night-muted">Connecteur indisponible sur ce serveur.</p>;
    case "add_feed":
      return <ButtonLink href="/sourcing/sources/new-feed" size="lg" className="w-full">{a.label}</ButtonLink>;
    case "import_catalog":
      return <ButtonLink href={importHref(e)} size="lg" className="w-full">{a.label}</ButtonLink>;
    case "activate_public":
      if (library?.sourceId) return <p className="text-sm font-bold text-mint">Catalogue public déjà activé dans votre organisation.</p>;
      if (library?.activatable) return <ButtonLink href={`${baseHref}?tab=acces#action`} size="lg" className="w-full">{a.label}</ButtonLink>;
      return <p className="text-[13px] font-semibold text-on-night-muted">Activation impossible pour l&apos;instant : voir l&apos;onglet Accès.</p>;
    case "get_pro_access":
    case "open_site":
      return site ? (
        <ButtonLink href={site} size="lg" className="w-full">
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          {a.label}
        </ButtonLink>
      ) : (
        <p className="text-[13px] font-semibold text-on-night-muted">Aucun site officiel identifié par la recherche.</p>
      );
  }
}

function Timeline({ steps }: { steps: ReturnType<typeof progressSteps> }) {
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-3">
          <span className="flex w-[22px] flex-col items-center" aria-hidden="true">
            <span
              className={cn(
                "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full",
                s.state === "done" ? "bg-night text-on-night" : s.state === "error" ? "bg-red text-white" : s.state === "current" ? "border-2 border-amber" : "border-[1.5px] border-border-strong",
              )}
            >
              {s.state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : s.state === "error" ? <X className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            {i < steps.length - 1 ? <span className={cn("my-0.5 min-h-3 w-0.5 flex-1", s.state === "done" ? "bg-night" : "bg-border")} /> : null}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px pb-3 pt-px">
            <span className={cn("text-[14.5px] font-bold leading-5", s.state === "todo" ? "text-ink-3" : "text-foreground")}>
              {s.label}
              <span className="sr-only"> — {STEP_SR[s.state]}</span>
            </span>
            <span className={cn("text-[12.5px] font-semibold leading-[17px]", s.state === "error" ? "text-danger" : s.state === "current" ? "text-warning" : "text-ink-3")}>{s.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function DirectoryEntryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { key } = await params;
  const sp = await searchParams;
  const directory = await directoryForOrg(ctx);
  let wanted = key;
  try {
    wanted = decodeURIComponent(key);
  } catch {
    notFound();
  }
  const e = directory.entries.find((x) => x.key === wanted);
  if (!e) notFound();
  const writer = canWrite(ctx.role);
  const admin = isAdmin(ctx.role);
  const r = e.registry;
  const currency = ctx.organization.default_currency;
  const baseHref = `/suppliers/directory/${encodeURIComponent(e.key)}`;

  const [offers, imports, library]: [SupplierOffersDTO | null, ImportJobDTO[], LibraryEntryDTO | null] = await Promise.all([
    e.org.supplierId ? supplierOffers(ctx, e.org.supplierId, 30) : Promise.resolve(null),
    e.org.supplierId ? listImportJobs(ctx, { supplierId: e.org.supplierId, limit: 5 }) : Promise.resolve([]),
    r.libraryKey ? sourceLibrary(ctx).then((l) => l.entries.find((x) => x.key === r.libraryKey) ?? null) : Promise.resolve(null),
  ]);

  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const hasProducts = Boolean(e.org.supplierId);
  const tab: Tab = tabParam === "acces" || tabParam === "fiche" || (tabParam === "produits" && hasProducts) ? tabParam : "apercu";
  const status = displayStatus(e);
  const tone = statusTone(e);
  const steps = progressSteps(e);
  const { advantages, limits } = advantagesAndLimits(e);
  const connected = e.org.status !== "not_connected";
  const lastImport = imports[0] ?? null;
  const name = shortName(e.name);
  const facts: { label: string; value: string | null }[] = [
    { label: "Pays", value: [e.country ? countryLabel(e.country) : null, e.deliveryZones.length ? `livre : ${e.deliveryZones.join(", ")}` : null].filter(Boolean).join(" · ") || null },
    { label: "Produits", value: [...e.categories, ...e.productTypes].join(", ") || null },
    { label: "Marques", value: e.brands.join(", ") || null },
    { label: "Vente", value: e.sales },
    { label: "Compte professionnel", value: e.proAccountRequired === null ? "non précisé" : e.proAccountRequired ? "requis" : "non requis" },
    { label: "Conditions d'accès", value: e.accessConditions },
    { label: "Prix", value: [e.pricesTax, e.currency].filter(Boolean).join(" · ") || null },
    { label: "Quantité minimale", value: e.moq },
    { label: "Livraison", value: e.shipping },
    { label: "Garantie / retours", value: e.warranty },
    { label: "Qualité des pièces", value: e.partQuality },
    { label: "Modes annoncés", value: e.accessModes.map((m) => ACCESS_MODE_LABEL[m] ?? m).join(", ") || null },
    { label: "Obtenir le catalogue", value: e.howToGetCatalog },
  ];
  const tabs: { key: Tab; label: string }[] = [
    { key: "apercu", label: "Aperçu" },
    ...(hasProducts ? [{ key: "produits" as const, label: `Produits · ${formatNumber(offers?.total ?? 0)}` }] : []),
    { key: "acces", label: "Accès" },
    { key: "fiche", label: "Fiche" },
  ];
  const website = safeExternalUrl(e.website);

  return (
    <>
      <Scene className="pt-1.5">
        <div className="flex min-h-11 items-center">
          <Link href={"/suppliers/directory" as never} className="inline-flex h-10 items-center gap-0.5 rounded-lg pr-3 text-[15px] font-semibold text-on-night-muted hover:text-on-night">
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            Annuaire
          </Link>
        </div>
        <div className="mt-1.5 flex flex-wrap items-end gap-x-12 gap-y-5 lg:pl-2">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <SupplierBadge name={e.name} domain={r.domain} size="xl" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <h1 className="break-words text-[28px] font-extrabold leading-[34px] tracking-[-0.7px] text-on-night">{name}</h1>
                <span className="text-[13px] font-semibold leading-[18px] text-on-night-muted">{[e.country ? countryLabel(e.country) : null, segmentLabel(e.segment), r.domain].filter(Boolean).join(" · ")}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-[7px]">
                <span aria-hidden="true" className={cn("h-2 w-2 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,.08)]", DOT_ON_NIGHT[tone])} />
                <span className={cn("text-[13px] font-bold", TEXT_ON_NIGHT[tone])}>{status.label}</span>
              </span>
              <span className="ms-mono rounded-md border border-night-stroke px-1.5 py-0.5 text-[10px] leading-[13px] text-on-night-muted" title="Priorité d'intégration">
                Priorité {r.priority.tier}
              </span>
              <span className="ms-mono rounded-md border border-night-stroke px-1.5 py-0.5 text-[10px] leading-[13px] text-on-night-muted" title={TIER_HINT[e.tier]}>
                Niveau : {TIER_LABEL[e.tier]}
              </span>
            </div>
            <StageStats
              size="sm"
              className="max-w-[520px]"
              stats={
                connected
                  ? [
                      { label: "Offres du compte", value: formatNumber(e.org.accountOffers) },
                      { label: "Publiques", value: formatNumber(e.org.publicOffers) },
                      { label: "Mise à jour", value: e.org.lastSyncAt ? formatRelative(e.org.lastSyncAt) : null },
                    ]
                  : [
                      { label: "Compte pro", value: e.proAccountRequired === null ? null : e.proAccountRequired ? "Requis" : "Non requis" },
                      { label: "Prix", value: e.pricesTax },
                      { label: "Fiche du", value: formatDate(e.researchedAt) },
                    ]
              }
            />
          </div>
          {r.primaryAction.kind !== "none" ? (
            <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-[0_1_340px]">
              <SceneAction e={e} writer={writer} library={library} baseHref={baseHref} />
              <span className="text-center text-xs font-semibold leading-[17px] text-on-night-muted">{r.primaryAction.outcome}</span>
            </div>
          ) : null}
        </div>
      </Scene>
      <Paper>
        {e.org.lastError ? (
          <div role="alert" className="mb-4 flex gap-2.5 rounded-2xl border border-danger-line bg-danger-soft p-4 text-danger">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">Connexion en erreur</span>
              <span className="text-[13px] font-semibold leading-[18px]">{e.org.lastError}</span>
              {e.org.lastSyncAt ? <span className="text-xs font-semibold">Dernière réussite {formatRelative(e.org.lastSyncAt)}</span> : null}
            </span>
          </div>
        ) : null}
        <div className="mb-[18px] overflow-x-auto">
          <Segmented label="Sections de la fiche" className="min-w-max" options={tabs.map((t) => ({ href: t.key === "apercu" ? baseHref : `${baseHref}?tab=${t.key}`, label: t.label, selected: tab === t.key }))} />
        </div>
        <div className="flex flex-wrap items-start gap-7">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-[18px]">
            {tab === "apercu" ? (
              <>
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Produits récupérés" count={offers ? formatNumber(offers.total) : undefined} />
                  {offers && offers.offers.length > 0 ? (
                    <>
                      <SupplierOfferRows offers={offers.offers.slice(0, 3)} orgCurrency={currency} />
                      <p className="text-[12.5px] font-semibold text-ink-3">
                        {offers.total > 3 ? `… et ${formatNumber(offers.total - 3)} autres : ` : "Prix datés, pas du temps réel. "}
                        <Link href={`${baseHref}?tab=produits` as never} className="font-bold text-foreground underline-offset-2 hover:underline">
                          voir les produits
                        </Link>{" "}
                        ou la recherche Sourcing pour les comparer.
                      </p>
                    </>
                  ) : (
                    <Panel className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm font-medium text-muted">
                      <span>{e.org.supplierId ? "Aucun produit actif : importez son catalogue ou lancez une synchronisation." : "Pas encore de produits : ils apparaîtront une fois ce fournisseur connecté."}</span>
                      {writer && e.org.supplierId ? (
                        <ButtonLink href={importHref(e)} variant="secondary">
                          Importer un catalogue
                        </ButtonLink>
                      ) : null}
                    </Panel>
                  )}
                </section>
                {advantages.length || limits.length ? (
                  <section className="flex flex-col gap-2.5">
                    <MonoTitle title="Avantages et limites" />
                    <Panel as="div" className="flex flex-col gap-2 p-4">
                      <ul className="flex flex-col gap-2">
                        {advantages.map((x) => (
                          <li key={x} className="flex gap-2 text-[13.5px] font-semibold leading-[19px]">
                            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span>
                              <span className="sr-only">Avantage : </span>
                              {x}
                            </span>
                          </li>
                        ))}
                        {limits.map((l) => (
                          <li key={l} className="flex gap-2 text-[13.5px] font-semibold leading-[19px] text-warning">
                            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              <span className="sr-only">Limite : </span>
                              {l}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  </section>
                ) : null}
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Votre connexion" />
                  <Panel className="flex flex-col gap-2 p-4 text-sm">
                    {!connected ? (
                      <p className="font-semibold">{e.proAccountRequired ? "Pas encore connecté. Il faut votre propre compte pro chez ce fournisseur." : "Pas encore connecté : voir les méthodes d'accès (onglet Accès)."}</p>
                    ) : (
                      <>
                        <p className="font-bold tnum">
                          {formatNumber(e.org.accountOffers)} offre{e.org.accountOffers > 1 ? "s" : ""} de votre compte · {formatNumber(e.org.publicOffers)} publique{e.org.publicOffers > 1 ? "s" : ""}
                        </p>
                        <p className="text-[12.5px] font-semibold text-ink-3">{e.org.lastSyncAt ? `Dernière mise à jour : ${formatDateTime(e.org.lastSyncAt)} — données datées, pas du temps réel.` : "Aucune mise à jour réussie pour l'instant."}</p>
                      </>
                    )}
                    {lastImport ? (
                      <p className="text-[12.5px] font-semibold text-ink-3">
                        Dernier import : {formatDateTime(lastImport.startedAt)} · {countsText(lastImport.counts)}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {writer && e.org.supplierId ? (
                        <ButtonLink href={`/sourcing/imports?supplierId=${e.org.supplierId}`} variant="secondary">
                          Historique des imports
                        </ButtonLink>
                      ) : null}
                      {e.org.supplierId ? (
                        <ButtonLink href={`/suppliers/${e.org.supplierId}`} variant="ghost">
                          Commandes et performance
                        </ButtonLink>
                      ) : null}
                    </div>
                    {admin && e.org.connectionId ? (
                      <div className="border-t border-line-soft pt-3">
                        <p className="mb-2 text-xs font-semibold text-ink-3">Identifiants supprimés du serveur ; les offres reçues restent dans l&apos;historique.</p>
                        <DisconnectAccountForm connectionId={e.org.connectionId} accountName={name} />
                      </div>
                    ) : null}
                  </Panel>
                </section>
              </>
            ) : null}

            {tab === "produits" && hasProducts ? (
              offers && offers.offers.length > 0 ? (
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Produits récupérés" count={formatNumber(offers.total)} aside="Offres actives les plus récentes · prix datés" />
                  <SupplierOffersTable offers={offers.offers} orgCurrency={currency} caption={`Produits récupérés pour ${e.name}`} />
                  {offers.total > offers.offers.length ? <p className="text-[12.5px] font-semibold text-ink-3">… et {formatNumber(offers.total - offers.offers.length)} autres : utilisez la recherche Sourcing pour les comparer.</p> : null}
                </section>
              ) : (
                <Panel className="flex flex-col items-center gap-1.5 p-6 text-center">
                  <span className="text-[17px] font-bold">Pas encore de produits</span>
                  <span className="text-sm font-medium text-muted">Importez son catalogue ou lancez une synchronisation.</span>
                </Panel>
              )
            ) : null}

            {tab === "acces" ? (
              <>
                {r.primaryAction.kind === "connect_api" || r.primaryAction.kind === "activate_public" ? (
                  <section id="action" className="flex scroll-mt-20 flex-col gap-2.5">
                    <MonoTitle title={r.primaryAction.label} />
                    <Panel className="flex flex-col gap-3 p-4">
                      <p className="text-[13.5px] font-semibold text-muted">{r.primaryAction.outcome}</p>
                      <PrimaryAction entry={e} canWrite={writer} library={library} />
                    </Panel>
                  </section>
                ) : null}
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Méthodes d'accès" />
                  <Panel as="div" className="overflow-hidden">
                    <ul>
                      {r.accessMethods.map((m, i) => {
                        const Icon = METHOD_ICON[m];
                        return (
                          <li key={m} className={cn("flex gap-3 px-4 py-3", i > 0 && "border-t border-line-soft")}>
                            <ToneIcon tone={METHOD_TONE[m]}>
                              <Icon aria-hidden="true" />
                            </ToneIcon>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-[15px] font-semibold">{ACCESS_METHOD_LABEL[m]}</span>
                              <span className="text-[13px] font-semibold leading-[18px] text-ink-3">{METHOD_DETAIL[m]}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                  <p className="text-[13px] font-semibold text-ink-3">
                    Fiabilité : {RELIABILITY_LABEL[r.reliability]} · fiche du {formatDate(e.researchedAt)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {writer && r.accessMethods.some((m) => m === "manual_import" || m === "portal_export") && r.primaryAction.kind !== "import_catalog" ? (
                      <ButtonLink href={importHref(e)} variant="secondary">
                        Importer mon catalogue
                      </ButtonLink>
                    ) : null}
                    {writer && r.accessMethods.includes("catalog_feed") && r.primaryAction.kind !== "add_feed" ? (
                      <ButtonLink href="/sourcing/sources/new-feed" variant="secondary">
                        Ajouter mon flux
                      </ButtonLink>
                    ) : null}
                  </div>
                </section>
                {e.b2b ? (
                  <section className="flex flex-col gap-2.5">
                    <MonoTitle title="Fiche d'intégration B2B" aside={`étudiée le ${formatDate(e.b2b.checkedAt)}`} />
                    <Panel className="flex flex-col gap-2 p-4 text-[13.5px] font-semibold">
                      <p>
                        Méthode : {e.b2b.methodLabel} · Automatisation : {e.b2b.automationLabel}
                      </p>
                      <p className="text-ink-3">{e.b2b.activation}</p>
                      {e.b2b.questions.length ? (
                        <>
                          <p className="mt-1 font-bold">Questions à poser au fournisseur (reprises dans l&apos;e-mail)</p>
                          <ul className="list-disc space-y-0.5 pl-5 text-muted">
                            {e.b2b.questions.map((q) => (
                              <li key={q}>{q}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </Panel>
                  </section>
                ) : null}
              </>
            ) : null}

            {tab === "fiche" ? (
              <>
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Conditions et fiche" />
                  <Panel className="overflow-hidden">
                    <dl>
                      {facts
                        .filter((f) => f.value)
                        .map((f, i) => (
                          <div key={f.label} className={cn("grid gap-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-3", i > 0 && "border-t border-line-soft")}>
                            <dt className="text-xs font-bold leading-[18px] tracking-[0.2px] text-ink-3">{f.label}</dt>
                            <dd className="break-words text-[14.5px] font-semibold leading-5">{f.value}</dd>
                          </div>
                        ))}
                    </dl>
                  </Panel>
                </section>
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Ce qui a été vérifié" />
                  <Panel className="flex flex-col gap-2 p-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      {e.check ? e.check.reachable ? <Check aria-hidden="true" className="h-4 w-4 text-success" /> : <CircleAlert aria-hidden="true" className="h-4 w-4 text-danger" /> : null}
                      {e.check ? `${e.check.reachable ? "Site joignable" : "Site injoignable"} · ${formatDateTime(e.check.checkedAt)}` : "Site pas encore vérifié depuis le serveur"}
                    </p>
                    {e.check?.message ? <p className="text-[12.5px] font-semibold text-muted">{e.check.message}</p> : null}
                    <p className="text-[12.5px] font-semibold text-muted">{e.researchVerified ?? "—"}</p>
                    {e.sources.length ? (
                      <details className="text-xs">
                        <summary className="min-h-10 cursor-pointer py-2 font-bold text-muted">Sources consultées ({e.sources.length})</summary>
                        <ul className="list-disc space-y-0.5 pl-5 text-muted">
                          {e.sources.map((s) => (
                            <li key={s} className="break-all">
                              {s}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </Panel>
                </section>
                <section className="flex flex-col gap-2.5">
                  <MonoTitle title="Liens" />
                  <Panel className="flex flex-col items-start gap-1 p-4">
                    {website ? (
                      <ButtonLink href={website} variant="link" className="min-h-10">
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        Site officiel{r.domain ? ` (${r.domain})` : ""}
                      </ButtonLink>
                    ) : (
                      <span className="text-sm font-semibold text-muted">Aucun site officiel identifié.</span>
                    )}
                    {e.catalogUrl && e.catalogUrl !== e.website ? (
                      <ButtonLink href={e.catalogUrl} variant="link" className="min-h-10">
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        Catalogue / espace pro
                      </ButtonLink>
                    ) : null}
                    {e.apiDocsUrl ? (
                      <ButtonLink href={e.apiDocsUrl} variant="link" className="min-h-10">
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        Documentation API officielle
                      </ButtonLink>
                    ) : null}
                  </Panel>
                  <p className="text-[12.5px] font-semibold text-ink-3">Logo : identification uniquement, aucun partenariat.</p>
                </section>
              </>
            ) : null}
          </div>

          <aside aria-label="Avancement et demande d'accès" className="flex min-w-0 flex-[0_1_400px] flex-col gap-[18px]">
            <section className="flex flex-col gap-2.5">
              <MonoTitle title="Avancement" />
              <Panel className="p-4">
                <Timeline steps={steps} />
                <p className="text-xs font-semibold leading-[17px] text-ink-3">Chaque étape est confirmée par le serveur. Données datées, pas du temps réel.</p>
              </Panel>
            </section>
            <section className="flex flex-col gap-2.5">
              <MonoTitle title="Demande d'accès · e-mail prêt" />
              <AccessEmail email={e.email.fr} lang="fr" idPrefix={`email-${e.key}`} />
              <details className="text-sm">
                <summary className="min-h-10 cursor-pointer py-2 font-bold">Version anglaise (English)</summary>
                <AccessEmail email={e.email.en} lang="en" idPrefix={`email-${e.key}`} />
              </details>
              <p className="text-xs font-semibold leading-[17px] text-ink-3">Rédigé avec le nom de votre organisation. Aucun message n&apos;est envoyé automatiquement : vous choisissez le destinataire.</p>
            </section>
          </aside>
        </div>
      </Paper>
    </>
  );
}
