import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout, Stat } from "@/components/ui/page";
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
    <>
      <SupplierHeader supplier={supplier} tab="performance" counts={counts} />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Score interne" value={s.score === null ? "Données insuffisantes" : `${s.score}/100`} hint={s.score === null ? `${SUPPLIER_SCORE_MIN_ORDERS} commandes reçues minimum` : perf.stored.score_computed_at ? `Enregistré ${formatRelative(perf.stored.score_computed_at)}` : "Non enregistré sur la fiche"} />
          <Stat label="Délai réel moyen" value={s.averageLeadTimeDays === null ? NOT_PROVIDED : `${s.averageLeadTimeDays} j`} hint={supplier.average_lead_time_days === null ? "Délai annoncé non renseigné" : `annoncé ${supplier.average_lead_time_days} j`} />
          <Stat label="Commandes reçues / annulées" value={`${perf.receivedOrders} / ${perf.cancelledOrders}`} />
          <Stat label="Offres actives" value={perf.activeOffers} hint={perf.staleOffers > 0 ? `${perf.staleOffers} non vérifiée(s) depuis 48 h` : "toutes vérifiées sous 48 h"} tone={perf.staleOffers > 0 ? "warning" : undefined} />
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
              <ul className="space-y-2 text-sm">
                {(
                  [
                    ["Fiabilité des délais", s.breakdown.reliability],
                    ["Taux de problèmes", s.breakdown.problems],
                    ["Historique", s.breakdown.history],
                  ] as const
                ).map(([label, c]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span>
                      {label} <span className="text-xs text-muted">— {c.note}</span>
                    </span>
                    <span className="tnum font-medium">
                      {c.points}/{c.max}
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
          <CardContent className="p-0">
            {perf.leadTimeSamples.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted">Aucune commande reçue avec une date d'envoi : pas de délai mesurable.</p>
            ) : (
              <Table className="min-w-[480px]">
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
                      <TD>{x.reference ?? "—"}</TD>
                      <TD className="text-xs text-muted">{formatDate(x.sentAt)}</TD>
                      <TD className="text-xs text-muted">{formatDate(x.receivedAt)}</TD>
                      <TD align="right" className={supplier.average_lead_time_days !== null && x.days > supplier.average_lead_time_days ? "text-amber-700" : undefined}>
                        {x.days} j
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
