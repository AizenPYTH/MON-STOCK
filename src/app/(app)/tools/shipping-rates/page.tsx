import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { formatMoneyDec, parseDecimal } from "@/domain/tools/decimal";
import { canWrite, requireOrgContext } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toUserMessage } from "@/lib/errors";
import { fetchRateCards } from "@/features/tools/queries";
import { frDate, toFrInput, transitText, trackingText } from "@/features/tools/format";
import { ToolScreen } from "@/features/tools/components/tool-page";
import type { RateCard } from "@/domain/tools/shipping";

export const metadata: Metadata = { title: "Mes grilles tarifaires" };

/** Grilles tarifaires saisies par l'organisation (ses tarifs négociés ou publics). */
export default async function RateCardsPage() {
  const ctx = await requireOrgContext();
  const writer = canWrite(ctx.role);
  let cards: RateCard[] = [];
  let error: string | null = null;
  try {
    cards = await fetchRateCards(ctx);
  } catch (e) {
    error = toUserMessage(e);
  }
  return (
    <ToolScreen
      back={{ href: "/tools/shipping", label: "Port" }}
      title="Mes grilles tarifaires"
      description="Vos tarifs par transporteur et par tranche de poids, utilisés quand aucune plateforme n'est connectée (ou en complément)."
      actions={writer ? <ButtonLink href="/tools/shipping-rates/new">Ajouter une grille</ButtonLink> : null}
    >
      {error ? (
        <Callout tone="danger" title="Grilles indisponibles">
          {error}
        </Callout>
      ) : cards.length === 0 ? (
        <EmptyState icon={<Truck aria-hidden="true" className="h-7 w-7" />} title="Aucune grille" description="Saisissez les tarifs de vos transporteurs (contrat ou grille publique) : MON STOCK n'en fournit aucun." action={writer ? <ButtonLink href="/tools/shipping-rates/new" variant="secondary">Ajouter une grille</ButtonLink> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <Table stackOnMobile caption="Grilles tarifaires de l'organisation">
            <THead>
              <tr>
                <TH scope="col">Transporteur · service</TH>
                <TH scope="col">Tranches</TH>
                <TH scope="col" align="right">
                  Dès
                </TH>
                <TH scope="col">Trajet</TH>
                <TH scope="col">Délai · suivi</TH>
                <TH scope="col">Vérifiée le</TH>
              </tr>
            </THead>
            <TBody>
              {cards.map((c) => {
                const first = c.bands[0];
                const p = first ? parseDecimal(first.price) : null;
                return (
                  <TR key={c.id}>
                    <TD primary>
                      <Link href={`/tools/shipping-rates/${c.id}` as never} className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        {c.carrier}
                        {c.service ? ` · ${c.service}` : ""}
                      </Link>
                    </TD>
                    <TD label="Tranches">
                      {c.bands.length} tranche{c.bands.length > 1 ? "s" : ""}
                      <div className="text-xs text-muted">{c.bands.map((b) => `≤ ${toFrInput(b.maxWeightKg)} kg`).join(" · ")}</div>
                    </TD>
                    <TD label="Dès" align="right" className="font-semibold text-foreground">{p?.ok ? formatMoneyDec(p.value, c.currency) : "—"}</TD>
                    <TD label="Trajet">
                      {c.fromCountries.length ? c.fromCountries.join(", ") : "tous départs"} → {c.toCountries.length ? c.toCountries.join(", ") : "toutes destinations"}
                    </TD>
                    <TD label="Délai · suivi">
                      {transitText(c)}
                      <div className="text-xs text-muted">{trackingText(c.tracking)}</div>
                    </TD>
                    <TD label="Vérifiée le" className="tnum">{frDate(c.verifiedAt) ?? <span className="text-muted">Date inconnue</span>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Indiquez la date de vérification de chaque grille : elle est affichée avec chaque prix.</p>
    </ToolScreen>
  );
}
