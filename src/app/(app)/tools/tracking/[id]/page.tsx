import type { Metadata } from "next";
import { carrierTrackingUrl, FINAL_STATUSES, parcelDisplay, TRACKING_STATUS_LABEL, universalTrackingUrl } from "@/domain/tools/tracking";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/page";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fetchParcel } from "@/features/tools/queries";
import { carrierText, frDateTime, PARCEL_TONE_CLASS, trackingSourceText } from "@/features/tools/format";
import type { TrackedParcel } from "@/features/tools/parcels";
import { ToolScreen } from "@/features/tools/components/tool-page";
import { CopyButton } from "@/features/tools/components/ui";
import { ParcelActions } from "@/features/tools/components/parcel-actions";

export const metadata: Metadata = { title: "Colis" };

function Step({ dot, title, sub }: { dot: string; title: string; sub?: string | null }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden="true" className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full", dot)} />
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {sub ? <p className="text-sm text-muted">{sub}</p> : null}
      </div>
    </li>
  );
}

/**
 * Détail d'un colis : statut renvoyé par l'API de suivi, étapes transmises par le transporteur,
 * « Actualiser » (serveur MON STOCK). Sans API (« Non vérifié ») : site public du transporteur.
 */
export default async function ParcelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  const back = { href: "/tools/tracking", label: "Colis" };
  let p: TrackedParcel | null = null;
  let error: string | null = null;
  try {
    p = await fetchParcel(ctx, id);
  } catch (e) {
    error = toUserMessage(e);
  }
  if (error || !p)
    return (
      <ToolScreen back={back} title="Colis">
        {error ? (
          <Callout tone="danger" title="Colis indisponible">
            {error}
          </Callout>
        ) : (
          <EmptyState title="Colis introuvable" description="Il a peut-être été supprimé." action={<ButtonLink href="/tools/tracking" variant="secondary">Retour aux colis</ButtonLink>} />
        )}
      </ToolScreen>
    );

  const final = FINAL_STATUSES.has(p.status);
  const d = parcelDisplay(p);
  const tone = PARCEL_TONE_CLASS[d.tone];
  const site = carrierTrackingUrl(p.carrierCode, p.trackingNumber);
  const siteUrl = p.providerUrl ?? site.url;
  const meta = [p.lastCheckedAt ? `vérifié ${frDateTime(p.lastCheckedAt)} UTC` : null, p.provider ? `source ${trackingSourceText(p.provider)}` : null, !final && p.nextCheckAt ? `prochaine ${frDateTime(p.nextCheckAt)} UTC` : null].filter(Boolean).join(" · ");
  const orderText = p.order ? `${p.order.orderNumber ?? "—"}${p.order.buyer ? ` · ${p.order.buyer}` : ""}` : null;

  return (
    <ToolScreen
      back={back}
      eyebrow={`Colis · ${carrierText(p)}`}
      title={
        <span className="inline-flex items-center gap-3">
          <span aria-hidden="true" className={cn("inline-block h-3 w-3 rounded-full", d.tone === "progress" ? "bg-on-night" : tone.dot)} />
          <span>{d.label}</span>
        </span>
      }
      description={`${p.label || p.trackingNumber} · ${carrierText(p)}${p.archivedAt ? " · archivé" : ""}`}
      actions={
        <>
          <ButtonLink href={siteUrl} variant={d.verified ? "night" : "primary"}>
            Site du transporteur
          </ButtonLink>
          {writer ? <ParcelActions parcel={{ id: p.id, label: p.label, carrierCode: p.carrierCode, carrierSource: p.carrierSource, orderId: p.orderId, orderText, archived: p.archivedAt !== null }} /> : null}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card className="px-5 py-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Étapes</h2>
          <ol>
            {!d.verified ? (
              <Step dot="border-2 border-amber bg-transparent" title="Statut non vérifié" sub={p.lastError ? "Pas de suivi automatique pour ce colis pour le moment" : "Pas de suivi automatique pour ce transporteur"} />
            ) : p.events.length === 0 ? (
              <Step dot={tone.dot} title={d.label} sub="Aucune étape transmise par le transporteur pour le moment" />
            ) : (
              p.events.map((e, i) => <Step key={`${e.at}-${i}`} dot={i === 0 ? tone.dot : "bg-night"} title={e.label} sub={[frDateTime(e.at), e.location].filter(Boolean).join(" · ") || null} />)
            )}
          </ol>
        </Card>
        <div className="space-y-4">
          <Card className="space-y-3 px-5 py-4 text-sm">
            {d.verified ? <p>{TRACKING_STATUS_LABEL[p.status]}</p> : null}
            {p.statusDetail && d.verified ? <p className="text-muted">{p.statusDetail}</p> : null}
            {p.estimatedDelivery && p.status !== "delivered" ? <p>Livraison estimée par le transporteur : {frDateTime(p.estimatedDelivery)}</p> : null}
            {p.status === "delivered" && p.deliveredAt ? <p>Livré le {frDateTime(p.deliveredAt)}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium tnum">N° {p.trackingNumber}</span>
              <CopyButton text={p.trackingNumber} />
            </div>
            {p.destinationCountry ? <p className="text-muted">Destination : {p.destinationCountry}</p> : null}
            {orderText ? <p className="text-muted">Commande associée : {orderText}</p> : null}
            {meta ? <p className="text-xs text-muted">{meta}</p> : null}
            {!site.universal ? (
              <ButtonLink href={universalTrackingUrl(p.trackingNumber)} variant="ghost" size="sm">
                Vérifier aussi sur 17TRACK
              </ButtonLink>
            ) : null}
          </Card>
          {p.lastError && d.verified ? <Callout tone="warning">{p.lastError}</Callout> : null}
          <p className="text-xs text-muted">Heures telles que communiquées par le transporteur. Sites publics et gratuits ouverts dans un nouvel onglet ; MON STOCK n'est affilié à aucun transporteur.</p>
        </div>
      </div>
    </ToolScreen>
  );
}
