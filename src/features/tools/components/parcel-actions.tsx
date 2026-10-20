"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { CARRIER_LABEL, type CarrierCode } from "@/domain/tools/tracking";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { deleteParcelAction, refreshParcelAction, updateParcelAction } from "@/features/tools/actions";
import { ChoiceChips } from "@/features/tools/components/ui";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

/** Actualiser (API de suivi via le serveur MON STOCK) et « Modifier » : nom, transporteur, commande, archivage, suppression. */
export function ParcelActions({ parcel }: { parcel: { id: string; label: string; carrierCode: CarrierCode | null; carrierSource: "auto" | "manual"; orderId: string | null; orderText: string | null; archived: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [labelDraft, setLabelDraft] = useState(parcel.label);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(task);
  }

  const refresh = () =>
    run(async () => {
      const r = await refreshParcelAction(parcel.id);
      if (!r.ok) return toast.error(r.error);
      if (r.data.checked) toast.success("À jour · il y a quelques secondes");
      else toast.error(r.data.message ?? "Suivi indisponible.");
      router.refresh();
    });

  const update = (patch: Parameters<typeof updateParcelAction>[1], after?: () => void) =>
    run(async () => {
      const r = await updateParcelAction(parcel.id, patch);
      if (!r.ok) return setError(r.error);
      toast.success(r.data.message ?? "Colis modifié.");
      after?.();
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={refresh} disabled={pending || parcel.archived} aria-busy={pending || undefined} title={parcel.archived ? "Colis archivé : désarchivez-le pour l'actualiser." : undefined}>
          <RefreshCw aria-hidden="true" className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Actualiser
        </Button>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Modifier
        </Button>
      </div>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Modifier le colis">
        <div className="space-y-5">
          <FormError message={error} />
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (labelDraft !== parcel.label) update({ label: labelDraft });
            }}
          >
            <Field label="Nom" htmlFor="parcel-label" className="flex-1">
              <Input id="parcel-label" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value.slice(0, 120))} maxLength={120} />
            </Field>
            <Button type="submit" variant="secondary" disabled={pending || labelDraft === parcel.label}>
              Enregistrer
            </Button>
          </form>
          <ChoiceChips<CarrierCode | "none">
            label={`Transporteur : ${parcel.carrierCode ? CARRIER_LABEL[parcel.carrierCode] : "automatique"} ${parcel.carrierSource === "manual" ? "(choisi)" : "(détecté)"}`}
            options={CARRIERS.map((c) => ({ value: c, label: CARRIER_LABEL[c] }))}
            value={parcel.carrierCode ?? "none"}
            onChange={(v) => {
              if (v !== "none" && v !== parcel.carrierCode) update({ carrierCode: v });
            }}
          />
          <p className="-mt-3 text-xs text-muted">Changer de transporteur relance le suivi.</p>
          {parcel.orderText ? <p className="text-sm">Commande associée : {parcel.orderText}</p> : null}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {parcel.orderId ? (
              <Button variant="ghost" onClick={() => update({ orderId: null })} disabled={pending}>
                Dissocier la commande
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() =>
                update({ archived: !parcel.archived }, () => {
                  setEditing(false);
                  if (!parcel.archived) router.push("/tools/tracking");
                })
              }
              disabled={pending}
            >
              {parcel.archived ? "Désarchiver" : "Archiver"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setConfirmDelete(true);
              }}
            >
              Supprimer
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer ce suivi ?">
        <p className="text-sm">Le colis et son historique seront supprimés de MON STOCK.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() =>
              run(async () => {
                const r = await deleteParcelAction(parcel.id);
                if (!r.ok) {
                  setConfirmDelete(false);
                  return toast.error(r.error);
                }
                toast.success("Suivi supprimé.");
                router.push("/tools/tracking");
              })
            }
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </>
  );
}
