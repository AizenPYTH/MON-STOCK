import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout, StatTile } from "@/components/ui/page";
import { TriangleAlert } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getSupplier, getSupplierPerformance, getSupplierTabCounts } from "@/features/suppliers/queries";
import { SupplierHeader } from "@/features/suppliers/components/supplier-header";
import { recomputeSupplierScoreAction } from "@/features/suppliers/actions";
import { ActionButtonForm } from "@/features/sourcing/components/action-button-form";
import { formatDate, formatRelative, NOT_PROVIDED } from "@/lib/format";
import { SUPPLIER_SCORE_MIN_ORDERS } from "@/domain/sourcing/scoring";

export const metadata: Metadata = { title: "Performance fournisseur" };

export default async function SupplierPerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  const { id } = await params;
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();
  const [counts, perf] = await Promise.all([getSupplierTabCounts(ctx, supplier.id), getSupplierPerformance(ctx, supplier)]);
  const writable = canWrite(ctx.role);
  const s = perf.score;
  return (
    <SupplierHeader supplier={supplier} tab="performance" counts={counts}>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Score interne" value={s.score === null ? null : s.score} unit="/100" hint={s.score === null ? `Données insuffisantes · ${SUPPLIER_SCORE_MIN_ORDERS} commandes reçues minimum` : perf.stored.score_computed_at ? `Enregistré ${formatRelative(perf.stored.score_computed_at)}` : "Non enregistré sur la fiche"} />
          <StatTile label="Délai réel moyen" value={s.averageLeadTimeDays === null ? null : s.averageLeadTimeDays} unit="j" hint={s.averageLeadTimeDays === null ? `${NOT_PROVIDED} · ${supplier.average_lead_time_days == null ? "délai annoncé non renseigné" : `annoncé ${supplier.average_lead_time_days} j`}` : supplier.average_lead_time_days == null ? "Délai annoncé non renseigné" : `annoncé ${supplier.average_lead_time_days} j`} />
          <StatTile label="Commandes reçues / annulées" value={`${perf.receivedOrders} / ${perf.cancelledOrders}`} />
          <StatTile label="Offres actives" value={perf.activeOffers} hint={perf.staleOffers > 0 ? `${perf.staleOffers} non vérifiée(s) depuis 48 h` : "toutes vérifiées sous 48 h"} tone={perf.staleOffers > 0 ? "warning" : "neutral"} />
        </div>

        <Card>
          <CardHeader
            title="Détail du score"
            description={s.reason}
            actions={
              writable ? (
                <ActionButtonForm action={recomputeSupplierScoreAction} fields={{ supplier_id: supplier.id }} showSuccess>
                  Recalculer et enregistrer
                </ActionButtonForm>
              ) : null
            }
          />
          <CardContent>
            {s.breakdown ? (
              <ul className="space-y-3.5 text-sm">
                {(
                  [
                    ["Fiabilité des délais", s.breakdown.reliability],
                    ["Taux de problèmes", s.breakdown.problems],
                    ["Historique", s.breakdown.history],
                  ] as const
                ).map(([label, c]) => (
                  <li key={label} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-bold text-foreground">{label}</span> <span className="text-xs font-medium text-muted">— {c.note}</span>
                      </span>
                      <span className="shrink-0 font-bold tnum">
                        {c.points}
                        <span className="font-medium text-ink-3">/{c.max}</span>
                      </span>
                    </div>
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-track">
                      <span className="block h-full rounded-full bg-inverse" style={{ width: `${c.max > 0 ? Math.max(0, Math.min(100, (c.points / c.max) * 100)) : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Callout tone="neutral">Aucun score n'est calculé tant que l'historique est insuffisant : le score fournisseur n'est jamais estimé sans données réelles (commandes reçues, délais constatés, problèmes).</Callout>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Délais constatés" description="Jours entre l'envoi de la commande et sa réception complète." />
          <div>
            {perf.leadTimeSamples.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">Aucune commande reçue avec une date d'envoi : pas de délai mesurable.</p>
            ) : (
              <Table className="min-w-[480px]" stackOnMobile wrapperClassName="rounded-none border-0">
                <THead>
                  <tr>
                    <TH>Commande</TH>
                    <TH>Envoyée</TH>
                    <TH>Reçue</TH>
                    <TH align="right">Délai</TH>
                  </tr>
                </THead>
                <TBody>
                  {perf.leadTimeSamples.map((x, i) => (
                    <TR key={i}>
                      <TD primary className="ms-code text-[12.5px] font-semibold">{x.reference ?? "—"}</TD>
                      <TD label="Envoyée" className="text-xs text-muted tnum">{formatDate(x.sentAt)}</TD>
                      <TD label="Reçue" className="text-xs text-muted tnum">{formatDate(x.receivedAt)}</TD>
                      <TD label="Délai" align="right" className={supplier.average_lead_time_days != null && x.days > supplier.average_lead_time_days ? "font-semibold text-warning" : "font-semibold"}>
                        {supplier.average_lead_time_days != null && x.days > supplier.average_lead_time_days ? (
                          <span className="inline-flex items-center gap-1">
                            <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
                            <span className="sr-only">Au-delà du délai annoncé : </span>
                            {x.days} j
                          </span>
                        ) : (
                          <>{x.days} j</>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </SupplierHeader>
  );
}
