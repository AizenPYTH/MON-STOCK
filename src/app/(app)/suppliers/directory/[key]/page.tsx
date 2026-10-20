import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleAlert, Circle, CircleDot, ExternalLink, TriangleAlert, X } from "lucide-react";
import { requireOrgContext, canWrite, isAdmin } from "@/features/auth/dal";
import { PageHeader, Callout, DescriptionList, Section } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { directoryForOrg } from "@/services/sourcing/supplier-directory";
import { supplierOffers } from "@/services/sourcing/pro-accounts";
import { listImportJobs } from "@/services/sourcing/catalog-import";
import { sourceLibrary, type LibraryEntryDTO } from "@/services/sourcing/source-library";
import type { ImportJobDTO, SupplierOffersDTO } from "@/features/mobile-api/contract";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  TIER_HINT,
  TIER_LABEL,
  type StepState,
} from "@/features/directory/labels";
import { SupplierBadge } from "@/features/directory/components/supplier-badge";
import { AccessEmail } from "@/features/directory/components/access-email";
import { importHref, PrimaryAction } from "@/features/directory/components/primary-action";
import { DisconnectAccountForm } from "@/features/pro-accounts/components/account-forms";
import { SupplierOffersTable } from "@/features/pro-accounts/components/offers-table";
import { countsText } from "@/features/catalog-imports/labels";

export const metadata: Metadata = { title: "Fiche fournisseur (annuaire)" };

const STEP_ICON: Record<StepState, typeof Check> = { done: Check, current: CircleDot, todo: Circle, error: X };
const STEP_CLASS: Record<StepState, string> = {
  done: "border-success bg-success-soft text-green-700",
  current: "border-warning bg-warning-soft text-amber-700",
  todo: "border-border bg-surface text-muted",
  error: "border-danger bg-danger-soft text-red-700",
};
const STEP_SR: Record<StepState, string> = { done: "fait", current: "en cours", todo: "à faire", error: "en erreur" };

export default async function DirectoryEntryPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requireOrgContext();
  const { key } = await params;
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

  const [offers, imports, library]: [SupplierOffersDTO | null, ImportJobDTO[], LibraryEntryDTO | null] = await Promise.all([
    e.org.supplierId ? supplierOffers(ctx, e.org.supplierId, 30) : Promise.resolve(null),
    e.org.supplierId ? listImportJobs(ctx, { supplierId: e.org.supplierId, limit: 5 }) : Promise.resolve([]),
    r.libraryKey ? sourceLibrary(ctx).then((l) => l.entries.find((x) => x.key === r.libraryKey) ?? null) : Promise.resolve(null),
  ]);

  const status = displayStatus(e);
  const steps = progressSteps(e);
  const { advantages, limits } = advantagesAndLimits(e);
  const connected = e.org.status !== "not_connected";
  const lastImport = imports[0] ?? null;
  const facts: { label: string; value: string | null }[] = [
    { label: "Pays", value: [countryLabel(e.country), e.deliveryZones.length ? `livre : ${e.deliveryZones.join(", ")}` : null].filter(Boolean).join(" · ") || null },
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

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={"/suppliers/directory" as never} className="hover:underline">
            Fournisseurs · Annuaire
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <SupplierBadge name={e.name} domain={e.registry.domain} size="lg" />
            <span>{shortName(e.name)}</span>
          </span>
        }
        description={[countryLabel(e.country), segmentLabel(e.segment), r.domain].filter(Boolean).join(" · ")}
        actions={
          <>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant="outline" title={TIER_HINT[e.tier]}>
              Niveau : {TIER_LABEL[e.tier]}
            </Badge>
            <Badge variant="outline">Priorité {r.priority.tier}</Badge>
          </>
        }
      />

      {e.org.lastError ? (
        <Callout tone="danger" className="mb-5" title="Connexion en erreur">
          {e.org.lastError}
          {e.org.lastSyncAt ? <span className="block text-xs">Dernière réussite {formatRelative(e.org.lastSyncAt)}</span> : null}
        </Callout>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {r.primaryAction.kind !== "none" ? (
            <Card>
              <CardHeader title={r.primaryAction.label} description={r.primaryAction.outcome} />
              <CardContent>
                <PrimaryAction entry={e} canWrite={writer} library={library} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Avancement" description="Chaque étape est confirmée par le serveur. Données datées, pas du temps réel." />
            <CardContent>
              <ol className="relative space-y-4">
                {steps.map((s, i) => {
                  const Icon = STEP_ICON[s.state];
                  return (
                    <li key={s.key} className="relative flex gap-3">
                      {i < steps.length - 1 ? <span aria-hidden="true" className="absolute left-3 top-7 h-[calc(100%-0.5rem)] w-px bg-border" /> : null}
                      <span aria-hidden="true" className={cn("relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", STEP_CLASS[s.state])}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {s.label}
                          <span className="sr-only"> — {STEP_SR[s.state]}</span>
                        </div>
                        <p className={cn("text-xs", s.state === "error" ? "text-danger" : "text-muted")}>{s.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Votre connexion" />
            <CardContent className="space-y-2 text-sm">
              {!connected ? (
                <p>{e.proAccountRequired ? "Pas encore connecté. Il faut votre propre compte pro chez ce fournisseur." : "Pas encore connecté : voir les méthodes d'accès ci-dessous."}</p>
              ) : (
                <>
                  <p className="tnum">
                    {formatNumber(e.org.accountOffers)} offre{e.org.accountOffers > 1 ? "s" : ""} de votre compte · {formatNumber(e.org.publicOffers)} publique{e.org.publicOffers > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted">{e.org.lastSyncAt ? `Dernière mise à jour : ${formatDateTime(e.org.lastSyncAt)} — données datées, pas du temps réel.` : "Aucune mise à jour réussie pour l'instant."}</p>
                </>
              )}
              {lastImport ? (
                <p className="text-xs text-muted">
                  Dernier import : {formatDateTime(lastImport.startedAt)} · {countsText(lastImport.counts)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {writer && e.org.supplierId ? (
                  <ButtonLink href={`/sourcing/imports?supplierId=${e.org.supplierId}`} variant="secondary" size="sm">
                    Historique des imports
                  </ButtonLink>
                ) : null}
                {e.org.supplierId ? (
                  <ButtonLink href={`/suppliers/${e.org.supplierId}`} variant="ghost" size="sm">
                    Fiche fournisseur de l&apos;organisation
                  </ButtonLink>
                ) : null}
              </div>
              {admin && e.org.connectionId ? (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs text-muted">Identifiants supprimés du serveur ; les offres reçues restent dans l&apos;historique.</p>
                  <DisconnectAccountForm connectionId={e.org.connectionId} accountName={shortName(e.name)} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          {e.org.supplierId ? (
            <Section title={`Produits récupérés${offers ? ` (${formatNumber(offers.total)})` : ""}`} description="Offres actives les plus récemment vues ; prix datés.">
              {offers && offers.offers.length > 0 ? (
                <>
                  <SupplierOffersTable offers={offers.offers} orgCurrency={currency} caption={`Produits récupérés pour ${e.name}`} />
                  {offers.total > offers.offers.length ? <p className="text-xs text-muted">… et {formatNumber(offers.total - offers.offers.length)} autres : utilisez la recherche Sourcing pour les comparer.</p> : null}
                </>
              ) : (
                <Callout tone="neutral" action={writer ? <ButtonLink href={importHref(e)} size="sm" variant="secondary">Importer un catalogue</ButtonLink> : undefined}>
                  Aucun produit actif : importez son catalogue ou lancez une synchronisation.
                </Callout>
              )}
            </Section>
          ) : null}

          <Section title="Méthodes d'accès" description={`Fiabilité : ${RELIABILITY_LABEL[r.reliability]} · fiche du ${formatDate(e.researchedAt)}`}>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {r.accessMethods.map((m) => (
                <li key={m} className="px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {ACCESS_METHOD_LABEL[m]}
                    {m === "official_api" || m === "public_integrated" ? <Badge variant="success">intégré</Badge> : m === "not_automatable" ? <Badge variant="danger">non automatisable</Badge> : m === "pro_account_first" ? <Badge variant="warning">préalable</Badge> : null}
                  </div>
                  <p className="text-xs text-muted">{METHOD_DETAIL[m]}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {writer && r.accessMethods.some((m) => m === "manual_import" || m === "portal_export") && r.primaryAction.kind !== "import_catalog" ? (
                <ButtonLink href={importHref(e)} variant="secondary" size="sm">
                  Importer mon catalogue
                </ButtonLink>
              ) : null}
              {writer && r.accessMethods.includes("catalog_feed") && r.primaryAction.kind !== "add_feed" ? (
                <ButtonLink href="/sourcing/sources/new-feed" variant="secondary" size="sm">
                  Ajouter mon flux
                </ButtonLink>
              ) : null}
            </div>
          </Section>

          {advantages.length || limits.length ? (
            <Section title="Avantages et limites">
              <ul className="space-y-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                {advantages.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>
                      <span className="sr-only">Avantage : </span>
                      {x}
                    </span>
                  </li>
                ))}
                {limits.map((l) => (
                  <li key={l} className="flex gap-2 text-amber-800">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="sr-only">Limite : </span>
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Conditions et fiche">
            <Card>
              <CardContent>
                <DescriptionList items={facts.filter((f) => f.value).map((f) => ({ label: f.label, value: f.value }))} />
              </CardContent>
            </Card>
          </Section>

          <Section title="Ce qui a été vérifié">
            <Card>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  {e.check ? e.check.reachable ? <Check aria-hidden="true" className="h-4 w-4 text-success" /> : <CircleAlert aria-hidden="true" className="h-4 w-4 text-danger" /> : null}
                  {e.check ? `${e.check.reachable ? "Site joignable" : "Site injoignable"} · ${formatDateTime(e.check.checkedAt)}` : "Site pas encore vérifié depuis le serveur"}
                </p>
                {e.check?.message ? <p className="text-xs text-muted-strong">{e.check.message}</p> : null}
                <p className="text-xs text-muted-strong">{e.researchVerified ?? "—"}</p>
                {e.sources.length ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted">Sources consultées ({e.sources.length})</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-strong">
                      {e.sources.map((s) => (
                        <li key={s} className="break-all">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          </Section>
        </div>

        <aside className="space-y-5" aria-label="Demande d'accès et liens">
          <Card>
            <CardHeader title="Demande d'accès (e-mail prêt)" description="Rédigé avec le nom de votre organisation. Aucun message n'est envoyé automatiquement." />
            <CardContent className="space-y-4">
              <AccessEmail email={e.email.fr} lang="fr" idPrefix={`email-${e.key}`} />
              <details>
                <summary className="cursor-pointer text-sm font-medium">Version anglaise (English)</summary>
                <div className="pt-3">
                  <AccessEmail email={e.email.en} lang="en" idPrefix={`email-${e.key}`} />
                </div>
              </details>
              {e.b2b ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Questions à poser au fournisseur</summary>
                  <p className="mt-2 text-xs text-muted">{e.b2b.activation}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-strong">
                    {e.b2b.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">Reprises dans l&apos;e-mail en français.</p>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Liens" />
            <CardContent className="flex flex-col items-start gap-2">
              {e.website ? (
                <ButtonLink href={e.website} variant="link">
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Site officiel{r.domain ? ` (${r.domain})` : ""}
                </ButtonLink>
              ) : (
                <span className="text-sm text-muted">Aucun site officiel identifié.</span>
              )}
              {e.catalogUrl && e.catalogUrl !== e.website ? (
                <ButtonLink href={e.catalogUrl} variant="link">
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Catalogue / espace pro
                </ButtonLink>
              ) : null}
              {e.apiDocsUrl ? (
                <ButtonLink href={e.apiDocsUrl} variant="link">
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Documentation API officielle
                </ButtonLink>
              ) : null}
            </CardContent>
          </Card>

          {e.b2b ? (
            <Card>
              <CardHeader title="Fiche d'intégration B2B" />
              <CardContent>
                <DescriptionList
                  className="sm:grid-cols-1"
                  items={[
                    { label: "Méthode", value: e.b2b.methodLabel },
                    { label: "Automatisation", value: e.b2b.automationLabel },
                    { label: "Étudiée le", value: formatDate(e.b2b.checkedAt) },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          <p className="text-xs text-muted">Logo : identification uniquement, aucun partenariat.</p>
        </aside>
      </div>
    </>
  );
}
