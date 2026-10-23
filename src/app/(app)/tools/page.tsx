import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { findTool } from "@/domain/tools/catalog";
import type { RateCard } from "@/domain/tools/shipping";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { MonoTitle, Paper, Scene, SceneHeader } from "@/components/instrument";
import { toUserMessage } from "@/lib/errors";
import { fetchCostDefaults, fetchFxRates, fetchParcels, fetchRateCards } from "@/features/tools/queries";
import type { TrackedParcel } from "@/features/tools/parcels";
import { CurrencyHubCard, EbayHubCard, MarginHubCard, ShippingHubCard, TrackingHubCard, VatHubCard } from "@/features/tools/components/hub-cards";
import { internalRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Outils" };

const MORE: { id: string; glyph: string; route: string; label?: string; desc?: string }[] = [
  { id: "selling-price", glyph: "€", route: "/tools/selling-price" },
  { id: "discount", glyph: "−%", route: "/tools/discount" },
  { id: "rate-cards", glyph: "kg", route: "/tools/shipping-rates", label: "Mes grilles tarifaires", desc: "Vos tarifs par transporteur et tranche de poids." },
  { id: "supplier-prices", glyph: "≈", route: "/radar" },
];

/**
 * « Outils » (v5) : calculateurs côte à côte, résultats en direct pendant la saisie. Données
 * réelles seulement : frais du canal eBay, taux BCE importés, grilles saisies, colis suivis.
 * Aucun historique des calculs n'est enregistré côté serveur : il n'est donc pas affiché.
 */
export default async function ToolsPage() {
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  const [defaults, fx, cards, parcels] = await Promise.all([
    fetchCostDefaults(ctx),
    fetchFxRates(ctx),
    fetchRateCards(ctx).then(
      (c): { cards: RateCard[]; error: null } => ({ cards: c, error: null }),
      (e: unknown) => ({ cards: [] as RateCard[], error: toUserMessage(e) }),
    ),
    fetchParcels(ctx, false).then(
      (p): { parcels: TrackedParcel[]; error: null } => ({ parcels: p.slice(0, 3), error: null }),
      (e: unknown) => ({ parcels: [] as TrackedParcel[], error: toUserMessage(e) }),
    ),
  ]);
  const now = new Date().toISOString();

  return (
    <>
      <Scene>
        <SceneHeader eyebrow="Outils du revendeur" title="Outils" description="Résultats en direct pendant la saisie. Les valeurs saisies sont marquées « saisi », les calculées « ≈ » quand elles sont estimées." />
      </Scene>
      <Paper className="lg:pt-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="grid min-w-0 flex-[1_1_720px] grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] items-start gap-3">
            <VatHubCard />
            <MarginHubCard />
            <EbayHubCard channel={defaults?.ebayChannel ?? null} />
            <CurrencyHubCard rates={"rates" in fx ? fx.rates : []} error={"error" in fx ? fx.error : null} now={now} />
            <ShippingHubCard cards={cards.cards} error={cards.error} canWrite={writer} />
            <TrackingHubCard parcels={parcels.parcels} error={parcels.error} canWrite={writer} />
          </div>
          <aside aria-label="Plus d'outils" className="flex min-w-[min(280px,100%)] flex-[0_1_320px] flex-col gap-2.5">
            <MonoTitle title="Plus d'outils" as="h2" className="leading-[22px]" />
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
              {MORE.map((m, i) => {
                const tool = findTool(m.id);
                const label = m.label ?? tool?.title ?? m.id;
                const desc = m.desc ?? tool?.description ?? "";
                return (
                  <li key={m.id} className={i > 0 ? "border-t border-line-soft" : undefined}>
                    <Link href={internalRoute(m.route)} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 hover:bg-line-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-line-soft text-[13px] font-extrabold">
                        {m.glyph}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[13.5px] font-bold leading-[19px]">{label}</span>
                        <span className="text-xs font-semibold leading-4 text-ink-3">{desc}</span>
                      </span>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold leading-[17px] text-ink-3">Calculs exacts faits dans votre navigateur ; rien n&apos;est enregistré. Seuls les colis suivis et les grilles tarifaires sont conservés.</p>
          </aside>
        </div>
      </Paper>
    </>
  );
}
