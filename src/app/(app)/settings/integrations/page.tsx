import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronDown, ExternalLink, Link2, Store } from "lucide-react";
import { requireOrgContext, isAdmin, canWrite, type OrgContext } from "@/features/auth/dal";
import { Callout } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Panel } from "@/components/instrument";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { getIntegrationsOverview, type ConnectionView } from "@/features/integrations/queries";
import { CONNECTION_STATUS_LABEL, formatRunSummary } from "@/features/integrations/format";
import { ConnectEbayButton } from "@/features/integrations/components/connect-ebay-button";
import { SyncNowForm } from "@/features/integrations/components/sync-now-form";
import { DisconnectForm } from "@/features/integrations/components/disconnect-form";
import { ConnectionSettingsForm } from "@/features/integrations/components/connection-settings-form";
import { ShippingPlatformsRow, ShippingPlatformsRowFallback } from "@/features/integrations/components/shipping-platforms-row";
import { connectionTone, intervalLabel, type ConnectionTone } from "@/features/integrations/components/labels";
import { SettingsSectionHeader } from "@/features/organizations/components/settings-section-header";
import { isUuid, oauthErrorMessage } from "@/features/integrations/oauth-flow";
import { RUNNING_STALE_MINUTES } from "@/services/sync/engine";
import { hasExtendedEbayScopes } from "@/integrations/ebay/config";

export const metadata: Metadata = { title: "Intégrations" };

const TONE_TEXT: Record<ConnectionTone, string> = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", neutral: "text-muted" };
const TONE_DOT: Record<ConnectionTone, string> = { success: "bg-success", warning: "bg-amber", danger: "bg-red", info: "bg-info", neutral: "bg-ink-4" };

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
  const headTone = head ? connectionTone(head.status) : "neutral";

  return (
    <>
      <SettingsSectionHeader title="Intégrations" description="Canaux de vente et services reliés à votre organisation. Chaque connexion passe par l'autorisation officielle du canal (OAuth) : votre mot de passe marketplace n'est jamais demandé ici." />

      {urlError ? (
        <Callout tone="danger" title="Connexion impossible">
          {urlError}
        </Callout>
      ) : null}
      {connected ? (
        <Callout tone="success" title="Compte eBay reconnecté" action={<ButtonLink href={`/settings/integrations/ebay/setup?connection=${connected}`} variant="secondary" size="sm">Ouvrir l&apos;assistant</ButtonLink>}>
          Les jetons ont été renouvelés ; vos annonces, commandes et associations existantes sont conservées.
        </Callout>
      ) : null}
      {overview.queryError ? (
        <Callout tone="danger" title="Impossible de charger les connexions">
          {overview.queryError}
        </Callout>
      ) : null}

      <Panel as="section" className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background text-muted">
            <Store aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <h3 className="text-[17px] font-bold text-foreground">eBay</h3>
              {overview.ebay.environment === "sandbox" ? <Badge variant="warning">sandbox</Badge> : null}
            </span>
            <span className="block truncate text-[13px] font-semibold text-ink-3">
              Canal de vente
              {head ? ` · compte ${head.external_username ?? "inconnu"} · ${head.environment === "sandbox" ? "Sandbox" : "Production"}` : " · annonces, commandes et quantités via les API officielles"}
            </span>
          </span>
          {head ? (
            <span className={cn("flex shrink-0 items-center gap-1.5 text-[13.5px] font-bold", TONE_TEXT[headTone])}>
              <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", TONE_DOT[headTone])} />
              {CONNECTION_STATUS_LABEL[head.status] ?? head.status}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-[13.5px] font-bold text-muted">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink-4" />
              Non connecté
            </span>
          )}
        </div>

        {!overview.ebay.configured ? (
          <Callout tone="warning" title="Intégration eBay non configurée sur ce serveur">
            <p>Les identifiants d&apos;application eBay ne sont pas renseignés : aucune connexion n&apos;est possible pour le moment.</p>
            {admin ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
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
              Guide : <code>docs/ebay-setup.md</code> (création des clés eBay, RuName, URL de retour, webhook, tâche planifiée).
            </p>
          </Callout>
        ) : activeEbay.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted">
              Aucun compte eBay connecté. La connexion ouvre la page d&apos;autorisation eBay ; une fois accordée, un assistant vous guide pour analyser vos annonces et les associer à vos SKU.
            </p>
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

        <details className="group rounded-xl border border-border px-4 py-1 text-sm">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 font-bold text-foreground [&::-webkit-details-marker]:hidden">
            Autorisations demandées à eBay ({overview.ebay.scopes.length})
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-3 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <ul className="mb-3 mt-1 space-y-1.5">
            {overview.ebay.scopes.map((s) => (
              <li key={s.scope}>
                <code className="ms-code break-all text-[11px] text-muted-strong">{s.scope}</code>
                <span className="block text-xs font-semibold text-ink-3">{s.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mb-1 mt-3 text-xs font-bold text-foreground">Analyse complète (facultative, lecture seule) — {overview.ebay.extendedScopes.length} autorisations en plus</p>
          <ul className="mb-3 space-y-1.5">
            {overview.ebay.extendedScopes.map((s) => (
              <li key={s.scope}>
                <code className="ms-code break-all text-[11px] text-muted-strong">{s.scope}</code>
                <span className="block text-xs font-semibold text-ink-3">{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      </Panel>

      <Panel as="section" className="overflow-hidden">
        <h3 className="sr-only">Autres intégrations</h3>
        <ul className="divide-y divide-line-soft">
          {overview.catalog
            .filter((c) => c.provider !== "ebay")
            .map((c) => (
              <li key={c.provider} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-muted">
                  <Store aria-hidden="true" className="h-[17px] w-[17px]" />
                </span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-[15px] font-semibold text-foreground">{c.label}</span>
                  <span className="block truncate text-[12.5px] font-semibold text-ink-3" title={c.description}>
                    {c.description}
                  </span>
                </span>
                <span className="text-[13px] font-semibold text-ink-3">Disponible prochainement</span>
              </li>
            ))}
          <li>
            <Suspense fallback={<ShippingPlatformsRowFallback />}>
              <ShippingPlatformsRow ctx={ctx} />
            </Suspense>
          </li>
        </ul>
      </Panel>
    </>
  );
}

/** Run « en cours » récent (un run plus ancien que RUNNING_STALE_MINUTES est considéré interrompu). */
function runningSince(view: ConnectionView): string | null {
  const r = view.lastRun;
  if (!r || r.status !== "running") return null;
  const ageMin = (Date.now() - new Date(r.started_at).getTime()) / 60_000;
  return ageMin < RUNNING_STALE_MINUTES ? r.started_at : null;
}

function Reading({ label, value, tone, first }: { label: string; value: string; tone?: "warning"; first?: boolean }) {
  return (
    <div className={cn("min-w-0 px-3.5 py-0.5", !first && "border-l border-line-soft", "max-sm:nth-[3]:border-l-0")}>
      <dt className="truncate text-[11px] font-bold text-ink-3">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-[17px] font-extrabold tnum", tone === "warning" ? "text-warning" : "text-foreground")}>{value}</dd>
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
  return (
    <div className={cn("flex flex-col gap-4", separated && "border-t border-line-soft pt-4")}>
      {separated ? (
        <p className="text-[13px] font-bold text-foreground">
          Compte {c.external_username ?? "inconnu"} · {CONNECTION_STATUS_LABEL[c.status] ?? c.status}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-y-3 rounded-[14px] border border-border py-3 sm:grid-cols-4">
        <Reading first label="Dernière synchro" value={c.last_sync_at ? formatRelative(c.last_sync_at) : "Jamais"} />
        <Reading label="Intervalle" value={c.auto_sync ? intervalLabel(c.sync_interval_minutes) : "Manuelle"} />
        <Reading label="Annonces actives" value={activeListings === null ? "—" : formatNumber(activeListings)} />
        <Reading label="Non rattachées" value={formatNumber(unmapped)} tone={unmapped > 0 ? "warning" : undefined} />
      </dl>

      {running ? (
        <Callout tone="info" title="Synchronisation en cours">
          Démarrée {formatRelative(running)} ({formatTime(running)}). Les résultats s&apos;afficheront ici à la fin du passage ; rechargez la page pour suivre l&apos;avancement.
        </Callout>
      ) : null}
      {envMismatch ? (
        <Callout tone="warning">
          Cette connexion a été établie en {c.environment} alors que le serveur est configuré en {environment} : les appels échoueront. Reconnectez le compte.
        </Callout>
      ) : null}
      {c.last_error ? (
        <Callout tone={c.status === "expired" ? "danger" : "warning"} title={c.status === "expired" ? "Autorisation expirée" : "Dernière erreur"} action={needsReconnect && admin ? <ConnectEbayButton label="Reconnecter eBay" variant="secondary" extended={extended} /> : null}>
          {c.last_error}
          {needsReconnect && !admin ? <span className="block text-xs">Demandez à un administrateur de reconnecter eBay.</span> : null}
        </Callout>
      ) : null}

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

      <ConnectionSettingsForm connection={c} disabled={!admin} />

      <div className="flex flex-wrap items-start gap-2.5">
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
          </a>
        ) : null}
        {needsReconnect && admin ? <ConnectEbayButton label="Reconnecter eBay" variant="secondary" extended={extended} /> : null}
        {admin ? (
          <span className="ml-auto">
            <DisconnectForm connectionId={c.id} username={c.external_username} />
          </span>
        ) : null}
      </div>
      {!writer ? <p className="text-xs font-semibold text-ink-3">Votre rôle (lecture seule) ne permet pas de lancer une synchronisation.</p> : null}

      <details className="group rounded-xl border border-border px-4 py-1 text-sm">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 font-bold text-foreground [&::-webkit-details-marker]:hidden">
          Détails de la connexion
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-3 transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <dl className="mb-3 mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {[
            { label: "Dernière synchronisation", value: c.last_sync_at ? formatDateTime(c.last_sync_at) : "Jamais" },
            { label: "Dernier passage", value: view.lastRun ? formatRunSummary(view.lastRun) : "Aucun passage enregistré" },
            { label: "Dernière réussite", value: c.last_successful_sync_at ? formatDateTime(c.last_successful_sync_at) : "—" },
            { label: "Commandes récupérées jusqu'au", value: c.last_orders_cursor ? formatDateTime(c.last_orders_cursor) : "Pas encore importées" },
            { label: "Connecté le", value: formatDateTime(c.connected_at) },
            { label: "Autorisation valable jusqu'au", value: c.refresh_token_expires_at ? formatDateTime(c.refresh_token_expires_at) : "—" },
          ].map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="ms-mono text-[10px] leading-[13px] text-ink-3">{it.label}</dt>
              <dd className="mt-1 break-words text-[13.5px] font-semibold text-foreground">{it.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
