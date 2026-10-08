import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/page";
import { getSupplier, getSupplierSources, getSupplierTabCounts } from "@/features/suppliers/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { PublicWebSourceButton } from "@/features/suppliers/components/public-web-source-form";
import { FeedForm } from "@/features/suppliers/components/feed-form";
import { CheckRobotsButton, ConnectAccountButton, CrawlSourceButton, SyncFeedButton } from "@/features/suppliers/components/source-sync-buttons";
import { deleteSourceAction, toggleFeedAction, toggleSourceAction } from "@/features/suppliers/actions";
import { listParsers } from "@/services/sourcing/crawler/parsers/registry";
import { listAvailableConnectors } from "@/services/sourcing/supplier-connectors";
import { NO_CONNECTOR_MESSAGE } from "@/integrations/suppliers/core";
import { PARTNER_FEED_STATUS } from "@/integrations/suppliers/partner-feed";
import { formatRelative } from "@/lib/format";
import { CONNECTION_STATUS_LABEL, SOURCE_STATUS_LABEL, SOURCE_TYPE_LABEL, SYNC_FREQUENCY_LABEL } from "@/features/sourcing/labels";

export const metadata: Metadata = { title: "Sources & flux" };

function tone(status: string): "success" | "warning" | "danger" | "neutral" {
  return status === "active" ? "success" : status === "error" ? "danger" : status === "paused" ? "warning" : "neutral";
}

export default async function SupplierSourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();
  const [counts, view] = await Promise.all([getSupplierTabCounts(ctx, supplier.id), getSupplierSources(ctx, supplier.id)]);
  const writable = canWrite(ctx.role);
  const parsers = listParsers().map((p) => ({ key: p.key, label: p.label, description: p.description }));
  const connectors = listAvailableConnectors();
  const webSources = view.sources.filter((s) => s.source_type === "PUBLIC_WEB");
  const feedSources = view.sources.filter((s) => s.source_type === "CSV" || s.source_type === "XML" || s.source_type === "JSON");

  return (
    <>
      <SupplierHeader supplier={supplier} tab="sources" counts={counts} />
      <div className="space-y-6">
        <Callout tone="neutral" title="Règles d'accès">
          Les offres proviennent uniquement de données que vous êtes autorisé à utiliser : flux transmis par le fournisseur, pages publiques dont les conditions d'utilisation autorisent l'accès automatisé (robots.txt respecté), saisie manuelle. Aucun contournement de connexion, de CAPTCHA ou de protection anti-bot n'est effectué.
        </Callout>

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
                          <form action={toggleFeedAction}>
                            <input type="hidden" name="feed_id" value={f.id} />
                            <input type="hidden" name="paused" value={f.status === "paused" ? "false" : "true"} />
                            <Button type="submit" variant="ghost" size="sm">
                              {f.status === "paused" ? "Réactiver" : "Mettre en pause"}
                            </Button>
                          </form>
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
          <CardHeader title="Pages publiques autorisées" description="Crawler respectueux : robots.txt, délai entre requêtes, User-Agent identifiable, aucune connexion." actions={writable ? <PublicWebSourceButton supplierId={supplier.id} parsers={parsers} /> : null} />
          <CardContent className="p-0">
            {webSources.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">Aucune page publique déclarée. <span className="font-medium">Source non connectée.</span></p>
            ) : (
              <ul className="divide-y divide-border">
                {webSources.map((s) => {
                  const cfg = (s.config ?? {}) as { urls?: string[]; parser?: string };
                  const urls = Array.isArray(cfg.urls) ? cfg.urls : [];
                  const blocked = !s.automated_access_confirmed || s.robots_allowed === false;
                  return (
                    <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusDot tone={tone(s.status)} />
                          <span className="font-medium">{s.name}</span>
                          <Badge variant={tone(s.status) === "neutral" ? "neutral" : tone(s.status)}>{SOURCE_STATUS_LABEL[s.status] ?? s.status}</Badge>
                          {s.robots_allowed === false ? <Badge variant="danger">Interdit par robots.txt</Badge> : s.robots_allowed === true ? <Badge variant="success">robots.txt OK</Badge> : <Badge variant="neutral">robots.txt non vérifié</Badge>}
                          {!s.automated_access_confirmed ? <Badge variant="warning">Accès non attesté</Badge> : null}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {s.base_url} · {urls.length} page(s) · parser {cfg.parser ?? "jsonld"} · {SYNC_FREQUENCY_LABEL[s.sync_frequency]} · délai {s.crawl_delay_seconds ?? 2} s · dernière sync {s.last_sync_at ? formatRelative(s.last_sync_at) : "jamais"}
                        </div>
                        {s.access_conditions ? <div className="mt-1 text-xs text-muted">Conditions vérifiées : {s.access_conditions}</div> : null}
                        {s.last_error ? <div className="mt-1 text-xs text-danger">{s.last_error}</div> : null}
                      </div>
                      {writable ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <CheckRobotsButton sourceId={s.id} />
                          <CrawlSourceButton sourceId={s.id} disabled={blocked} reason={blocked ? "Accès non autorisé (attestation manquante ou robots.txt)" : undefined} />
                          <form action={toggleSourceAction}>
                            <input type="hidden" name="source_id" value={s.id} />
                            <input type="hidden" name="paused" value={s.status === "paused" ? "false" : "true"} />
                            <Button type="submit" variant="ghost" size="sm">
                              {s.status === "paused" ? "Réactiver" : "Mettre en pause"}
                            </Button>
                          </form>
                          <form action={deleteSourceAction}>
                            <input type="hidden" name="source_id" value={s.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-danger">
                              Désactiver
                            </Button>
                          </form>
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
          <CardHeader title="Compte fournisseur / API" description="Connexion autorisée par le vendeur à son espace fournisseur ou à une API officielle." />
          <CardContent className="space-y-3">
            {connectors.length === 0 ? (
              <EmptyState className="py-8" title={NO_CONNECTOR_MESSAGE} description={`L'architecture est prête (connexions, identifiants chiffrés côté serveur, registre de connecteurs) mais aucun connecteur réel n'est encore disponible. ${PARTNER_FEED_STATUS.message}`} action={writable ? <ConnectAccountButton /> : undefined} />
            ) : null}
            {view.connections.length > 0 ? (
              <ul className="divide-y divide-border text-sm">
                {view.connections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span>{c.connector_key}</span>
                    <Badge variant={c.status === "connected" ? "success" : "neutral"}>{CONNECTION_STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </li>
                ))}
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
