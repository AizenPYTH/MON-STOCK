"use client";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ADJUST_MODE_LABEL, ADJUST_MODES, ADJUST_REASON_LABEL, planAdjustment, reasonsFor, type AdjustMode, type AdjustReason } from "@/features/stock-web/adjust.pure";
import { recordMovement, type MoveResult } from "@/features/stock-web/components/movements-client";

export interface AdjustTarget {
  skuId: string;
  code: string;
  label: string;
  /** stock en main (ce que les mouvements modifient) */
  onHand: number;
  available: number;
}

/**
 * Dialogue « Ajuster le stock » : Ajouter · Retirer · Définir, quantité, motif. Chaque référence
 * reçoit un mouvement daté via l'action existante (adjustStockAction) ; rien n'est simulé.
 */
export function AdjustDialog({ open, onClose, targets, onDone }: { open: boolean; onClose: () => void; targets: AdjustTarget[]; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [mode, setMode] = useState<AdjustMode>("add");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<AdjustReason>("receipt");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Array<Extract<MoveResult, { ok: false }>>>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const single = targets.length === 1 ? targets[0] : null;
  const reasons = reasonsFor(mode);
  const effectiveReason = reasons.includes(reason) ? reason : reasons[0]!;

  const pickMode = (m: AdjustMode) => {
    setMode(m);
    setFormError(null);
    if (!reasonsFor(m).includes(reason)) setReason(reasonsFor(m)[0]!);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrors([]);
    const n = Number(qty);
    const plans = targets.map((t) => ({ t, plan: planAdjustment({ mode, quantity: n, reason: effectiveReason, onHand: t.onHand }) }));
    const invalid = plans.find((p) => p.plan.kind === "error");
    if (invalid && invalid.plan.kind === "error") return setFormError(invalid.plan.message);
    const moves = plans.filter((p) => p.plan.kind === "move");
    if (moves.length === 0) return setFormError(single ? "Le stock en main est déjà à cette quantité : aucun mouvement à créer." : "Toutes les références sont déjà à cette quantité.");
    start(async () => {
      const results: MoveResult[] = [];
      // Un mouvement à la fois : chaque référence garde son propre résultat (refus = message clair).
      for (const { t, plan } of moves) if (plan.kind === "move") results.push(await recordMovement(t, plan, note.trim() || undefined));
      const failed = results.filter((r): r is Extract<MoveResult, { ok: false }> => !r.ok);
      const done = results.length - failed.length;
      if (done > 0) router.refresh();
      if (failed.length === 0) {
        const after = results.length === 1 && results[0]?.ok ? results[0].quantityAfter : null;
        toast.success(done === 1 ? (after === null ? "Mouvement de stock enregistré." : `Mouvement enregistré : stock en main ${after}.`) : `${done} mouvements de stock enregistrés.`);
        setQty("1");
        setNote("");
        onDone?.();
        onClose();
      } else {
        setErrors(failed);
        if (done > 0) toast.success(`${done} mouvement(s) enregistré(s) ; ${failed.length} refusé(s).`);
      }
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Ajuster le stock" className="max-w-[480px] rounded-3xl">
      <form onSubmit={submit} className="space-y-3.5">
        <p className="text-sm font-medium text-muted">
          {single ? (
            <>
              {single.label} · <span className="ms-code text-[12px]">{single.code}</span> · en main <span className="font-bold text-foreground tnum">{single.onHand}</span>, disponible <span className="font-bold text-foreground tnum">{single.available}</span>
            </>
          ) : (
            `${targets.length} références sélectionnées : chacune reçoit son propre mouvement.`
          )}
        </p>
        <div role="radiogroup" aria-label="Type d'ajustement" className="flex rounded-xl bg-track p-[3px]">
          {ADJUST_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => pickMode(m)}
              className={cn("min-h-[38px] flex-1 rounded-[10px] text-[13px] font-bold transition-colors", mode === m ? "bg-surface text-foreground shadow-raised" : "text-muted hover:text-foreground")}
            >
              {ADJUST_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-2.5">
          <label className="flex flex-col gap-1.5" htmlFor={`${id}-qty`}>
            <span className="text-[13px] font-semibold text-muted">{mode === "set" ? "Nouveau stock en main" : "Quantité"}</span>
            <Input id={`${id}-qty`} type="number" inputMode="numeric" min={mode === "set" ? 0 : 1} max={1000000} step={1} required value={qty} onChange={(e) => setQty(e.target.value)} className="h-12 text-lg font-extrabold tnum" />
          </label>
          <label className="flex flex-col gap-1.5" htmlFor={`${id}-reason`}>
            <span className="text-[13px] font-semibold text-muted">Motif</span>
            <Select id={`${id}-reason`} value={effectiveReason} onChange={(e) => setReason(e.target.value as AdjustReason)} className="h-12 text-[15px]">
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {ADJUST_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5" htmlFor={`${id}-note`}>
          <span className="text-[13px] font-semibold text-muted">Note (facultatif)</span>
          <Input id={`${id}-note`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bon de livraison, inventaire, casse…" />
        </label>
        <p className="text-[12.5px] font-semibold leading-[17px] text-ink-3">
          {mode === "set" ? "« Définir » crée l'écart nécessaire (entrée ou sortie) par rapport au stock en main actuel. " : ""}
          Chaque référence reçoit un mouvement daté dans son historique (non supprimable). Le stock ne passe jamais sous zéro.
        </p>
        {formError ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-ink">
            {formError}
          </p>
        ) : null}
        {errors.length > 0 ? (
          <ul role="alert" className="space-y-1 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-ink">
            {errors.map((e) => (
              <li key={e.code}>
                <span className="ms-code text-[12px]">{e.code}</span> : {e.error}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2.5 pt-1">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" size="lg" className="flex-1" loading={pending}>
            {mode === "set" ? "Définir le stock" : mode === "add" ? "Ajouter au stock" : "Retirer du stock"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
