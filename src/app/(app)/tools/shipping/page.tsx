import type { Metadata } from "next";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/page";
import { Segmented } from "@/components/instrument";
import { toUserMessage } from "@/lib/errors";
import { fetchRateCards, fetchToolsStatus } from "@/features/tools/queries";
import { ToolScreen } from "@/features/tools/components/tool-page";
import { ShippingComparator } from "@/features/tools/components/shipping-comparator";
import { PortGrid } from "@/features/tools/components/port-grid";
import type { RateCard } from "@/domain/tools/shipping";

export const metadata: Metadata = { title: "Comparateur de frais de port" };

/**
 * Comparateur de frais de port : devis des plateformes connectées sur le serveur MON STOCK (Edge
 * `/shipping/quotes`, état via `/tools/status`) et grilles saisies par l'organisation (RLS).
 */
export default async function ShippingToolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const view = (Array.isArray(sp.vue) ? sp.vue[0] : sp.vue) === "poids" ? "poids" : "comparateur";
  const [status, cardsResult] = await Promise.all([
    fetchToolsStatus(ctx),
    fetchRateCards(ctx).then(
      (cards) => ({ cards }),
      (e: unknown) => ({ error: toUserMessage(e) }),
    ),
  ]);
  const cards: RateCard[] = "cards" in cardsResult ? cardsResult.cards : [];
  const providers = "status" in status ? status.status.shipping : [];
  const configured = providers.filter((p) => p.configured).map((p) => ({ id: p.id, label: p.label }));
  const writer = canWrite(ctx.role);

  return (
    <ToolScreen
      title="Comparateur de frais de port"
      description="Comparez les transporteurs pour un colis : prix, délai et services."
      actions={
        <ButtonLink href="/tools/shipping-rates" variant="night">
          Gérer mes grilles tarifaires
        </ButtonLink>
      }
      toolbar={
        <Segmented
          label="Vue du comparateur"
          options={[
            { href: "/tools/shipping", label: "Comparer un colis", selected: view !== "poids" },
            { href: "/tools/shipping?vue=poids", label: "Vos tarifs par poids", selected: view === "poids" },
          ]}
        />
      }
    >
      <Card className="mb-5 space-y-2 px-5 py-4">
        <h2 className="text-sm font-semibold">Sources de tarifs</h2>
        <ul className="flex flex-wrap gap-2" aria-label="État des sources de tarifs">
          {providers.map((p) => (
            <li key={p.id}>
              <Badge variant={p.configured ? "success" : "neutral"}>
                {p.label} : {p.configured ? "connecté" : "non configuré"}
              </Badge>
            </li>
          ))}
          <li>
            <Badge variant={cards.length > 0 ? "success" : "neutral"}>Vos grilles : {"cards" in cardsResult ? cards.length : "—"}</Badge>
          </li>
        </ul>
        {"error" in status ? <p className="text-xs text-muted">État des plateformes indisponible ({status.error}). Vos grilles restent utilisables.</p> : null}
        {"status" in status && configured.length === 0 ? <p className="text-xs text-muted">Aucune plateforme d'expédition n'est configurée sur le serveur : seules vos grilles saisies sont comparées. La connexion d'une plateforme (Packlink PRO, Boxtal, Sendcloud) se fait côté serveur par un administrateur.</p> : null}
      </Card>
      {"error" in cardsResult ? (
        <Callout tone="danger" title="Grilles indisponibles" className="mb-5">
          {cardsResult.error}
        </Callout>
      ) : null}
      {view === "poids" ? <PortGrid cards={cards} canWrite={writer && "cards" in cardsResult} /> : <ShippingComparator cards={cards} configuredProviders={configured} statusAvailable={"status" in status} />}
    </ToolScreen>
  );
}
