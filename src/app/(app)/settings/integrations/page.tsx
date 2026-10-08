import type { Metadata } from "next";
import { Link2, ExternalLink } from "lucide-react";
import { requireOrgContext, isAdmin, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout, Section, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { getIntegrationsOverview, type ConnectionView } from "@/features/integrations/queries";
import { CONNECTION_STATUS_LABEL, formatRunSummary } from "@/features/integrations/format";
import { ConnectEbayButton } from "@/features/integrations/components/connect-ebay-button";
import { SyncNowForm } from "@/features/integrations/components/sync-now-form";
import { DisconnectForm } from "@/features/integrations/components/disconnect-form";
import { ConnectionSettingsForm } from "@/features/integrations/components/connection-settings-form";
import { isUuid, oauthErrorMessage } from "@/features/integrations/oauth-flow";
import { RUNNING_STALE_MINUTES } from "@/services/sync/engine";

export const metadata: Metadata = { title: "Intégrations" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { connected: "success", error: "warning", expired: "danger", pending: "info", disconnected: "neutral" };
const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { connected: "success", error: "warning", expired: "danger", pending: "info", disconnected: "neutral" };

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

  return (
    <>
      <PageHeader title="Intégrations" description="Connectez vos canaux de vente. Chaque connexion passe par l'autorisation OAuth officielle du canal : votre mot de passe marketplace n'est jamais demandé ici." />

      {urlError ? (
        <Callout tone="danger" title="Connexion impossible" className="mb-5">
          {urlError}
        </Callout>
      ) : null}
      {connected ? (
        <Callout tone="success" title="Compte eBay reconnecté" className="mb-5" action={<ButtonLink href={`/settings/integrations/ebay/setup?connection=${connected}`} variant="secondary" size="sm">Ouvrir l'assistant</ButtonLink>}>
          Les tokens ont été renouvelés ; vos annonces, commandes et associations existantes sont conservées.
        </Callout>
      ) : null}
      {overview.queryError ? (
        <Callout tone="danger" title="Impossible de charger les connexions" className="mb-5">
          {overview.queryError}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  eBay
                  {overview.ebay.environment === "sandbox" ? <Badge variant="warning">sandbox</Badge> : null}
                </span>
              }
              description="Annonces, commandes et quantités via les API officielles eBay (OAuth 2.0, Sell Fulfillment, Trading)."
            />
            <CardContent className="space-y-5">
              {!overview.ebay.configured ? (
                <Callout tone="warning" title="Intégration eBay non configurée sur ce serveur">
                  <p>Les identifiants d'application eBay ne sont pas renseignés : aucune connexion n'est possible pour le moment.</p>
                  {admin ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                      {overview.ebay.issues.map((i) => (
                        <li key={i} className="font-mono">
                          {i}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs">Contactez l'administrateur du serveur.</p>
                  )}
                  <p className="mt-2 text-xs">
                    Guide : <code>docs/ebay-setup.md</code> (création des clés eBay, RuName, URL de callback, webhook, cron).
                  </p>
                </Callout>
              ) : activeEbay.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    Aucun compte eBay connecté. La connexion ouvre la page d'autorisation eBay ; une fois accordée, un assistant vous guide pour analyser vos annonces et les associer à vos SKU.
                  </p>
                  {ebayConnections.length > 0 ? (
                    <Callout tone="neutral">
                      Une précédente connexion ({ebayConnections.map((c) => c.connection.external_username ?? "compte inconnu").join(", ")}) a été déconnectée. Reconnecter le même compte restaure ses annonces et associations.
                    </Callout>
                  ) : null}
                  {admin ? <ConnectEbayButton /> : <Callout tone="neutral">Seuls les administrateurs de l'organisation peuvent connecter eBay.</Callout>}
                </div>
              ) : (
                activeEbay.map((view) => <EbayConnectionPanel key={view.connection.id} view={view} admin={admin} writer={writer} environment={overview.ebay.environment} />)
              )}

              <details className="rounded-lg border border-border px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Autorisations demandées à eBay ({overview.ebay.scopes.length} scopes)</summary>
                <ul className="mt-2 space-y-1.5">
                  {overview.ebay.scopes.map((s) => (
                    <li key={s.scope}>
                      <code className="text-xs">{s.scope}</code>
                      <span className="block text-xs text-muted">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </CardContent>
          </Card>

          {overview.catalog
            .filter((c) => c.provider !== "ebay")
            .map((c) => (
              <Card key={c.provider}>
                <CardHeader title={c.label} description={c.description} actions={<Badge variant="neutral">Disponible prochainement</Badge>} />
                <CardContent>
                  <p className="text-sm text-muted">Ce connecteur est prévu dans l'architecture (même modèle d'annonces, de commandes et de synchronisation) mais n'est pas encore implémenté. Aucune donnée {c.label} n'est simulée.</p>
                </CardContent>
              </Card>
            ))}
        </div>

        <div className="space-y-6">
          <Section title="Annonces non associées" className="scroll-mt-20">
            <Card id="mapping">
              <CardContent className="space-y-3">
                <div className="text-3xl font-semibold tnum">{overview.unmappedCount}</div>
                <p className="text-sm text-muted">
                  {overview.unmappedCount === 0 ? "Toutes vos annonces actives sont associées à un SKU (ou ignorées)." : "Annonces actives sans SKU interne : leurs ventes n'impactent pas encore le stock."}
                </p>
                <ButtonLink href="/settings/integrations/mapping" variant={overview.unmappedCount > 0 ? "primary" : "secondary"} size="sm">
                  <Link2 className="h-4 w-4" /> Gérer les associations
                </ButtonLink>
              </CardContent>
            </Card>
          </Section>
          <Section title="Synchronisation">
            <Card>
              <CardContent className="space-y-2 text-sm text-muted">
                <p>Historique détaillé de chaque run (annonces, commandes, mouvements, erreurs).</p>
                <ButtonLink href="/settings/sync" variant="secondary" size="sm">
                  Voir l'historique
                </ButtonLink>
              </CardContent>
            </Card>
          </Section>
        </div>
      </div>
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

function EbayConnectionPanel({ view, admin, writer, environment }: { view: ConnectionView; admin: boolean; writer: boolean; environment: "production" | "sandbox" | null }) {
  const c = view.connection;
  const needsReconnect = c.status === "expired" || c.status === "pending";
  const running = runningSince(view);
  const envLabel = c.environment === "sandbox" ? "sandbox" : "production";
  const envMismatch = environment && c.environment !== environment;
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot tone={STATUS_TONE[c.status] ?? "neutral"} />
          <span>
            {c.status === "connected" || c.status === "error" ? "Connecté en tant que " : `${CONNECTION_STATUS_LABEL[c.status] ?? c.status} — `}
            <strong>{c.external_username ?? "compte inconnu"}</strong> <span className="text-muted">({envLabel})</span>
          </span>
          <Badge variant={STATUS_BADGE[c.status] ?? "neutral"}>{CONNECTION_STATUS_LABEL[c.status] ?? c.status}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsReconnect && admin ? <ConnectEbayButton label="Reconnecter eBay" /> : null}
          {admin ? <DisconnectForm connectionId={c.id} username={c.external_username} /> : null}
        </div>
      </div>

      {running ? (
        <Callout tone="info" title="Synchronisation en cours">
          Démarrée {formatRelative(running)} ({formatTime(running)}). Les résultats s'afficheront ici à la fin du run ; rechargez la page pour suivre l'avancement.
        </Callout>
      ) : null}
      {envMismatch ? (
        <Callout tone="warning">
          Cette connexion a été établie en {c.environment} alors que le serveur est configuré en {environment} : les appels échoueront. Reconnectez le compte.
        </Callout>
      ) : null}
      {c.last_error ? (
        <Callout tone={c.status === "expired" ? "danger" : "warning"} title={c.status === "expired" ? "Autorisation expirée" : "Dernière erreur"} action={needsReconnect && admin ? <ConnectEbayButton label="Reconnecter eBay" variant="secondary" /> : null}>
          {c.last_error}
          {needsReconnect && !admin ? <span className="block text-xs">Demandez à un administrateur de reconnecter eBay.</span> : null}
        </Callout>
      ) : null}

      <DescriptionList
        items={[
          {
            label: "Dernière synchronisation",
            value: c.last_sync_at ? `${formatTime(c.last_sync_at)} (${formatRelative(c.last_sync_at)}) — ${formatDateTime(c.last_sync_at)}` : "Jamais",
          },
          { label: "Dernier run", value: view.lastRun ? formatRunSummary(view.lastRun) : "Aucun run enregistré" },
          { label: "Dernière réussite", value: c.last_successful_sync_at ? formatDateTime(c.last_successful_sync_at) : "—" },
          { label: "Commandes récupérées jusqu'au", value: c.last_orders_cursor ? formatDateTime(c.last_orders_cursor) : "Pas encore importées" },
          { label: "Connecté le", value: formatDateTime(c.connected_at) },
          { label: "Autorisation valable jusqu'au", value: c.refresh_token_expires_at ? formatDateTime(c.refresh_token_expires_at) : "—" },
        ]}
      />

      <div className="flex flex-wrap items-start gap-3">
        {writer ? (
          <SyncNowForm
            connectionId={c.id}
            disabled={needsReconnect || Boolean(running)}
            disabledReason={needsReconnect ? "Reconnectez eBay avant de synchroniser." : running ? "Une synchronisation est déjà en cours pour cette connexion." : undefined}
          />
        ) : (
          <p className="text-xs text-muted">Votre rôle (lecture seule) ne permet pas de lancer une synchronisation.</p>
        )}
        <ButtonLink href={`/settings/integrations/ebay/setup?connection=${c.id}`} variant="secondary">
          Assistant de configuration
        </ButtonLink>
        {c.external_account_id ? (
          <a href={c.environment === "sandbox" ? "https://www.sandbox.ebay.com/" : "https://www.ebay.fr/mye/myebay/selling"} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 text-sm text-muted hover:text-foreground">
            Mon eBay <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Paramètres de synchronisation</div>
        {!admin ? <p className="mb-2 text-xs text-muted">Modifiables par les administrateurs uniquement.</p> : null}
        <ConnectionSettingsForm connection={c} disabled={!admin} />
      </div>
    </div>
  );
}
