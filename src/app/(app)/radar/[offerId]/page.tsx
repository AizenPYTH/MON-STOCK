import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { Paper, Scene, SceneHeader, StageStats } from "@/components/instrument";
import { buildRadarOffer } from "@/services/radar/radar";
import type { RadarOfferDetailDTO } from "@/features/mobile-api/contract";
import { isAppError, toUserMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { RadarOfferDetail } from "@/features/radar/components/offer-detail";

export const metadata: Metadata = { title: "Opportunité d'achat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Détail d'une opportunité en pleine page (même contenu que la colonne de droite du radar). */
export default async function RadarOfferPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { offerId } = await params;
  const sp = await searchParams;
  const rawQty = Array.isArray(sp.quantity) ? sp.quantity[0] : sp.quantity;
  const qty = rawQty && /^\d{1,6}$/.test(rawQty) && Number(rawQty) >= 1 && Number(rawQty) <= 100_000 ? Number(rawQty) : null;

  let detail: RadarOfferDetailDTO | null = null;
  let error: string | null = null;
  if (!UUID.test(offerId)) error = "Offre introuvable.";
  else {
    try {
      detail = await buildRadarOffer(ctx, offerId, qty ? [qty] : []);
    } catch (e) {
      error = isAppError(e) && e.code === "NOT_FOUND" ? "Cette offre n'est plus dans le radar (expirée, dissociée de son produit ou d'une autre organisation)." : toUserMessage(e);
    }
  }
  const back = { href: "/radar", label: "Radar d'opportunités" };
  if (!detail) {
    return (
      <>
        <Scene>
          <SceneHeader back={back} eyebrow="Opportunité d'achat" title="Offre indisponible" />
        </Scene>
        <Paper>
          <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-7 text-center">
            <p className="text-sm font-medium text-muted">{error}</p>
            <Link href="/radar" className="inline-flex h-10 items-center rounded-xl bg-mint px-4 text-sm font-extrabold text-night hover:bg-mint-pressed">
              Retour au radar
            </Link>
          </div>
        </Paper>
      </>
    );
  }

  const { item } = detail;
  return (
    <>
      <Scene>
        <SceneHeader back={back} eyebrow={`Opportunité d'achat · ${item.sku.code}`} title={item.sku.name} />
        <StageStats
          className="mt-5 max-w-[760px]"
          stats={[
            { label: "Stock", value: formatNumber(item.sku.quantityAvailable), tone: item.sku.quantityAvailable <= 0 ? "danger" : undefined, href: `/stock/${encodeURIComponent(item.sku.code)}` },
            { label: "Ventes 30 j", value: formatNumber(item.sku.units30d) },
            { label: "Offres pour ce produit", value: formatNumber(item.offersForSku) },
            { label: "Score", value: `${item.evaluation.score}/100` },
          ]}
        />
      </Scene>
      <Paper>
        <div className="mx-auto max-w-[760px]">
          <RadarOfferDetail detail={detail} writable={canWrite(ctx.role)} variant="page" peerHref={(id) => `/radar/${id}`} quantity={{ action: `/radar/${offerId}`, hidden: {}, value: qty }} />
        </div>
      </Paper>
    </>
  );
}
