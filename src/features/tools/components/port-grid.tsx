"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDec } from "@/domain/tools/decimal";
import { PORT_DEFAULT_CARRIERS, PORT_WEIGHTS, portRows, toEntry } from "@/domain/tools/quick-calc";
import type { RateCard } from "@/domain/tools/shipping";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { savePortPriceAction } from "@/features/tools/actions";
import { AmountField, ChoiceChips } from "@/features/tools/components/ui";

/**
 * « Port » (version simple) : un poids en onglet, une ligne par transporteur avec VOTRE prix
 * (grilles enregistrées), le moins cher marqué. Modifier un prix l'enregistre dans la grille.
 * Aucun tarif inventé : sans prix, « — ».
 */
export function PortGrid({ cards, canWrite }: { cards: RateCard[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState(String(PORT_WEIGHTS[1]!.kg));
  const [editing, setEditing] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const weight = Number(tab);
  const rows = cards.length ? portRows(cards, weight) : PORT_DEFAULT_CARRIERS.map((c) => ({ id: `new:${c}`, label: c, price: null, cheapest: false }));
  const weightLabel = PORT_WEIGHTS.find((w) => w.kg === weight)?.label ?? `${weight} kg`;

  function save(id: string) {
    setError(null);
    const cardId = id.startsWith("new:") ? null : id;
    const carrier = id.startsWith("new:") ? id.slice(4) : null;
    startTransition(async () => {
      const r = await savePortPriceAction({ cardId, carrier, weightKg: weight, price: entry });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Prix enregistré");
      setEditing(null);
      setEntry("");
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <ChoiceChips
        label="Poids du colis"
        size="lg"
        options={PORT_WEIGHTS.map((w) => ({ value: String(w.kg), label: w.label, a11y: `colis de ${w.label}` }))}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setEditing(null);
          setEntry("");
          setError(null);
        }}
      />
      <FormError message={error} />
      <Card className="overflow-hidden">
        <Table className="min-w-[480px]">
          <caption className="sr-only">Vos tarifs pour un colis de {weightLabel}</caption>
          <THead>
            <TR>
              <TH scope="col">Transporteur</TH>
              <TH scope="col" align="right">
                Votre prix ({weightLabel})
              </TH>
              {canWrite ? (
                <TH scope="col" align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              ) : null}
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const on = editing === r.id;
              return (
                <TR key={r.id}>
                  <TD>
                    <span className="font-medium">{r.label}</span>
                    {!on && r.cheapest ? (
                      <Badge variant="success" className="ml-2">
                        moins cher
                      </Badge>
                    ) : null}
                  </TD>
                  <TD align="right">
                    {on ? (
                      <form
                        className="ml-auto flex max-w-xs items-end justify-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          save(r.id);
                        }}
                      >
                        <AmountField label={`Prix ${r.label}, ${weightLabel}`} value={entry} onChange={setEntry} suffix="€" autoFocus className="w-36 text-left" />
                        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
                          {pending ? "…" : "OK"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Annuler
                        </Button>
                      </form>
                    ) : (
                      <span className="font-semibold">{r.price ? `${formatDec(r.price)} €` : "—"}</span>
                    )}
                  </TD>
                  {canWrite ? (
                    <TD align="right">
                      {on ? null : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(r.id);
                            setEntry(toEntry(r.price));
                            setError(null);
                          }}
                        >
                          Modifier<span className="sr-only"> le prix {r.label}</span>
                        </Button>
                      )}
                    </TD>
                  ) : null}
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <p className="text-xs text-muted">{cards.length ? "Vos tarifs · modifiez un prix pour l'enregistrer dans la grille du transporteur." : canWrite ? "Saisissez vos tarifs : choisissez un transporteur, tapez le prix, OK." : "Aucun tarif saisi pour le moment."}</p>
    </div>
  );
}
