import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Link2, Loader2, RotateCw, Store } from "lucide-react";
import { requireOrgContext, isAdmin, canWrite, type OrgContext } from "@/features/auth/dal";
import { Alert, Callout } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { MonoTitle, Panel } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { getIntegrationsOverview, type ConnectionView } from "@/features/integrations/queries";
import { ConnectEbayButton } from "@/features/integrations/components/connect-ebay-button";
import { SyncNowForm } from "@/features/integrations/components/sync-now-form";
import { DisconnectForm } from "@/features/integrations/components/disconnect-form";
import { ConnectionSettingsForm } from "@/features/integrations/components/connection-settings-form";
import { ShippingPlatformsRow, ShippingPlatformsRowFallback } from "@/features/integrations/components/shipping-platforms-row";
import { intervalLabel } from "@/features/integrations/components/labels";
import { ConnectionStatusBadge, RunSummary } from "@/features/integrations/components/run-status";
import { extraErrorsAfterResume, isBudgetResume } from "@/features/integrations/components/sync-status";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";
import { isUuid, oauthErrorMessage } from "@/features/integrations/oauth-flow";
import { RUNNING_STALE_MINUTES } from "@/services/sync/engine";
import { hasExtendedEbayScopes } from "@/integrations/ebay/config";

export const metadata: Metadata = { title: "Intégrations" };

/** Nombre d'annonces actives par connexion (compte exact, aucune estimation). */
async function activeListingCounts(ctx: OrgContext, ids: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("connection_id", id).eq("status", "active");
      out.set(id, error ? null : (count ?? null));
    }),
  );
  return out;
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const ctx = await requireOrgContext();
  const params = await searchParams;
  // Seul un code d'erreur est accepté dans l'URL : jamais de texte libre recopié dans la page.
  const urlError = oauthErrorMessage(params.error);
  const connected = isUuid(params.connected) ? params.connected : null;
  const overview = await getIntegrationsOverview(ctx);
  const admin = isAdmin(ctx.role);
  const writer = canWrite(ctx.role);
  const ebayConnections = overview.connections.filter((c) => c.connection.provider === "ebay");
  const activeEbay = ebayConnections.filter((c) => c.connection.status !== "disconnected");
  const listingCounts = await activeListingCounts(
    ctx,
    activeEbay.map((v) => v.connection.id),
  );
  const head = activeEbay[0]?.connection;

  return (
    <>
      <SettingsSectionHeader title="Intégrations" description="Canaux de vente et services reliés à votre organisation. Chaque connexion passe par l'autorisation officielle du canal (OAuth) : votre mot de passe marketplace n'est jamais demandé ici." />

      {urlError ? (
        <Alert tone="danger" title="Connexion impossible">
          {urlError}
        </Alert>
      ) : null}
      {connected ? (
        <Alert tone="success" title="Compte eBay reconnecté" action={<ButtonLink href={`/settings/integrations/ebay/setup?connection=${connected}`} variant="secondary" size="sm">Ouvrir l&apos;assistant</ButtonLink>}>
          Les jetons ont été renouvelés ; vos annonces, commandes et associations existantes sont conservées.
        </Alert>
      ) : null}
      {overview.queryError ? (
        <Alert tone="danger" title="Impossible de charger les connexions">
          {overview.queryError}
        </Alert>
      ) : null}

      <section aria-labelledby="ebay-title" className="space-y-2">
        <MonoTitle title="Canal de vente" as="div" />
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-4 sm:px-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-[15px] font-extrabold tracking-[-0.3px] text-foreground" aria-hidden="true">
              eB
            </span>
            <span className="min-w-0 flex-[1_1_220px]">
              <span className="flex flex-wrap items-center gap-2">
                <h3 id="ebay-title" className="text-[17px] font-bold text-foreground">
                  eBay
                </h3>
                {overview.ebay.environment === "sandbox" ? <Badge variant="warning">sandbox</Badge> : null}
              </span>
              <span className="block truncate text-[13px] font-semibold text-ink-3">
                {head ? (
                  <>
                    Compte <span className="text-muted-strong">{head.external_username ?? "inconnu"}</span> · {head.environment === "sandbox" ? "Sandbox" : "Production"}
                  </>
                ) : (
                  "Annonces, commandes et quantités via les API officielles"
                )}
              </span>
            </span>
            <ConnectionStatusBadge status={head ? head.status : overview.ebay.configured ? null : "unconfigured"} />
          </div>

          <div className="flex flex-col gap-4 p-4 sm:p-5">
            {!overview.ebay.configured ? (
              <Callout tone="warning" title="Intégration eBay non configurée sur ce serveur">
                <p>Les identifiants d&apos;application eBay ne sont pas renseignés : aucune connexion n&apos;est possible pour le moment.</p>
                {admin ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {overview.ebay.issues.map((i) => (
                      <li key={i} className="ms-code break-all">
                        {i}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs">Contactez l&apos;administrateur du serveur.</p>
                )}
                <p className="mt-2 text-xs">
                  Guide : <code className="ms-code">docs/ebay-setup.md</code> (création des clés eBay, RuName, URL de retour, webhook, tâche planifiée).
                </p>
              </Callout>
            ) : activeEbay.length === 0 ? (
              <div className="space-y-4">
                <ol className="grid gap-3 sm:grid-cols-3">
                  {[
                    { n: "1", t: "Autoriser chez eBay", d: "Page officielle d'eBay : votre mot de passe n'est jamais saisi ici." },
                    { n: "2", t: "Analyser vos annonces", d: "Un assistant lit vos annonces actives et repère les SKU." },
                    { n: "3", t: "Associer et synchroniser", d: "Vous validez les associations ; les ventes décrémentent le stock." },
                  ].map((step) => (
                    <li key={step.n} className="rounded-xl border border-line-soft bg-surface-2 px-3.5 py-3">
                      <span className="ms-code text-[11px] text-ink-3">{step.n}</span>
                      <span className="mt-0.5 block text-sm font-bold text-foreground">{step.t}</span>
                      <span className="mt-0.5 block text-[12.5px] font-semibold leading-[17px] text-muted">{step.d}</span>
                    </li>
                  ))}
                </ol>
                {ebayConnections.length > 0 ? (
                  <Callout tone="neutral">
                    Une précédente connexion ({ebayConnections.map((c) => c.connection.external_username ?? "compte inconnu").join(", ")}) a été déconnectée. Reconnecter le même compte restaure ses annonces et associations.
                  </Callout>
                ) : null}
                {admin ? (
                  <div className="flex flex-wrap gap-2.5">
                    <ConnectEbayButton />
                    <ConnectEbayButton extended variant="secondary" label="Connecter avec l'analyse complète" />
                  </div>
                ) : (
                  <Callout tone="neutral">Seuls les administrateurs de l&apos;organisation peuvent connecter eBay.</Callout>
                )}
                <p className="text-xs font-semibold text-ink-3">
                  L&apos;analyse complète autorise en plus, en lecture seule, vos finances eBay (frais, versements), le trafic de vos annonces et vos campagnes publicitaires : le conseiller peut alors répondre à des questions précises sur ces sujets.
                </p>
              </div>
            ) : (
              activeEbay.map((view, i) => (
                <EbayConnectionPanel key={view.connection.id} view={view} admin={admin} writer={writer} environment={overview.ebay.environment} unmapped={overview.unmappedCount} activeListings={listingCounts.get(view.connection.id) ?? null} separated={i > 0} />
              ))
            )}

            <Disclosure title={`Autorisations demandées à eBay (${overview.ebay.scopes.length})`}>
              <ul className="space-y-2">
                {overview.ebay.scopes.map((s) => (
                  <li key={s.scope}>
                    <code className="ms-code break-all text-[11px] text-muted-strong">{s.scope}</code>
                    <span className="block text-xs font-semibold text-ink-3">{s.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mb-1 mt-4 text-xs font-bold text-foreground">Analyse complète (facultative, lecture seule) — {overview.ebay.extendedScopes.length} autorisations en plus</p>
              <ul className="space-y-2">
                {overview.ebay.extendedScopes.map((s) => (
                  <li key={s.scope}>
                    <code className="ms-code break-all text-[11px] text-muted-strong">{s.scope}</code>
                    <span className="block text-xs font-semibold text-ink-3">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        </Panel>
      </section>

      <section aria-labelledby="others-title" className="space-y-2">
        <MonoTitle title="Autres intégrations" as="div" />
        <h3 id="others-title" className="sr-only">
          Autres intégrations
        </h3>
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {overview.catalog
              .filter((c) => c.provider !== "ebay")
              .map((c) => (
                <li key={c.provider} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-muted">
                    <Store aria-hidden="true" className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block text-[15px] font-semibold text-foreground">{c.label}</span>
                    <span className="block truncate text-[12.5px] font-semibold text-ink-3" title={c.description}>
                      {c.description}
                    </span>
                  </span>
                  <Badge variant="outline">Disponible prochainement</Badge>
                </li>
              ))}
            <li>
              <Suspense fallback={<ShippingPlatformsRowFallback />}>
                <ShippingPlatformsRow ctx={ctx} />
              </Suspense>
            </li>
          </ul>
        </Panel>
      </section>
    </>
  );
}

/** Bloc repliable (autorisations, détails techniques). */
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 font-bold text-foreground hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-3 transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="border-t border-line-soft px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

/** Run « en cours » récent (un run plus ancien que RUNNING_STALE_MINUTES est considéré interrompu). */
function runningSince(view: ConnectionView): string | null {
  const r = view.lastRun;
  if (!r || r.status !== "running") return null;
  const ageMin = (Date.now() - new Date(r.started_at).getTime()) / 60_000;
  return ageMin < RUNNING_STALE_MINUTES ? r.started_at : null;
}

function Reading({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="min-w-0 px-4 py-3 [&:nth-child(2n)]:border-l [&:nth-child(2n)]:border-line-soft sm:border-l sm:border-line-soft sm:first:border-l-0 max-sm:[&:nth-child(n+3)]:border-t max-sm:[&:nth-child(n+3)]:border-line-soft">
      <dt className="ms-mono truncate text-[10.5px] leading-[14px] text-ink-3">{label}</dt>
      <dd className={cn("mt-1 truncate text-[19px] font-bold leading-6 tnum", tone === "warning" ? "text-warning" : "text-foreground")}>{value}</dd>
    </div>
  );
}

function EbayConnectionPanel({ view, admin, writer, environment, unmapped, activeListings, separated }: { view: ConnectionView; admin: boolean; writer: boolean; environment: "production" | "sandbox" | null; unmapped: number; activeListings: number | null; separated: boolean }) {
  const c = view.connection;
  const needsReconnect = c.status === "expired" || c.status === "pending";
  const running = runningSince(view);
  // Une reconnexion conserve le niveau d'autorisation déjà accordé (standard ou analyse complète).
  const extended = hasExtendedEbayScopes(c.scopes);
  const envMismatch = environment && c.environment !== environment;
  // « Budget de temps atteint » : arrêt propre, reprise au prochain passage — pas une erreur.
  const resume = isBudgetResume(c.last_error);
  const extraErrors = extraErrorsAfterResume(c.last_error);
  return (
    <div className={cn("flex flex-col gap-4", separated && "border-t border-line-soft pt-4")}>
      {separated ? (
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-foreground">
          Compte {c.external_username ?? "inconnu"} <ConnectionStatusBadge status={c.status} size="sm" />
        </p>
      ) : null}
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-4">
        <Reading label="Dernière synchro" value={c.last_sync_at ? formatRelative(c.last_sync_at) : "Jamais"} />
        <Reading label="Intervalle" value={c.auto_sync ? intervalLabel(c.sync_interval_minutes) : "Manuelle"} />
        <Reading label="Annonces actives" value={activeListings === null ? "—" : formatNumber(activeListings)} />
        <Reading label="Non rattachées" value={formatNumber(unmapped)} tone={unmapped > 0 ? "warning" : undefined} />
      </dl>

      {running ? (
        <Callout tone="info" title="Synchronisation en cours" icon={<Loader2 className="animate-spin" />}>
          Démarrée {formatRelative(running)} ({formatTime(running)}). Les résultats s&apos;afficheront ici à la fin du passage ; rechargez la page pour suivre l&apos;avancement.
        </Callout>
      ) : null}
      {envMismatch ? (
        <Callout tone="warning">
          Cette connexion a été établie en {c.environment} alors que le serveur est configuré en {environment} : les appels échoueront. Reconnectez le compte.
        </Callout>
      ) : null}
      {c.last_error && resume ? (
        <Callout tone="info" title="Reprise au prochain passage" icon={<RotateCw />}>
          Le dernier passage a atteint son budget de temps et s&apos;est arrêté proprement après la dernière étape confirmée. Aucune donnée n&apos;est perdue : la suite est reprise automatiquement au prochain passage.
          {extraErrors > 0 ? <span className="mt-1 block text-xs">{extraErrors} autre(s) erreur(s) signalée(s) sur ce passage : voir l&apos;historique de synchronisation.</span> : null}
        </Callout>
      ) : c.last_error ? (
        <Callout tone={c.status === "expired" ? "danger" : "warning"} title={c.status === "expired" ? "Autorisation expirée" : "Dernière erreur"} action={needsReconnect && admin ? <ConnectEbayButton label="Reconnecter eBay" variant="secondary" extended={extended} /> : null}>
          {c.last_error}
          {needsReconnect && !admin ? <span className="block text-xs">Demandez à un administrateur de reconnecter eBay.</span> : null}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line-soft bg-surface-2 px-3.5 py-3">
        <span className="min-w-0">
          <span className="ms-mono block text-[10.5px] leading-[14px] text-ink-3">Dernier passage</span>
          {view.lastRun ? (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-muted">
              <RunSummary run={view.lastRun} />
              <span className="text-ink-3">· {formatRelative(view.lastRun.started_at)}</span>
            </span>
          ) : (
            <span className="mt-1 block text-[13px] font-semibold text-muted">Aucun passage enregistré.</span>
          )}
        </span>
        <ButtonLink href={view.lastRun ? `/settings/sync/${view.lastRun.id}` : "/settings/sync"} variant="ghost" size="sm">
          {view.lastRun ? "Détail du passage" : "Historique"}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </ButtonLink>
      </div>

      {extended ? (
        <Callout tone="success" title="Analyse complète activée">
          Le conseiller peut lire, en lecture seule, vos finances eBay (transactions, frais par type, versements), le trafic de vos annonces, votre niveau vendeur et vos campagnes publicitaires.
        </Callout>
      ) : (
        <Callout tone="neutral" title="Analyse complète du conseiller" action={admin && !needsReconnect ? <ConnectEbayButton extended variant="secondary" label="Autoriser l'analyse complète" /> : null}>
          Le conseiller lit déjà vos commandes, annonces, évaluations et messages eBay. En autorisant l&apos;analyse complète (nouvelle autorisation sur eBay, lecture seule), il pourra aussi répondre sur vos frais et versements, le trafic de vos annonces (vues, taux de clic, conversion), votre niveau vendeur et vos promotions. Rien n&apos;est modifié sur eBay ; vos annonces, commandes et associations sont conservées.
          {!admin ? <span className="block text-xs">Seul un administrateur peut l&apos;autoriser.</span> : null}
        </Callout>
      )}

      <div className="space-y-2">
        <MonoTitle title="Paramètres de la connexion" as="div" />
        <ConnectionSettingsForm connection={c} disabled={!admin} />
      </div>

      <div className="flex flex-wrap items-start gap-2.5 border-t border-line-soft pt-4">
        {writer ? (
          <SyncNowForm
            connectionId={c.id}
            disabled={needsReconnect || Boolean(running)}
            disabledReason={needsReconnect ? "Reconnectez eBay avant de synchroniser." : running ? "Une synchronisation est déjà en cours pour cette connexion." : undefined}
          />
        ) : null}
        <ButtonLink href="/settings/integrations/mapping" variant="secondary">
          <Link2 aria-hidden="true" className="h-4 w-4" />
          {unmapped > 0 ? `Associer ${formatNumber(unmapped)} annonce${unmapped > 1 ? "s" : ""}` : "Gérer les associations"}
        </ButtonLink>
        <ButtonLink href={`/settings/integrations/ebay/setup?connection=${c.id}`} variant="ghost" className="text-foreground">
          Configuration du catalogue
        </ButtonLink>
        {c.external_account_id ? (
          <a href={c.environment === "sandbox" ? "https://www.sandbox.ebay.com/" : "https://www.ebay.fr/mye/myebay/selling"} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "md")}>
            Mon eBay <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">(nouvel onglet)</span>
          </a>
        ) : null}
        {needsReconnect && admin ? <ConnectEbayButton label="Reconnecter eBay" variant="secondary" extended={extended} /> : null}
        {admin ? (
          <span className="sm:ml-auto">
            <DisconnectForm connectionId={c.id} username={c.external_username} />
          </span>
        ) : null}
      </div>
      {!writer ? <p className="text-xs font-semibold text-ink-3">Votre rôle (lecture seule) ne permet pas de lancer une synchronisation.</p> : null}

      <Disclosure title="Détails de la connexion">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {[
            { label: "Dernière synchronisation complète", value: c.last_sync_at ? formatDateTime(c.last_sync_at) : "Jamais" },
            { label: "Dernier passage", value: view.lastRun ? <RunSummary run={view.lastRun} /> : "Aucun passage enregistré" },
            { label: "Dernière réussite", value: c.last_successful_sync_at ? formatDateTime(c.last_successful_sync_at) : "—" },
            { label: "Commandes récupérées jusqu'au", value: c.last_orders_cursor ? formatDateTime(c.last_orders_cursor) : "Pas encore importées" },
            { label: "Connecté le", value: formatDateTime(c.connected_at) },
            { label: "Autorisation valable jusqu'au", value: c.refresh_token_expires_at ? formatDateTime(c.refresh_token_expires_at) : "—" },
          ].map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="ms-mono text-[10px] leading-[13px] text-ink-3">{it.label}</dt>
              <dd className="mt-1 break-words text-[13.5px] font-semibold text-foreground tnum">{it.value}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </div>
  );
}
