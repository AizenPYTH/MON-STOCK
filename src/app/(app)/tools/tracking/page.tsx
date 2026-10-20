import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { parcelDisplay, relativeFr } from "@/domain/tools/tracking";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState, PageHeader } from "@/components/ui/page";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fetchParcels, fetchToolsStatus } from "@/features/tools/queries";
import { carrierText, frDateTime, PARCEL_TONE_CLASS } from "@/features/tools/format";
import { BackToTools } from "@/features/tools/components/tool-page";
import type { TrackedParcel } from "@/features/tools/parcels";

export const metadata: Metadata = { title: "Suivi de colis" };

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
    <>
      <PageHeader
        eyebrow={<BackToTools />}
        title={archived ? "Colis archivés" : "Suivi de colis"}
        description="Statut, étapes et livraison estimée de vos envois."
        actions={writer ? <ButtonLink href="/tools/tracking/new">Suivre un colis</ButtonLink> : null}
      />
      <LinkTabs
        label="Colis"
        current={archived ? "/tools/tracking?archives=1" : "/tools/tracking"}
        items={[
          { href: "/tools/tracking", label: "En cours" },
          { href: "/tools/tracking?archives=1", label: "Archivés" },
        ]}
      />
      <div className="space-y-4">
        {noApi ? <Callout tone="warning">Suivi automatique pas encore activé sur le serveur : les statuts restent « Non vérifié ». Ouvrez un colis pour le suivre gratuitement sur le site du transporteur.</Callout> : null}
        {"error" in status ? <p className="text-xs text-muted">État des API de suivi indisponible ({status.error}).</p> : null}
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
            <Table>
              <caption className="sr-only">{archived ? "Colis archivés" : "Colis suivis"}</caption>
              <THead>
                <TR>
                  <TH scope="col">Statut</TH>
                  <TH scope="col">Colis</TH>
                  <TH scope="col">Transporteur</TH>
                  <TH scope="col">Livraison</TH>
                  <TH scope="col">Dernière activité</TH>
                </TR>
              </THead>
              <TBody>
                {parcels.map((p) => {
                  const d = parcelDisplay(p);
                  const tone = PARCEL_TONE_CLASS[d.tone];
                  return (
                    <TR key={p.id}>
                      <TD>
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 rounded-full", tone.dot)} />
                          <span className={cn("font-semibold", tone.text)}>{d.label}</span>
                        </span>
                      </TD>
                      <TD>
                        <Link href={`/tools/tracking/${p.id}` as never} className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {p.label || p.trackingNumber}
                        </Link>
                        {p.label ? <div className="text-xs text-muted tnum">N° {p.trackingNumber}</div> : null}
                        {p.order ? <div className="text-xs text-muted">Commande {p.order.orderNumber ?? "—"}</div> : null}
                      </TD>
                      <TD>{carrierText(p)}</TD>
                      <TD className="text-sm">{p.status === "delivered" && p.deliveredAt ? `Livré le ${frDateTime(p.deliveredAt)}` : p.estimatedDelivery ? `Estimée : ${frDateTime(p.estimatedDelivery)}` : <span className="text-muted">—</span>}</TD>
                      <TD className="text-sm text-muted">{p.lastCheckedAt ? `vérifié ${relativeFr(p.lastCheckedAt, now) ?? "—"}` : `ajouté ${relativeFr(p.createdAt, now) ?? "—"}`}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}
        <p className="text-xs text-muted">Seul le numéro de suivi (et le pays) est transmis à l'API de suivi ; aucune donnée client. MON STOCK n'est affilié à aucun transporteur.</p>
      </div>
    </>
  );
}
