import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Callout, EmptyState } from "@/components/ui/page";
import { getSupplier, getSupplierSources, getSupplierTabCounts } from "@/features/suppliers/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { PublicWebSourceButton } from "@/features/suppliers/components/public-web-source-form";
import { FeedForm } from "@/features/suppliers/components/feed-form";
import { ConnectAccountDialog } from "@/features/suppliers/components/connect-account-dialog";
import { CheckRobotsButton, CrawlSourceButton, SyncConnectionButton, SyncFeedButton, TestConnectionButton, TestSourceButton } from "@/features/suppliers/components/source-sync-buttons";
import { deleteSourceAction, toggleFeedAction, toggleSourceAction } from "@/features/suppliers/actions";
import { ActionButtonForm } from "@/features/sourcing/components/action-button-form";
import { attestationRequired, readStoredSourceConfig, type AccountConnectorOption, type PublicAdapterOption } from "@/features/suppliers/adapter-config";
import { listSourceAdapters } from "@/integrations/sourcing/registry";
import { NO_CONNECTOR_MESSAGE, SUPPLIER_CONNECTORS } from "@/integrations/suppliers/core";
import { PARTNER_FEED_STATUS } from "@/integrations/suppliers/partner-feed";
import { formatRelative } from "@/lib/format";
import { isPendingDiscovered, readDiscoveredConfig } from "@/features/suppliers/discovered";
import { listPendingDiscoveredSources } from "@/features/suppliers/discovered-queries";
import { DiscoveredSourcesPanel } from "@/features/suppliers/components/discovered-sources";
import { CONNECTION_STATUS_LABEL, RETRIEVAL_METHOD_LABEL, SOURCE_STATUS_LABEL, SOURCE_TYPE_LABEL, SYNC_FREQUENCY_LABEL } from "@/features/sourcing/labels";

export const metadata: Metadata = { title: "Sources & flux" };

function tone(status: string): "success" | "warning" | "danger" | "neutral" {
  return status === "active" ? "success" : status === "error" ? "danger" : status === "paused" ? "warning" : "neutral";
}

function connectionTone(status: string): "success" | "warning" | "danger" | "neutral" {
  return status === "connected" ? "success" : status === "error" || status === "expired" ? "danger" : status === "pending" ? "warning" : "neutral";
}

export default async function SupplierSourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();
  const [counts, view, pendingDiscovered] = await Promise.all([getSupplierTabCounts(ctx, supplier.id), getSupplierSources(ctx, supplier.id), listPendingDiscoveredSources(ctx, { supplierId: supplier.id })]);
  const writable = canWrite(ctx.role);
  const allAdapters = listSourceAdapters();
  const publicAdapters: PublicAdapterOption[] = allAdapters.filter((a) => a.access === "public").map((a) => ({ key: a.key, label: a.label, description: a.description, method: a.method, configFields: a.configFields, capabilities: a.capabilities, verification: a.verification }));
  const connectors: AccountConnectorOption[] = SUPPLIER_CONNECTORS.map((c) => ({ key: c.key, label: c.label, description: c.description, accessConditions: c.accessConditions, credentialFields: c.credentialFields }));
  const adapterByKey = new Map(allAdapters.map((a) => [a.key, a] as const));
  const connectorByKey = new Map(connectors.map((c) => [c.key, c] as const));
  // les sources découvertes non validées sont présentées à part (« Découvertes — à valider »)
  const webSources = view.sources.filter((s) => s.source_type === "PUBLIC_WEB" && !isPendingDiscovered(s));
  const feedSources = view.sources.filter((s) => s.source_type === "CSV" || s.source_type === "XML" || s.source_type === "JSON");

  return (
    <>
      <SupplierHeader supplier={supplier} tab="sources" counts={counts} />
      <div className="space-y-6">
        <Callout tone="neutral" title="Règles d'accès">
          Les offres proviennent uniquement de données que vous êtes autorisé à utiliser : flux transmis par le fournisseur, pages / JSON publics dont les conditions d&apos;utilisation autorisent l&apos;accès automatisé (robots.txt respecté), API officielles ou compte fournisseur connecté par vous-même, saisie manuelle. Aucun contournement de connexion, de CAPTCHA ou de protection anti-bot n&apos;est effectué.
        </Callout>

        {pendingDiscovered.length > 0 ? <DiscoveredSourcesPanel sources={pendingDiscovered} writable={writable} showSupplier={false} /> : null}

        <Card>
          <CardHeader title="Flux CSV / XML / JSON" description="Fichier ou URL fourni par le fournisseur, avec mapping des colonnes." actions={writable ? <FeedForm supplierId={supplier.id} defaultCurrency={supplier.currency} /> : null} />
          <CardContent className="p-0">
            {feedSources.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">Aucun flux. <span className="font-medium">Source non connectée.</span></p>
            ) : (
              <ul className="divide-y divide-border">
                {feedSources.map((s) =>
                  s.feeds.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusDot tone={tone(f.status)} />
                          <span className="font-medium">{s.name}</span>
                          <Badge variant="outline">{SOURCE_TYPE_LABEL[s.source_type]}</Badge>
                          <Badge variant="outline">{RETRIEVAL_METHOD_LABEL.public_feed}</Badge>
                          <Badge variant={tone(f.status) === "neutral" ? "neutral" : tone(f.status)}>{SOURCE_STATUS_LABEL[f.status] ?? f.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {f.url ? <span className="break-all">{f.url}</span> : "Import manuel de fichier"} · {SYNC_FREQUENCY_LABEL[f.sync_frequency]} · dernière sync {f.last_sync_at ? formatRelative(f.last_sync_at) : "jamais"}
                          {f.last_record_count !== null ? ` · ${f.last_record_count} ligne(s)` : ""}
                        </div>
                        {f.last_error ? <div className="mt-1 text-xs text-danger">{f.last_error}</div> : null}
                      </div>
                      {writable ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <SyncFeedButton feedId={f.id} hasUrl={Boolean(f.url)} />
                          <ActionButtonForm action={toggleFeedAction} fields={{ feed_id: f.id, paused: f.status === "paused" ? "false" : "true" }} variant="ghost">
                            {f.status === "paused" ? "Réactiver" : "Mettre en pause"}
                          </ActionButtonForm>
                        </div>
                      ) : null}
                    </li>
                  )),
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Sources publiques (pages, JSON, flux)"
            description={publicAdapters.length === 0 ? "Aucun adaptateur de source public n'est disponible pour l'instant." : `Adaptateurs disponibles : ${publicAdapters.map((a) => a.label).join(", ")}. Lecture respectueuse : robots.txt, délai entre requêtes, User-Agent identifiable, aucune connexion.`}
            actions={writable ? <PublicWebSourceButton supplierId={supplier.id} adapters={publicAdapters} /> : null}
          />
          <CardContent className="p-0">
            {webSources.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">Aucune source publique déclarée. <span className="font-medium">Source non connectée.</span></p>
            ) : (
              <ul className="divide-y divide-border">
                {webSources.map((s) => {
                  const cfg = readStoredSourceConfig(s.config);
                  const adapter = cfg.adapter ? adapterByKey.get(cfg.adapter) ?? null : null;
                  const needsAttestation = adapter ? attestationRequired(adapter.method) : true;
                  const blocked = (needsAttestation && !s.automated_access_confirmed) || s.robots_allowed === false;
                  const settingsSummary = Object.entries(cfg.settings).map(([k, v]) => `${k} = ${v}`);
                  return (
                    <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusDot tone={tone(s.status)} />
                          <span className="font-medium">{s.name}</span>
                          {adapter ? (
                            <>
                              <Badge variant="outline">{adapter.label}</Badge>
                              <Badge variant="outline">{RETRIEVAL_METHOD_LABEL[adapter.method] ?? adapter.method}</Badge>
                            </>
                          ) : (
                            <Badge variant="warning">{cfg.adapter ? `Adaptateur inconnu : ${cfg.adapter}` : "Sans adaptateur (crawler JSON-LD historique)"}</Badge>
                          )}
                          <Badge variant={tone(s.status) === "neutral" ? "neutral" : tone(s.status)}>{SOURCE_STATUS_LABEL[s.status] ?? s.status}</Badge>
                          {s.robots_allowed === false ? <Badge variant="danger">Interdit par robots.txt</Badge> : s.robots_allowed === true ? <Badge variant="success">robots.txt OK</Badge> : <Badge variant="neutral">robots.txt non vérifié</Badge>}
                          {needsAttestation && !s.automated_access_confirmed ? <Badge variant="warning">Accès non attesté</Badge> : null}
                          {readDiscoveredConfig(s.config).discovered ? <Badge variant="outline">{readDiscoveredConfig(s.config).dismissed ? "Découverte — ignorée" : "Découverte — validée"}</Badge> : null}
                          {adapter && !adapter.capabilities.search ? <Badge variant="neutral">Catalogue synchronisé uniquement</Badge> : null}
                          {adapter?.verification === "fixtures" ? <Badge variant="warning">Non testé en conditions réelles</Badge> : null}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {s.base_url} · {cfg.urls.length} page(s) de catalogue{cfg.adapter ? "" : ` · parser ${cfg.parser ?? "jsonld"}`} · {SYNC_FREQUENCY_LABEL[s.sync_frequency]} · délai {s.crawl_delay_seconds ?? 2} s · dernière sync {s.last_sync_at ? formatRelative(s.last_sync_at) : "jamais"}
                        </div>
                        {settingsSummary.length > 0 ? <div className="mt-1 break-all font-mono text-[11px] text-muted">{settingsSummary.join(" · ")}</div> : null}
                        {adapter ? <div className="mt-1 text-xs text-muted">{adapter.description}</div> : null}
                        {s.access_conditions ? <div className="mt-1 text-xs text-muted">Conditions vérifiées : {s.access_conditions}</div> : null}
                        {s.last_error ? <div className="mt-1 text-xs text-danger">{s.last_error}</div> : null}
                      </div>
                      {writable ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <CheckRobotsButton sourceId={s.id} />
                          {adapter ? <TestSourceButton sourceId={s.id} disabled={blocked} reason={blocked ? "Accès non autorisé (attestation manquante ou robots.txt)" : undefined} /> : null}
                          <CrawlSourceButton sourceId={s.id} disabled={blocked} reason={blocked ? "Accès non autorisé (attestation manquante ou robots.txt)" : undefined} />
                          <ActionButtonForm action={toggleSourceAction} fields={{ source_id: s.id, paused: s.status === "paused" ? "false" : "true" }} variant="ghost">
                            {s.status === "paused" ? "Réactiver" : "Mettre en pause"}
                          </ActionButtonForm>
                          <ActionButtonForm action={deleteSourceAction} fields={{ source_id: s.id }} confirmMessage="Désactiver cette source ? Elle ne sera plus explorée." variant="ghost" buttonClassName="text-danger">
                            Désactiver
                          </ActionButtonForm>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Compte fournisseur / API"
            description={connectors.length === 0 ? "Connexion autorisée par le vendeur à son espace fournisseur ou à une API officielle." : `Connecteurs disponibles : ${connectors.map((c) => c.label).join(", ")}. Identifiants chiffrés côté serveur, jamais renvoyés au navigateur.`}
            actions={writable && connectors.length > 0 ? <ConnectAccountDialog supplierId={supplier.id} connectors={connectors} /> : null}
          />
          <CardContent className="space-y-3">
            {connectors.length === 0 ? <EmptyState className="py-8" title={NO_CONNECTOR_MESSAGE} description={`L'architecture est prête (connexions, identifiants chiffrés côté serveur, registre de connecteurs) mais aucun connecteur réel n'est encore disponible. ${PARTNER_FEED_STATUS.message}`} /> : null}
            {view.connections.length === 0 && connectors.length > 0 ? (
              <p className="text-sm text-muted">
                Aucun compte connecté. <span className="font-medium">Compte requis</span> : connectez votre propre compte fournisseur pour que ces sources soient interrogées.
              </p>
            ) : null}
            {view.connections.length > 0 ? (
              <ul className="divide-y divide-border text-sm">
                {view.connections.map((c) => {
                  const connector = connectorByKey.get(c.connector_key) ?? null;
                  const canSync = c.status === "connected";
                  return (
                    <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusDot tone={connectionTone(c.status)} />
                          <span className="font-medium">{connector?.label ?? c.connector_key}</span>
                          <Badge variant="outline" className="font-mono">{c.connector_key}</Badge>
                          <Badge variant="outline">{RETRIEVAL_METHOD_LABEL.supplier_account}</Badge>
                          <Badge variant={connectionTone(c.status)}>{c.status === "pending" ? "Non testée" : CONNECTION_STATUS_LABEL[c.status] ?? c.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {!connector ? "Connecteur indisponible : cette connexion ne peut plus être utilisée." : c.status === "pending" ? "Identifiants enregistrés mais non vérifiés : testez la connexion." : c.status === "connected" ? `Dernière synchronisation : ${c.last_sync_at ? formatRelative(c.last_sync_at) : "jamais"}` : c.status === "expired" ? "Identifiants expirés : reconnectez le compte." : c.status === "error" ? "Dernier test en erreur." : "Déconnectée."}
                        </div>
                        {c.last_error ? (
                          <div className="mt-1 text-xs text-danger">
                            {/* Sans synchronisation, l'erreur provient du test de connexion (identifiants refusés ou accès impossible) ; sinon, de la dernière synchronisation. */}
                            {c.status === "error" && !c.last_sync_at ? "Identifiants invalides ou accès refusé : " : c.status === "error" ? "Dernière synchronisation en erreur : " : ""}
                            {c.last_error}
                          </div>
                        ) : null}
                        {connector ? <div className="mt-1 text-xs text-muted">{connector.description}</div> : null}
                      </div>
                      {writable && connector ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <TestConnectionButton connectionId={c.id} />
                          <SyncConnectionButton connectionId={c.id} disabled={!canSync} reason={!canSync ? "Testez d'abord la connexion : la synchronisation exige des identifiants vérifiés." : undefined} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Saisie manuelle" description={view.manualSource ? `Source « ${view.manualSource.name} » créée automatiquement à la première saisie.` : "La source de saisie manuelle est créée automatiquement lors de la première offre saisie (onglet Produits / Offres)."} />
        </Card>
      </div>
    </>
  );
}
