import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { parcelDisplay, relativeFr } from "@/domain/tools/tracking";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/page";
import { Segmented } from "@/components/instrument";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fetchParcels, fetchToolsStatus } from "@/features/tools/queries";
import { carrierText, frDateTime } from "@/features/tools/format";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ToolScreen } from "@/features/tools/components/tool-page";
import type { TrackedParcel } from "@/features/tools/parcels";

export const metadata: Metadata = { title: "Suivi de colis" };

const PARCEL_STATUS_TONE: Record<string, StatusTone> = { problem: "danger", progress: "info", unverified: "warning", delivered: "success", waiting: "pending" };

/**
 * Colis suivis : statut renvoyé par l'API de suivi (« Non vérifié » tant qu'aucune API n'a
 * répondu), transporteur et dernière vérification. Colis archivés : `?archives=1`.
 */
export default async function TrackingListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const archived = (Array.isArray(sp.archives) ? sp.archives[0] : sp.archives) === "1";
  const writer = canWrite(ctx.role);
  const [status, list] = await Promise.all([
    fetchToolsStatus(ctx),
    fetchParcels(ctx, archived).then(
      (parcels) => ({ parcels }),
      (e: unknown) => ({ error: toUserMessage(e) }),
    ),
  ]);
  const noApi = "status" in status && !status.status.tracking.laposte && !status.status.tracking.ship24 && !status.status.tracking.dhl;
  const now = new Date();
  const parcels: TrackedParcel[] = "parcels" in list ? list.parcels : [];

  return (
    <ToolScreen
      title={archived ? "Colis archivés" : "Suivi de colis"}
      description="Statut, étapes et livraison estimée de vos envois."
      actions={writer ? <ButtonLink href="/tools/tracking/new">Suivre un colis</ButtonLink> : null}
      toolbar={
        <Segmented
          label="Colis"
          options={[
            { href: "/tools/tracking", label: "En cours", selected: !archived },
            { href: "/tools/tracking?archives=1", label: "Archivés", selected: archived },
          ]}
        />
      }
    >
      <div className="space-y-4">
        {noApi ? <Callout tone="warning">Suivi automatique pas encore activé sur le serveur : les statuts restent « Non vérifié ». Ouvrez un colis pour le suivre gratuitement sur le site du transporteur.</Callout> : null}
        {"error" in status ? <Callout tone="neutral">État des API de suivi indisponible ({status.error}).</Callout> : null}
        {"error" in list ? (
          <Callout tone="danger" title="Colis indisponibles">
            {list.error}
          </Callout>
        ) : parcels.length === 0 ? (
          <EmptyState
            icon={<PackageSearch aria-hidden="true" className="h-7 w-7" />}
            title={archived ? "Aucun colis archivé" : "Aucun colis suivi"}
            description="Ajoutez un numéro de suivi : le transporteur est détecté quand c'est possible."
            action={writer && !archived ? <ButtonLink href="/tools/tracking/new" variant="secondary">Suivre un colis</ButtonLink> : undefined}
          />
        ) : (
          <Card className="overflow-hidden">
            <Table stackOnMobile caption={archived ? "Colis archivés" : "Colis suivis"}>
              <THead>
                <tr>
                  <TH scope="col">Colis</TH>
                  <TH scope="col">Statut</TH>
                  <TH scope="col">Transporteur</TH>
                  <TH scope="col">Livraison</TH>
                  <TH scope="col">Dernière activité</TH>
                </tr>
              </THead>
              <TBody>
                {parcels.map((p) => {
                  const d = parcelDisplay(p);
                  return (
                    <TR key={p.id}>
                      <TD primary>
                        <Link href={`/tools/tracking/${p.id}`} className={cn("font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", !p.label && "ms-code text-[13px]")}>
                          {p.label || p.trackingNumber}
                        </Link>
                        {p.label ? <div className="ms-code text-[11.5px] font-normal text-ink-3">N° {p.trackingNumber}</div> : null}
                        {p.order ? <div className="text-xs font-normal text-muted">Commande {p.order.orderNumber ?? "—"}</div> : null}
                      </TD>
                      <TD label="Statut">
                        <StatusBadge tone={PARCEL_STATUS_TONE[d.tone] ?? "neutral"}>{d.label}</StatusBadge>
                      </TD>
                      <TD label="Transporteur">{carrierText(p)}</TD>
                      <TD label="Livraison" className="text-sm tnum">{p.status === "delivered" && p.deliveredAt ? `Livré le ${frDateTime(p.deliveredAt)}` : p.estimatedDelivery ? `Estimée : ${frDateTime(p.estimatedDelivery)}` : <span className="text-muted">—</span>}</TD>
                      <TD label="Dernière activité" className="text-sm text-muted">{p.lastCheckedAt ? `vérifié ${relativeFr(p.lastCheckedAt, now) ?? "—"}` : `ajouté ${relativeFr(p.createdAt, now) ?? "—"}`}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}
        <p className="text-xs text-muted">Seul le numéro de suivi (et le pays) est transmis à l'API de suivi ; aucune donnée client. MON STOCK n'est affilié à aucun transporteur.</p>
      </div>
    </ToolScreen>
  );
}
