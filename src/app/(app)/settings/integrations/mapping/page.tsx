import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, Callout, EmptyState } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { LinkTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { listListingsForMapping } from "@/features/integrations/queries";
import { mappingParamsSchema } from "@/features/integrations/schemas";
import { MAPPING_SOURCE_LABEL, PROVIDER_LABEL, SUGGESTION_METHOD_LABEL, confidenceLabel } from "@/features/integrations/format";
import { acceptSuggestionAction, ignoreListingAction, rejectSuggestionAction, restoreListingAction, unmapListingAction } from "@/features/integrations/actions";
import { ActionForm } from "@/features/integrations/components/action-form";
import { AssignSkuDialog } from "@/features/integrations/components/assign-sku-dialog";
import { PushQuantityButton } from "@/features/integrations/components/push-quantity-button";
import { safeExternalUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Listings non associés" };

function suggestSkuCode(sku: string | null, externalId: string): string {
  const base = (sku ?? `EBAY-${externalId}`).replace(/[^A-Za-z0-9._\-/]/g, "-").slice(0, 64);
  return base || `EBAY-${externalId}`;
}

export default async function MappingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) flat[k] = val;
  }
  const parsed = mappingParamsSchema.safeParse(flat);
  const params = parsed.success ? parsed.data : mappingParamsSchema.parse({});
  const result = await listListingsForMapping(ctx, params);
  const writer = canWrite(ctx.role);

  const makeHref = (page: number) => {
    const sp = new URLSearchParams({ tab: params.tab, ...(params.q ? { q: params.q } : {}), page: String(page) });
    return `/settings/integrations/mapping?${sp.toString()}`;
  };
  const tabHref = (tab: string) => `/settings/integrations/mapping?tab=${tab}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Listings non associés"
        description="Chaque annonce marketplace doit pointer vers un SKU interne pour que ses ventes décrémentent le stock. Les suggestions ne sont jamais appliquées sans votre validation."
        actions={<ButtonLink href="/settings/integrations" variant="secondary">Retour aux intégrations</ButtonLink>}
      />
      <LinkTabs
        current={tabHref(params.tab)}
        items={[
          { href: tabHref("unmapped"), label: "Non associées", count: result.counts.unmapped },
          { href: tabHref("mapped"), label: "Associées", count: result.counts.mapped },
          { href: tabHref("ignored"), label: "Ignorées", count: result.counts.ignored },
        ]}
      />
      {!writer ? <Callout tone="neutral" className="mb-4">Votre rôle (lecture seule) ne permet pas de modifier les associations.</Callout> : null}
      {result.error ? (
        <Callout tone="danger" title="Impossible de charger les annonces" className="mb-4">
          {result.error}
        </Callout>
      ) : null}

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={params.tab} />
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Titre, SKU eBay ou n° d'annonce" className="max-w-xs" />
        <Button type="submit" variant="secondary" size="md">
          Rechercher
        </Button>
        {params.q ? (
          <Link href={tabHref(params.tab) as never} className={buttonClasses("ghost", "md")}>
            Effacer
          </Link>
        ) : null}
      </form>

      {result.rows.length === 0 ? (
        <EmptyState
          title={params.q ? "Aucune annonce ne correspond à cette recherche." : params.tab === "unmapped" ? "Aucune annonce en attente d'association." : params.tab === "mapped" ? "Aucune annonce associée pour le moment." : "Aucune annonce ignorée."}
          description={params.tab === "unmapped" && !params.q ? "Lancez une synchronisation depuis Intégrations pour importer vos annonces eBay." : undefined}
          action={params.tab === "unmapped" && !params.q ? <ButtonLink href="/settings/integrations" variant="secondary">Aller aux intégrations</ButtonLink> : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table className="min-w-[900px]">
              <THead>
                <tr>
                  <TH>Annonce</TH>
                  <TH>SKU eBay</TH>
                  <TH align="right">Prix</TH>
                  <TH align="right">Qté eBay</TH>
                  {params.tab === "mapped" ? <TH>SKU interne</TH> : <TH>Suggestions</TH>}
                  <TH>Sync</TH>
                  {writer ? <TH align="right">Actions</TH> : null}
                </tr>
              </THead>
              <TBody>
                {result.rows.map((l) => {
                  const suggestions = result.suggestionsByListing[l.id] ?? [];
                  const conn = l.connection_id ? result.connectionStatus.get(l.connection_id) : undefined;
                  const pushDisabled = !conn ? "Annonce sans connexion active." : conn.status !== "connected" && conn.status !== "error" ? "Reconnectez eBay pour envoyer des quantités." : l.status !== "active" ? "Annonce terminée." : undefined;
                  const createHref = `/stock/new?name=${encodeURIComponent(l.title.slice(0, 300))}&code=${encodeURIComponent(suggestSkuCode(l.external_sku, l.external_listing_id))}${l.price !== null ? `&sale_price=${encodeURIComponent(String(l.price))}` : ""}`;
                  return (
                    <TR key={l.id} className="align-top">
                      <TD>
                        <div className="max-w-[360px] truncate font-medium" title={l.title}>
                          {l.title || "(sans titre)"}
                        </div>
                        <div className="text-xs text-muted">
                          {PROVIDER_LABEL[l.provider] ?? l.provider} · <span className="font-mono">{l.external_listing_id}</span>
                          {l.external_variation_id ? <span className="font-mono"> / {l.external_variation_id}</span> : null}
                          {safeExternalUrl(l.listing_url) ? (
                            <a href={safeExternalUrl(l.listing_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex align-middle hover:text-foreground">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                          {l.status !== "active" ? <Badge variant="neutral" className="ml-1">{l.status}</Badge> : null}
                        </div>
                      </TD>
                      <TD className="font-mono text-xs">{l.external_sku ?? <span className="text-muted">—</span>}</TD>
                      <TD align="right">{formatMoney(l.price, l.currency ?? "EUR")}</TD>
                      <TD align="right">{formatNumber(l.quantity_available ?? l.quantity_listed)}</TD>
                      {params.tab === "mapped" ? (
                        <TD>
                          <div className="font-mono text-xs">{l.sku_code ?? "—"}</div>
                          <div className="max-w-[220px] truncate text-xs text-muted">{l.sku_product_name ?? ""}</div>
                          <div className="text-xs text-muted">
                            Stock interne : <span className="tnum">{formatNumber(l.sku_quantity_available)}</span>
                            {l.sku_quantity_available !== null && l.quantity_available !== null && Math.max(0, l.sku_quantity_available) !== l.quantity_available ? <Badge variant="warning" className="ml-1">écart</Badge> : null}
                          </div>
                          <div className="text-xs text-muted">{MAPPING_SOURCE_LABEL[l.mapping_source ?? ""] ?? l.mapping_source ?? ""}</div>
                        </TD>
                      ) : (
                        <TD>
                          {suggestions.length === 0 ? (
                            <span className="text-xs text-muted">{params.tab === "unmapped" ? "Aucune suggestion fiable" : "—"}</span>
                          ) : (
                            <ul className="space-y-1.5">
                              {suggestions.map((s) => (
                                <li key={s.id} className="rounded-md border border-border px-2 py-1.5 text-xs">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono">{s.code}</span>
                                    <Badge variant={s.confidence >= 0.8 ? "success" : "warning"}>{confidenceLabel(s.confidence)}</Badge>
                                    <span className="text-muted">{SUGGESTION_METHOD_LABEL[s.method] ?? s.method}</span>
                                  </div>
                                  <div className="truncate text-muted" title={s.reasons.join(" · ")}>
                                    {s.productName}
                                    {s.variantName ? ` — ${s.variantName}` : ""}
                                  </div>
                                  {writer ? (
                                    <div className="mt-1 flex gap-1">
                                      <ActionForm action={acceptSuggestionAction} hidden={{ suggestion_id: s.id }} inline>
                                        <Button type="submit" size="sm">
                                          Accepter
                                        </Button>
                                      </ActionForm>
                                      <ActionForm action={rejectSuggestionAction} hidden={{ suggestion_id: s.id }} inline>
                                        <Button type="submit" size="sm" variant="ghost">
                                          Rejeter
                                        </Button>
                                      </ActionForm>
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TD>
                      )}
                      <TD className="text-xs text-muted">{formatRelative(l.last_synced_at)}</TD>
                      {writer ? (
                        <TD align="right">
                          <div className="flex flex-col items-end gap-1.5">
                            {params.tab === "unmapped" ? (
                              <>
                                <AssignSkuDialog listingId={l.id} listingTitle={l.title} externalSku={l.external_sku} />
                                <Link href={createHref as never} className={buttonClasses("ghost", "sm")}>
                                  <Plus className="h-3.5 w-3.5" /> Créer un SKU depuis cette annonce
                                </Link>
                                <ActionForm action={ignoreListingAction} hidden={{ listing_id: l.id }} inline>
                                  <Button type="submit" size="sm" variant="ghost" className="text-muted">
                                    Ignorer
                                  </Button>
                                </ActionForm>
                              </>
                            ) : null}
                            {params.tab === "mapped" ? (
                              <>
                                {l.provider === "ebay" ? <PushQuantityButton listingId={l.id} listingTitle={l.title} channelQuantity={l.quantity_available} internalQuantity={l.sku_quantity_available} disabledReason={pushDisabled} /> : null}
                                <AssignSkuDialog listingId={l.id} listingTitle={l.title} externalSku={l.external_sku} label="Changer de SKU" />
                                <ActionForm action={unmapListingAction} hidden={{ listing_id: l.id }} inline>
                                  <Button type="submit" size="sm" variant="ghost" className="text-danger">
                                    Dissocier
                                  </Button>
                                </ActionForm>
                              </>
                            ) : null}
                            {params.tab === "ignored" ? (
                              <ActionForm action={restoreListingAction} hidden={{ listing_id: l.id }} inline>
                                <Button type="submit" size="sm" variant="secondary">
                                  Reprendre
                                </Button>
                              </ActionForm>
                            ) : null}
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <div className="mt-3">
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} makeHref={makeHref} />
      </div>
    </>
  );
}
