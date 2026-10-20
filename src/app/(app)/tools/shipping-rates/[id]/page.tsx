import type { Metadata } from "next";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { Callout, EmptyState, PageHeader } from "@/components/ui/page";
import { toUserMessage } from "@/lib/errors";
import { fetchRateCards } from "@/features/tools/queries";
import { BackToTools } from "@/features/tools/components/tool-page";
import { RateCardEditor } from "@/features/tools/components/rate-card-form";
import type { RateCard } from "@/domain/tools/shipping";

export const metadata: Metadata = { title: "Grille tarifaire" };

export default async function RateCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  let card: RateCard | null = null;
  let error: string | null = null;
  try {
    card = (await fetchRateCards(ctx)).find((c) => c.id === id) ?? null;
  } catch (e) {
    error = toUserMessage(e);
  }
  const back = <BackToTools href="/tools/shipping-rates" label="Mes grilles tarifaires" />;
  if (error)
    return (
      <>
        <PageHeader eyebrow={back} title="Grille tarifaire" />
        <Callout tone="danger" title="Grille indisponible">
          {error}
        </Callout>
      </>
    );
  if (!card)
    return (
      <>
        <PageHeader eyebrow={back} title="Grille tarifaire" />
        <EmptyState title="Grille introuvable" description="Elle a peut-être été supprimée." action={<ButtonLink href="/tools/shipping-rates" variant="secondary">Retour aux grilles</ButtonLink>} />
      </>
    );
  return (
    <>
      <PageHeader eyebrow={back} title={writer ? "Modifier la grille" : "Grille tarifaire"} description="Saisissez vos tarifs réels (contrat ou grille publique du transporteur)." />
      <RateCardEditor card={card} readOnly={!writer} />
    </>
  );
}
