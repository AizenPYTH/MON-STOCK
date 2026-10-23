"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { RateCard } from "@/domain/tools/shipping";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { deleteRateCardAction, saveRateCardAction } from "@/features/tools/actions";
import { frDate } from "@/features/tools/format";
import { rateCardFormFrom, validateRateCardForm, type RateCardForm } from "@/features/tools/rate-cards";
import { AmountField, ChoiceChips, FormBlock } from "@/features/tools/components/ui";

/** Création / modification d'une grille tarifaire (lecture seule pour le rôle « lecteur »). */
export function RateCardEditor({ card, readOnly }: { card: RateCard | null; readOnly: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<RateCardForm>(() => rateCardFormFrom(card));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof RateCardForm>(k: K, v: RateCardForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const setBand = (i: number, patch: Partial<RateCardForm["bands"][number]>) => setF((x) => ({ ...x, bands: x.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  function submit() {
    setError(null);
    // Contrôle immédiat (mêmes règles que le serveur, qui revalide).
    const v = validateRateCardForm(f, card?.verifiedAt ?? null, new Date().toISOString().slice(0, 10));
    if (!v.ok) return setError(v.error);
    startTransition(async () => {
      const r = await saveRateCardAction(card?.id ?? null, f);
      if (!r.ok) return setError(r.error);
      toast.success("Grille enregistrée.");
      router.push("/tools/shipping-rates");
    });
  }

  function remove() {
    if (!card) return;
    startTransition(async () => {
      const r = await deleteRateCardAction(card.id);
      if (!r.ok) {
        setConfirmDelete(false);
        return setError(r.error);
      }
      toast.success("Grille supprimée.");
      router.push("/tools/shipping-rates");
    });
  }

  return (
    <form
      className="max-w-4xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <FormError message={error} />
      <fieldset disabled={readOnly} className="space-y-5">
        <FormBlock>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transporteur" htmlFor="rc-carrier" required>
              <Input id="rc-carrier" value={f.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="Ex. Colissimo" maxLength={80} />
            </Field>
            <Field label="Service" htmlFor="rc-service">
              <Input id="rc-service" value={f.service} onChange={(e) => set("service", e.target.value)} placeholder="Ex. Domicile sans signature" maxLength={80} />
            </Field>
            <Field label="Pays de départ (codes ISO)" htmlFor="rc-from" hint="Vide = tous les pays.">
              <Input id="rc-from" value={f.fromText} onChange={(e) => set("fromText", e.target.value)} placeholder="FR" autoCapitalize="characters" />
            </Field>
            <Field label="Pays de destination (codes ISO)" htmlFor="rc-to" hint="Vide = tous les pays.">
              <Input id="rc-to" value={f.toText} onChange={(e) => set("toText", e.target.value)} placeholder="FR, BE" autoCapitalize="characters" />
            </Field>
            <Field label="Devise" htmlFor="rc-currency">
              <Input id="rc-currency" value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))} autoCapitalize="characters" className="w-24" />
            </Field>
          </div>
        </FormBlock>

        <FormBlock title="Tranches de poids">
          <div className="space-y-3">
            {f.bands.map((b, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <AmountField label={`Tranche ${i + 1} : jusqu'à (kg)`} value={b.maxWeightKg} onChange={(v) => setBand(i, { maxWeightKg: v })} placeholder="1" className="w-48" disabled={readOnly} />
                <AmountField label="Prix" value={b.price} onChange={(v) => setBand(i, { price: v })} suffix={f.currency} className="w-48" disabled={readOnly} />
                {f.bands.length > 1 && !readOnly ? (
                  <Button variant="ghost" onClick={() => set("bands", f.bands.filter((_, j) => j !== i))} aria-label={`Supprimer la tranche ${i + 1}`}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {!readOnly && f.bands.length < 40 ? (
            <Button variant="secondary" size="sm" onClick={() => set("bands", [...f.bands, { maxWeightKg: "", price: "" }])}>
              <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Ajouter une tranche
            </Button>
          ) : null}
        </FormBlock>

        <FormBlock title="Limites et service">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AmountField label="Plus grand côté max" value={f.maxLength} onChange={(v) => set("maxLength", v)} suffix="cm" placeholder="—" disabled={readOnly} />
            <AmountField label="L + l + h max" value={f.maxSum} onChange={(v) => set("maxSum", v)} suffix="cm" placeholder="—" disabled={readOnly} />
            <AmountField label="Diviseur du poids volumétrique" value={f.divisor} onChange={(v) => set("divisor", v)} placeholder="Ex. 5000 (vide = poids réel seul)" hint="L × l × h (cm) ÷ diviseur = poids volumétrique (kg), si votre transporteur l'applique." disabled={readOnly} />
            <div className="grid grid-cols-2 gap-3">
              <AmountField label="Délai min" value={f.dMin} onChange={(v) => set("dMin", v)} suffix="j" placeholder="—" disabled={readOnly} />
              <AmountField label="Délai max" value={f.dMax} onChange={(v) => set("dMax", v)} suffix="j" placeholder="—" disabled={readOnly} />
            </div>
          </div>
          <ChoiceChips
            label="Suivi inclus"
            options={[
              { value: true, label: "Oui" },
              { value: false, label: "Non" },
              { value: null, label: "Non précisé" },
            ]}
            value={f.tracking}
            onChange={(v) => set("tracking", v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Mode de remise / livraison" htmlFor="rc-mode">
              <Input id="rc-mode" value={f.deliveryMode} onChange={(e) => set("deliveryMode", e.target.value)} placeholder="Ex. dépôt bureau de poste, livraison domicile" maxLength={80} />
            </Field>
            <Field label="Restrictions / remarques" htmlFor="rc-notes">
              <Textarea id="rc-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex. pas de batteries lithium seules" maxLength={300} />
            </Field>
          </div>
          <ChoiceChips
            label="Tarifs vérifiés"
            options={[
              { value: true, label: "Aujourd'hui" },
              { value: false, label: card?.verifiedAt ? `Le ${frDate(card.verifiedAt)}` : "Date inconnue" },
            ]}
            value={f.verifiedToday}
            onChange={(v) => set("verifiedToday", v)}
          />
        </FormBlock>
      </fieldset>

      {readOnly ? (
        <p className="text-sm text-muted">Votre rôle (lecture seule) ne permet pas de modifier les grilles.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {card ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Supprimer la grille
            </Button>
          ) : null}
        </div>
      )}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer cette grille ?">
        <p className="text-sm">Les tarifs saisis seront définitivement supprimés.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={remove} disabled={pending} aria-busy={pending || undefined}>
            Supprimer
          </Button>
        </div>
      </Dialog>
    </form>
  );
}
