"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CARRIER_LABEL, extractTrackingFromScan, type CarrierCode } from "@/domain/tools/tracking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { addParcelAction, addParcelsBatchAction, searchOrdersForLinkAction } from "@/features/tools/actions";
import { evaluateTrackingEntry, parseTrackingLines, queuedText, type QueuedParcel } from "@/features/tools/tracking-input";
import { ChoiceChips, FormBlock } from "@/features/tools/components/ui";

const CARRIERS = Object.keys(CARRIER_LABEL) as CarrierCode[];

/**
 * Suivre un colis : numéro de suivi, transporteur détecté automatiquement (corrigeable), options
 * facultatives (nom, pays de destination, commande associée). Ajout en série : un numéro par
 * ligne. Seul le numéro (et le pays) est transmis à l'API de suivi.
 */
export function TrackingNewForm() {
  const router = useRouter();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [carrierManual, setCarrierManual] = useState(false);
  const [carrier, setCarrier] = useState<CarrierCode | null>(null);
  const [label, setLabel] = useState("");
  const [dest, setDest] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [orders, setOrders] = useState<{ id: string; label: string }[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedParcel[]>([]);
  const [pending, startTransition] = useTransition();
  const [, startSearch] = useTransition();
  const entry = evaluateTrackingEntry(number, { enabled: carrierManual, carrier });

  // Commandes proposées pour l'association (recherche différée).
  useEffect(() => {
    const t = window.setTimeout(() => {
      startSearch(async () => {
        const r = await searchOrdersForLinkAction(orderQuery);
        if (r.ok) {
          setOrders(r.data);
          setOrdersError(null);
        } else setOrdersError(r.error);
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [orderQuery]);

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return toast.error("Presse-papiers vide.");
      setNumber((extractTrackingFromScan(text)?.number ?? text.replace(/\s+/g, "")).slice(0, 60));
    } catch {
      toast.error("Lecture du presse-papiers refusée par le navigateur : collez le numéro dans la case (Ctrl+V).");
    }
  }

  function addLines() {
    const r = parseTrackingLines(bulkText, queue);
    setQueue((q) => [...q, ...r.items]);
    setBulkText("");
    const parts = [`${r.items.length} numéro${r.items.length > 1 ? "s" : ""} ajouté${r.items.length > 1 ? "s" : ""} à la liste`, r.duplicates.length ? `${r.duplicates.length} en double` : null, r.rejected.length ? `non reconnu${r.rejected.length > 1 ? "s" : ""} : ${r.rejected.join(", ")}` : null].filter(Boolean);
    setBulkNote(parts.join(" · "));
  }

  function submit() {
    setError(null);
    if (queue.length > 0) {
      const items = entry.number && !queue.some((q) => q.number === entry.number) ? [...queue, { number: entry.number, carrier: entry.carrier }] : queue;
      startTransition(async () => {
        const r = await addParcelsBatchAction(items);
        if (!r.ok) return setError(r.error);
        setQueue(items.filter((i) => r.data.failed.includes(i.number)));
        if (r.data.failed.length) {
          toast.error(r.data.summary);
          return;
        }
        toast.success(r.data.summary);
        router.push("/tools/tracking");
      });
      return;
    }
    if (entry.error || !entry.number) return setError(entry.error ?? "Saisissez un numéro de suivi.");
    if (dest && !/^[A-Z]{2}$/.test(dest)) return setError("Pays de destination : code à 2 lettres (ex. FR).");
    startTransition(async () => {
      const r = await addParcelAction({ trackingNumber: number, carrierCode: entry.carrier, carrierSource: carrierManual ? "manual" : "auto", label, orderId: order?.id ?? null, destinationCountry: dest || null });
      if (!r.ok) return setError(r.error);
      toast.success(r.data.message);
      router.push(`/tools/tracking/${r.data.id}` as never);
    });
  }

  const total = queue.length + (entry.number && !queue.some((q) => q.number === entry.number) ? 1 : 0);
  return (
    <form
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="space-y-5">
        <FormError message={error} />
        <FormBlock>
          <div>
            <label htmlFor="tracking-number" className="block text-sm font-medium">
              Numéro de suivi
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                id="tracking-number"
                value={number}
                onChange={(e) => setNumber(e.target.value.slice(0, 60))}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="N° de suivi"
                aria-invalid={entry.error ? true : undefined}
                aria-describedby="tracking-number-status"
                className="h-14 min-w-0 flex-1 rounded-xl border-2 border-inverse bg-surface px-4 text-2xl font-extrabold tracking-tight text-foreground placeholder:font-semibold placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-ring aria-invalid:border-danger"
              />
              <Button variant="secondary" size="lg" className="h-14" onClick={() => void paste()}>
                Coller
              </Button>
            </div>
            <p id="tracking-number-status" aria-live="polite" className={entry.error ? "mt-1.5 min-h-5 text-sm font-semibold text-danger" : "mt-1.5 min-h-5 text-sm font-semibold text-success"}>
              {entry.error ?? entry.detectedText ?? ""}
            </p>
            {entry.candidates.length > 1 && !carrierManual ? <p className="text-xs text-muted">Autres transporteurs possibles : {entry.candidates.slice(1).map((c) => CARRIER_LABEL[c.carrier]).join(", ")}. Corrigez si besoin ci-dessous.</p> : null}
            {entry.candidates[0] ? <p className="text-xs text-muted">{entry.candidates[0].reason}</p> : null}
          </div>
        </FormBlock>

        <FormBlock title="Options (facultatif)">
          <Field label="Nom (facultatif)" htmlFor="tracking-label">
            <Input id="tracking-label" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 120))} placeholder="Ex. iPhone 13 · Lyon" />
          </Field>
          <ChoiceChips<CarrierCode | "auto">
            label={`Transporteur : ${entry.carrier ? CARRIER_LABEL[entry.carrier] : "détection automatique"}`}
            options={[{ value: "auto", label: "Automatique" }, ...CARRIERS.map((c) => ({ value: c, label: CARRIER_LABEL[c] }))]}
            value={carrierManual && carrier ? carrier : "auto"}
            onChange={(v) => {
              if (v === "auto") {
                setCarrierManual(false);
                setCarrier(null);
              } else {
                setCarrierManual(true);
                setCarrier(v);
              }
            }}
          />
          <Field label="Pays de destination (facultatif)" htmlFor="tracking-dest" hint="Code à 2 lettres, transmis à l'API de suivi.">
            <Input id="tracking-dest" value={dest} onChange={(e) => setDest(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} placeholder="FR" autoCapitalize="characters" className="w-24" />
          </Field>
          {order ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">
              <span>Commande : {order.label}</span>
              <Button variant="ghost" size="sm" onClick={() => setOrder(null)}>
                Retirer
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Field label="Commande associée (facultatif)" htmlFor="tracking-order">
                <Input id="tracking-order" value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="N° de commande ou acheteur" autoComplete="off" />
              </Field>
              {ordersError ? <p className="text-xs text-danger">{ordersError}</p> : null}
              {orders.length ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Commandes proposées">
                  {orders.slice(0, 6).map((o) => (
                    <Button key={o.id} variant="secondary" size="sm" onClick={() => setOrder(o)}>
                      {o.label}
                    </Button>
                  ))}
                </div>
              ) : orderQuery.trim() ? (
                <p className="text-xs text-muted">Aucune commande trouvée.</p>
              ) : null}
            </div>
          )}
        </FormBlock>
        <p className="text-xs text-muted">Seul le numéro de suivi (et le pays) est transmis à l'API de suivi ; aucune donnée client.</p>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card className="space-y-3 px-5 py-4">
          <h2 className="text-sm font-semibold">Ajout en série</h2>
          <Field label="Plusieurs numéros (un par ligne)" htmlFor="tracking-bulk" hint="Numéros ou contenus de codes-barres d'étiquettes (La Poste / Colissimo compris).">
            <Textarea id="tracking-bulk" value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} spellCheck={false} />
          </Field>
          <Button variant="secondary" size="sm" onClick={addLines} disabled={!bulkText.trim()}>
            Ajouter à la liste
          </Button>
          {bulkNote ? (
            <p className="text-xs text-muted" aria-live="polite">
              {bulkNote}
            </p>
          ) : null}
          {queue.length ? (
            <div>
              <p className="text-xs font-medium text-muted-strong">
                {queue.length} colis prêt{queue.length > 1 ? "s" : ""} à suivre
              </p>
              <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
                {queue.map((q) => (
                  <li key={q.number} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="truncate font-medium tnum">{queuedText(q)}</span>
                    <button type="button" onClick={() => setQueue((all) => all.filter((x) => x.number !== q.number))} aria-label={`Retirer ${q.number}`} className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
        <Button type="submit" size="lg" className="w-full" disabled={pending || (!entry.number && queue.length === 0)} aria-busy={pending || undefined}>
          {pending ? "Ajout et premier suivi…" : queue.length ? `Suivre ${total} colis` : "Suivre"}
        </Button>
      </div>
    </form>
  );
}
