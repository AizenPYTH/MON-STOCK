import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listPendingMatches } from "@/features/sourcing/queries";
import { decideMatchAction } from "@/features/sourcing/actions";
import { formatMoney } from "@/lib/format";
import { MATCH_METHOD_LABEL } from "@/domain/sourcing/matching";

export const metadata: Metadata = { title: "Correspondances à valider" };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const result = await listPendingMatches(ctx, page);
  const writable = canWrite(ctx.role);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sourcing" className="hover:text-foreground">
            Sourcing
          </Link>
        }
        title="Correspondances à valider"
        description="Suggestions d'association entre offres fournisseurs et vos SKU. Rien n'est lié sans votre confirmation (sauf identifiant exact EAN / référence)."
      />
      {result.rows.length === 0 ? (
        <EmptyState title="Aucune correspondance en attente." description="Les suggestions apparaissent après l'import d'offres (flux, pages, saisie) lorsqu'un SKU ressemble sans être certain." />
      ) : (
        <div className="space-y-3">
          <Table className="min-w-[960px]">
            <THead>
              <tr>
                <TH>Offre fournisseur</TH>
                <TH>SKU proposé</TH>
                <TH>Confiance</TH>
                <TH>Raisons</TH>
                <TH></TH>
              </tr>
            </THead>
            <TBody>
              {result.rows.map((m) => {
                const reasons = Array.isArray(m.reasons) ? (m.reasons as string[]) : [];
                const conf = Math.round(Number(m.confidence) * 100);
                return (
                  <TR key={m.id}>
                    <TD>
                      {m.offer ? (
                        <>
                          <Link href={`/sourcing/offers/${m.offer.id}` as never} className="font-medium hover:underline">
                            <span className="block max-w-[320px] truncate">{m.offer.title_original}</span>
                          </Link>
                          <div className="text-xs text-muted">
                            {m.offer.supplier?.name} · {formatMoney(Number(m.offer.original_price), m.offer.original_currency)}
                          </div>
                        </>
                      ) : (
                        <span>{m.sourcing_product?.title_display ?? "Produit normalisé"}</span>
                      )}
                    </TD>
                    <TD>
                      {m.sku ? (
                        <Link href={`/stock/${encodeURIComponent(m.sku.code)}` as never} className="hover:underline">
                          <span className="font-mono text-xs">{m.sku.code}</span> {m.sku.product?.name}
                          {m.sku.variant?.name && m.sku.variant.name !== "Standard" ? ` · ${m.sku.variant.name}` : ""}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <Badge variant={conf >= 90 ? "success" : "warning"}>{conf} %</Badge>
                      <div className="text-xs text-muted">{MATCH_METHOD_LABEL[m.method as keyof typeof MATCH_METHOD_LABEL] ?? m.method}</div>
                    </TD>
                    <TD className="max-w-[360px] text-xs text-muted">{reasons.join(" · ")}</TD>
                    <TD>
                      {writable ? (
                        <div className="flex gap-1">
                          <form action={decideMatchAction}>
                            <input type="hidden" name="match_id" value={m.id} />
                            <input type="hidden" name="decision" value="confirm" />
                            <Button type="submit" size="sm">
                              Confirmer
                            </Button>
                          </form>
                          <form action={decideMatchAction}>
                            <input type="hidden" name="match_id" value={m.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <Button type="submit" size="sm" variant="ghost">
                              Rejeter
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} makeHref={(p) => `/sourcing/matches?page=${p}`} />
        </div>
      )}
    </>
  );
}
