"use client";
import { useId, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy } from "lucide-react";
import { sanitizeAmountInput } from "@/domain/tools/decimal";
import { DEFAULT_VAT_RATES, type VatMode } from "@/domain/tools/vat";
import { ebayFeesFromChannel } from "@/domain/tools/ebay-fees";
import type { FxRate } from "@/domain/tools/currency";
import type { RateCard } from "@/domain/tools/shipping";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addParcelAction } from "@/features/tools/actions";
import type { EbayChannelFees } from "@/features/tools/types";
import type { TrackedParcel } from "@/features/tools/parcels";
import { frDate, PARCEL_TONE_CLASS } from "@/features/tools/format";
import { evaluateTrackingEntry } from "@/features/tools/tracking-input";
import { currencyHub, ebayHub, hubCopyText, HUB_WEIGHTS, marginHub, parcelHubLine, shippingByWeight, UNKNOWN, vatHub, VAT_HUB_MODES, type EbayHubInput, type HubLine } from "@/features/tools/hub";

/**
 * Calculateurs côte à côte de la page « Outils » (maquette v5) : saisie, lignes « saisi » vs
 * calculées et total, mis à jour pendant la frappe. Chaque carte mène à son outil complet.
 */

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
/** Zone de clic portée à 40 px pour les pastilles de 32 px. */
const HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']";

function HubCard({ glyph, dark, title, desc, href, copy, children, note, footer }: { glyph: string; dark?: boolean; title: string; desc: string; href: string; copy: string | null; children: ReactNode; note?: ReactNode; footer?: ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn("flex h-[42px] w-[42px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl text-base font-extrabold tracking-[-0.5px]", dark ? "bg-inverse text-on-inverse" : "bg-surface-3 text-foreground")}>
          {glyph}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <h2 className="text-[15.5px] font-extrabold leading-[21px]">
            <Link href={href as never} className={cn("rounded hover:underline hover:underline-offset-2", FOCUS)}>
              {title}
            </Link>
          </h2>
          <p className="text-[12.5px] font-semibold leading-[17px] text-ink-3">{desc}</p>
        </div>
        <HubCopy text={copy} />
      </div>
      {children}
      {note ? <div className="text-xs font-semibold leading-[17px] text-ink-3">{note}</div> : null}
      {footer ? <div className="-mt-1 flex flex-wrap gap-x-4 gap-y-1">{footer}</div> : null}
    </article>
  );
}

function HubCopy({ text }: { text: string | null }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      aria-label="Copier les résultats"
      onClick={() => {
        if (!text) return;
        if (!navigator.clipboard) return toast.error("Copie impossible dans ce navigateur.");
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            toast.success("Résultats copiés.");
            window.setTimeout(() => setCopied(false), 1800);
          },
          () => toast.error("Copie impossible dans ce navigateur."),
        );
      }}
      className={cn("flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong px-2.5 text-[12.5px] font-bold hover:bg-line-soft disabled:opacity-45", HIT, FOCUS)}
    >
      <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

/** Pastilles exclusives (taux, sens, devise, poids). */
function Chips<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn("h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold transition-colors", on ? "border-inverse bg-inverse text-on-inverse hover:bg-inverse-hover" : "border-border-strong bg-surface text-foreground hover:bg-surface-2", HIT, FOCUS)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function HubInput({ label, value, onChange, suffix, placeholder = "—", inputMode = "decimal", error }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string; inputMode?: "decimal" | "text"; error?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <label htmlFor={id} className="text-[12.5px] font-bold leading-[17px]">
        {label}
      </label>
      <div className={cn("flex h-11 items-center rounded-xl border bg-surface pl-3 pr-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25", error ? "border-danger bg-danger-soft" : "border-border-control hover:border-muted")}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={error || undefined}
          onChange={(e) => onChange(inputMode === "decimal" ? sanitizeAmountInput(e.target.value) : e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base font-extrabold text-foreground tnum placeholder:font-semibold placeholder:text-ink-4 focus:outline-none"
        />
        {suffix ? <span className="text-sm font-semibold text-ink-3">{suffix}</span> : null}
      </div>
    </div>
  );
}

function Inputs({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">{children}</div>;
}

const TONE_TEXT = { success: "text-success", danger: "text-danger", warning: "text-warning" } as const;

/** Lignes de résultat : « saisi » pour les valeurs tapées, total en gras. */
function Lines({ lines, label }: { lines: HubLine[]; label: string }) {
  return (
    <dl aria-label={label} aria-live="polite" className="border-t border-line-soft">
      {lines.map((l, i) => {
        const total = l.kind === "total";
        const color = l.tone ? TONE_TEXT[l.tone] : total ? "text-foreground" : l.kind === "muted" ? "text-ink-3" : "text-muted";
        return (
          <div key={`${l.label}-${i}`} className={cn("flex items-center gap-2 border-b border-line-soft", total ? "-mx-4 bg-surface-2 px-4 py-3" : "py-[9px]")}>
            <dt className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] leading-[19px]", total ? "font-extrabold text-foreground" : l.kind === "muted" ? "font-medium text-ink-3" : "font-medium text-muted")}>
              {l.label}
              {l.kind === "input" ? <span className="rounded-md bg-line-soft px-1.5 py-px text-[10.5px] font-bold leading-[15px] text-muted">saisi</span> : null}
              {l.aside ? <span className={cn("ms-code text-[10.5px]", l.aside.tone === "warning" ? "text-warning" : "text-ink-3")}>{l.aside.text}</span> : null}
            </dt>
            <dd className={cn("shrink-0 text-right leading-5 tnum", total ? "text-[20px] font-extrabold tracking-[-0.3px]" : "text-[13.5px] font-semibold", color)}>
              {l.approx && l.value !== UNKNOWN ? <span className="mr-1 font-medium opacity-60">≈</span> : null}
              {l.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs font-semibold text-danger">
      {children}
    </p>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as never} className={cn("inline-flex min-h-10 items-center gap-1 rounded text-[13px] font-bold text-foreground hover:underline hover:underline-offset-2", FOCUS)}>
      {children}
      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  );
}

// ---------------------------------------------------------------------------

export function VatHubCard() {
  const [mode, setMode] = useState<VatMode>("ht_to_ttc");
  const [rateId, setRateId] = useState(DEFAULT_VAT_RATES[0]!.id);
  const [amount, setAmount] = useState("");
  const rate = DEFAULT_VAT_RATES.find((r) => r.id === rateId) ?? DEFAULT_VAT_RATES[0]!;
  const v = vatHub(mode, amount, rate);
  const title = "Calculateur de TVA";
  return (
    <HubCard
      glyph="%"
      dark
      title={title}
      desc="HT → TTC, TTC → HT ou TVA seule, taux au choix."
      href="/tools/vat"
      copy={amount && !v.error ? hubCopyText(title, v.lines, "(estimation, pas un avis fiscal)") : null}
      note={`${rate.hint} Estimation, pas un avis fiscal : vérifiez le régime de TVA sur marge pour l'occasion.`}
      footer={<FooterLink href="/tools/vat">Autre taux, saisie dans les trois sens</FooterLink>}
    >
      <Chips label="Sens du calcul" options={VAT_HUB_MODES} value={mode} onChange={setMode} />
      <Chips label="Taux de TVA" options={DEFAULT_VAT_RATES.map((r) => ({ value: r.id, label: r.label }))} value={rate.id} onChange={setRateId} />
      <Inputs>
        <HubInput label={v.inputLabel} value={amount} onChange={setAmount} suffix="€" error={Boolean(v.error)} />
      </Inputs>
      {v.error ? <ErrorText>{v.error}</ErrorText> : null}
      <Lines lines={v.lines} label="Résultat TVA" />
    </HubCard>
  );
}

export function MarginHubCard() {
  const [achat, setAchat] = useState("");
  const [vente, setVente] = useState("");
  const [frais, setFrais] = useState("");
  const m = marginHub(achat, vente, frais);
  const title = "Calculateur de marge";
  return (
    <HubCard
      glyph="+€"
      title={title}
      desc="Prix d'achat, prix de vente et frais → bénéfice et taux de marge."
      href="/tools/margin"
      copy={achat && vente && !m.error ? hubCopyText(title, m.lines) : null}
      note="Des frais non saisis ne sont jamais comptés pour 0 dans vos marges réelles. TVA et commissions : calcul détaillé."
      footer={
        <>
          <FooterLink href="/tools/margin?vue=detail">Calcul détaillé</FooterLink>
          <FooterLink href="/tools/selling-price">Prix de vente visé</FooterLink>
        </>
      }
    >
      <Inputs>
        <HubInput label="Prix d'achat" value={achat} onChange={setAchat} suffix="€" />
        <HubInput label="Prix de vente" value={vente} onChange={setVente} suffix="€" />
        <HubInput label="Frais (commission, port…)" value={frais} onChange={setFrais} suffix="€" />
      </Inputs>
      {m.error ? <ErrorText>{m.error}</ErrorText> : null}
      <Lines lines={m.lines} label="Résultat de marge" />
    </HubCard>
  );
}

export function EbayHubCard({ channel }: { channel: EbayChannelFees | null }) {
  const pre = ebayFeesFromChannel(channel);
  const [input, setInput] = useState<EbayHubInput>({ itemPrice: "", shippingCharged: "", finalValueFeePercent: pre.input.finalValueFeePercent, fixedFeePerOrder: pre.input.fixedFeePerOrder, promotedPercent: "" });
  const set = (k: keyof EbayHubInput) => (v: string) => setInput((i) => ({ ...i, [k]: v }));
  const r = ebayHub(input);
  const title = "Calculateur de frais eBay";
  const notes = [pre.prefilled.length ? `Repris de votre canal eBay : ${pre.prefilled.join(", ")}.` : "Aucun taux par défaut : saisissez ceux de votre grille.", r.notEntered.length ? `Non renseigné (non déduit) : ${r.notEntered.join(", ")}.` : null, "Taux à vérifier selon votre catégorie et votre niveau vendeur eBay."].filter(Boolean).join(" ");
  return (
    <HubCard
      glyph="eB"
      title={title}
      desc="Ce qu'il reste réellement après commissions et frais de vente."
      href="/tools/ebay-fees"
      copy={input.itemPrice && !r.error ? hubCopyText(title, r.lines, r.notEntered.length ? `Non renseigné : ${r.notEntered.join(", ")}` : null) : null}
      note={notes}
      footer={<FooterLink href="/tools/ebay-fees?vue=detail">Calcul détaillé (envoi, achat)</FooterLink>}
    >
      <Inputs>
        <HubInput label="Prix de vente (objet)" value={input.itemPrice} onChange={set("itemPrice")} suffix="€" />
        <HubInput label="Port facturé" value={input.shippingCharged} onChange={set("shippingCharged")} suffix="€" />
        <HubInput label="Commission (%)" value={input.finalValueFeePercent} onChange={set("finalValueFeePercent")} suffix="%" />
        <HubInput label="Frais fixes / commande" value={input.fixedFeePerOrder} onChange={set("fixedFeePerOrder")} suffix="€" />
        <HubInput label="Annonce sponsorisée (%)" value={input.promotedPercent} onChange={set("promotedPercent")} suffix="%" />
      </Inputs>
      {r.error ? <ErrorText>{r.error}</ErrorText> : null}
      <Lines lines={r.lines} label="Résultat des frais eBay" />
    </HubCard>
  );
}

const FX_PREFERRED = ["GBP", "USD", "CHF", "CNY", "HKD", "JPY", "PLN"];

export function CurrencyHubCard({ rates, error, now }: { rates: FxRate[]; error: string | null; now: string }) {
  const available = FX_PREFERRED.filter((c) => rates.some((r) => r.currency === c)).slice(0, 4);
  const [code, setCode] = useState<string | null>(available[0] ?? null);
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const current = code && available.includes(code) ? code : (available[0] ?? null);
  const c = currencyHub(amount, current, fee, rates, new Date(now));
  const title = "Convertisseur de devises";
  return (
    <HubCard
      glyph="$€"
      title={title}
      desc="Taux BCE datés et frais bancaires séparés."
      href="/tools/currency"
      copy={amount && !c.error && current ? hubCopyText(title, c.lines, "Estimation : votre banque applique son propre taux.") : null}
      note={error ? null : "Estimation : votre banque applique son propre taux le jour du paiement."}
      footer={<FooterLink href="/tools/currency?vue=detail">Autres devises, frais fixes</FooterLink>}
    >
      {error ? (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
          Taux de change indisponibles : {error}
        </p>
      ) : available.length === 0 ? (
        <p className="rounded-xl bg-line-soft px-3 py-2 text-[13px] font-semibold text-muted">Aucun taux de référence importé pour le moment.</p>
      ) : (
        <>
          <Chips label="Devise" options={available.map((x) => ({ value: x, label: x }))} value={current ?? available[0]!} onChange={setCode} />
          <Inputs>
            <HubInput label={`Montant (${current})`} value={amount} onChange={setAmount} suffix={current ?? ""} />
            <HubInput label="Frais bancaires (%)" value={fee} onChange={setFee} suffix="%" />
          </Inputs>
          {c.error ? <ErrorText>{c.error}</ErrorText> : null}
          <Lines lines={c.lines} label="Résultat de conversion" />
        </>
      )}
    </HubCard>
  );
}

export function ShippingHubCard({ cards, error, canWrite }: { cards: RateCard[]; error: string | null; canWrite: boolean }) {
  const [kg, setKg] = useState(0.5);
  const s = shippingByWeight(cards, kg);
  const weightLabel = HUB_WEIGHTS.find((w) => w.kg === kg)?.label ?? `${kg} kg`;
  const lines: HubLine[] = s.rows.map((r) => ({ label: r.label, value: r.cheapest ? `${r.value} · le moins cher` : r.value, kind: r.cheapest ? "total" : "calc" }));
  const title = "Comparateur de frais de port";
  const dated = s.oldestVerifiedAt ? `grille la plus ancienne vérifiée le ${frDate(s.oldestVerifiedAt)}` : null;
  return (
    <HubCard
      glyph="kg"
      title={title}
      desc="Transporteurs classés par prix selon le poids du colis."
      href="/tools/shipping"
      copy={lines.length ? hubCopyText(`${title} · ${weightLabel}`, lines, "Tarifs de vos grilles saisies") : null}
      note={
        error ? null : cards.length === 0 ? (
          "MON STOCK ne fournit aucun tarif : saisissez vos grilles (contrat ou grille publique)."
        ) : (
          <>
            Vos grilles tarifaires saisies{dated ? ` (${dated})` : ""}
            {s.undated ? `, ${s.undated} sans date de vérification` : ""}. Poids réel seulement : volumétrique, pays et dimensions dans le comparateur complet.
          </>
        )
      }
      footer={
        <>
          <FooterLink href="/tools/shipping">Comparer un colis</FooterLink>
          {canWrite && cards.length === 0 && !error ? <FooterLink href="/tools/shipping-rates/new">Saisir une grille</FooterLink> : <FooterLink href="/tools/shipping-rates">Mes grilles</FooterLink>}
        </>
      }
    >
      {error ? (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
          Grilles indisponibles : {error}
        </p>
      ) : (
        <>
          <Chips label="Poids du colis" options={HUB_WEIGHTS.map((w) => ({ value: w.kg, label: w.label }))} value={kg} onChange={setKg} />
          {lines.length ? (
            <Lines lines={lines} label={`Tarifs pour ${weightLabel}`} />
          ) : (
            <p className="border-t border-line-soft pt-3 text-[13.5px] font-semibold text-muted">{cards.length === 0 ? "Aucune grille tarifaire saisie." : `Aucune grille ne couvre ${weightLabel}.`}</p>
          )}
          {lines.length && s.outOfRange ? <p className="-mt-1 text-xs font-semibold text-ink-3">{s.outOfRange} grille{s.outOfRange > 1 ? "s" : ""} sans tranche pour ce poids.</p> : null}
        </>
      )}
    </HubCard>
  );
}

export function TrackingHubCard({ parcels, error, canWrite }: { parcels: TrackedParcel[]; error: string | null; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const entry = evaluateTrackingEntry(number, { enabled: false, carrier: null });
  const rows = parcels.map(parcelHubLine);
  const title = "Suivi de colis";

  function submit() {
    if (!entry.number) return;
    setMessage(null);
    startTransition(async () => {
      const r = await addParcelAction({ trackingNumber: entry.number!, carrierCode: entry.carrier, carrierSource: "auto", label: "", orderId: null, destinationCountry: null });
      if (!r.ok) {
        setMessage({ tone: "error", text: r.error });
        return;
      }
      setNumber("");
      setMessage({ tone: "ok", text: r.data.message });
      toast.success(r.data.message);
      router.refresh();
    });
  }

  return (
    <HubCard
      glyph="→"
      dark
      title={title}
      desc="Statut, étapes et livraison estimée de vos envois."
      href="/tools/tracking"
      copy={rows.length ? rows.map((r) => `${r.label} : ${r.value}`).join("\n") : null}
      note="Statuts relevés chez le transporteur ; « Non vérifié » tant qu'aucune réponse n'a été reçue."
      footer={<FooterLink href="/tools/tracking">Tous les colis</FooterLink>}
    >
      {canWrite ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <HubInput label="Ajouter un numéro de suivi" value={number} onChange={(v) => setNumber(v.slice(0, 60))} placeholder="Ex. 6A12345678901" inputMode="text" error={Boolean(entry.error)} />
            </div>
            <button type="submit" disabled={!entry.number || pending} className={cn("h-11 shrink-0 rounded-[10px] bg-mint px-4 text-sm font-extrabold text-night hover:bg-mint-pressed disabled:opacity-50", FOCUS)}>
              {pending ? "Ajout…" : "Suivre"}
            </button>
          </div>
          {entry.error ? <p className="text-xs font-semibold text-danger">{entry.error}</p> : entry.detectedText ? <p className="text-xs font-semibold text-ink-3">{entry.detectedText}</p> : null}
          {message ? (
            <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-xs font-semibold", message.tone === "error" ? "text-danger" : "text-success")}>
              {message.text}
            </p>
          ) : null}
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
          Colis indisponibles : {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="border-t border-line-soft pt-3 text-[13.5px] font-semibold text-muted">Aucun colis suivi pour le moment.</p>
      ) : (
        <ul aria-label="Colis récents" className="border-t border-line-soft">
          {parcels.map((p, i) => {
            const r = rows[i]!;
            const tone = PARCEL_TONE_CLASS[r.tone];
            return (
              <li key={p.id} className="border-b border-line-soft">
                <Link href={`/tools/tracking/${p.id}` as never} className={cn("flex min-h-10 items-center gap-3 py-[9px] hover:bg-line-soft/60", FOCUS)}>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-muted">{r.label}</span>
                  <span className={cn("flex shrink-0 items-center gap-1.5 text-right text-[13.5px] font-semibold", tone.text)}>
                    <span aria-hidden="true" className={cn("h-[7px] w-[7px] rounded-full", tone.dot)} />
                    {r.value}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </HubCard>
  );
}
