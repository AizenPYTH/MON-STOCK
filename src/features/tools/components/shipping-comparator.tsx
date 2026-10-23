"use client";
import { useState, useTransition } from "react";
import { formatMoneyDec } from "@/domain/tools/decimal";
import { compareManualCards, highlights, optionFromQuote, parseParcel, sortOptions, type Parcel, type RateCard, type ShippingOption, type ShippingSort } from "@/domain/tools/shipping";
import type { ShippingQuotesDTO } from "@/features/mobile-api/contract";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Callout, EmptyState } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requestShippingQuotesAction } from "@/features/tools/actions";
import { priceTaxText, quotedAtText, trackingText, transitText } from "@/features/tools/format";
import { AmountField, ChoiceChips, EstimateNote, FormBlock } from "@/features/tools/components/ui";

type FormState = { weightKg: string; lengthCm: string; widthCm: string; heightCm: string; fromCountry: string; fromPostcode: string; toCountry: string; toPostcode: string; fromCity: string; toCity: string };

const iso2 = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);

/**
 * Comparateur de frais de port : devis réels des plateformes connectées côté serveur (Packlink
 * PRO, Boxtal, Sendcloud — consultation de tarifs uniquement) + vos grilles saisies, présentées
 * comme des estimations. Aucun tarif inventé : sans source, aucun prix.
 */
export function ShippingComparator({ cards, configuredProviders, statusAvailable }: { cards: RateCard[]; configuredProviders: { id: string; label: string }[]; statusAvailable: boolean }) {
  const [form, setForm] = useState<FormState>({ weightKg: "", lengthCm: "", widthCm: "", heightCm: "", fromCountry: "FR", fromPostcode: "", toCountry: "FR", toPostcode: "", fromCity: "", toCity: "" });
  const [sort, setSort] = useState<ShippingSort>("price");
  const [submitted, setSubmitted] = useState<Parcel | null>(null);
  const [apiResult, setApiResult] = useState<ShippingQuotesDTO | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const parsed = parseParcel(form);
  const errors = showErrors ? parsed.errors : {};
  const noSource = statusAvailable && configuredProviders.length === 0 && cards.length === 0;

  function compare() {
    setShowErrors(true);
    if (!parsed.parcel) return;
    const parcel = parsed.parcel;
    setSubmitted(parcel);
    setApiResult(null);
    setApiError(null);
    if (configuredProviders.length === 0) return;
    if (!form.fromPostcode.trim() || !form.toPostcode.trim()) {
      setApiError("Codes postaux de départ et d'arrivée requis pour interroger les plateformes.");
      return;
    }
    startTransition(async () => {
      const r = await requestShippingQuotesAction({
        weightKg: parcel.weightKg,
        lengthCm: parcel.lengthCm,
        widthCm: parcel.widthCm,
        heightCm: parcel.heightCm,
        fromCountry: parcel.fromCountry,
        toCountry: parcel.toCountry,
        fromPostcode: form.fromPostcode.trim(),
        toPostcode: form.toPostcode.trim(),
        fromCity: form.fromCity.trim() || undefined,
        toCity: form.toCity.trim() || undefined,
      });
      if (r.ok) setApiResult(r.data);
      else setApiError(r.error);
    });
  }

  let options: ShippingOption[] = [];
  let excluded: { key: string; carrier: string; service: string; reason: string }[] = [];
  if (submitted) {
    const manual = compareManualCards(cards, submitted, sort);
    excluded = manual.excluded;
    const api = (apiResult?.quotes ?? []).map((q) => optionFromQuote(q, submitted)).filter((o): o is ShippingOption => o !== null);
    options = sortOptions([...api, ...manual.options], sort);
  }
  const hl = highlights(options);
  const boxtal = configuredProviders.some((p) => p.id === "boxtal");

  return (
    <div className="space-y-6">
      {noSource ? (
        <Callout tone="warning" action={<ButtonLink href="/tools/shipping-rates" variant="secondary" size="sm">Saisir mes grilles</ButtonLink>}>
          Aucun tarif réel disponible : aucune plateforme d'expédition n'est connectée et vous n'avez saisi aucune grille. MON STOCK n'invente aucun prix.
        </Callout>
      ) : null}
      <form
        className="grid grid-cols-1 gap-5 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          compare();
        }}
        noValidate
      >
        <FormBlock title="Colis">
          <AmountField label="Poids" value={form.weightKg} onChange={(v) => set("weightKg", v)} suffix="kg" placeholder="0,5" error={errors.weightKg} />
          <div className="grid grid-cols-3 gap-3">
            <AmountField label="Longueur" value={form.lengthCm} onChange={(v) => set("lengthCm", v)} suffix="cm" placeholder="—" error={errors.lengthCm} />
            <AmountField label="Largeur" value={form.widthCm} onChange={(v) => set("widthCm", v)} suffix="cm" placeholder="—" error={errors.widthCm} />
            <AmountField label="Hauteur" value={form.heightCm} onChange={(v) => set("heightCm", v)} suffix="cm" placeholder="—" error={errors.heightCm} />
          </div>
        </FormBlock>
        <FormBlock title="Trajet">
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            <Field label="Départ" htmlFor="ship-from" error={errors.fromCountry}>
              <Input id="ship-from" value={form.fromCountry} onChange={(e) => set("fromCountry", iso2(e.target.value))} placeholder="FR" autoCapitalize="characters" />
            </Field>
            <Field label="Code postal" htmlFor="ship-from-pc">
              <Input id="ship-from-pc" value={form.fromPostcode} onChange={(e) => set("fromPostcode", e.target.value.slice(0, 12))} placeholder="75001" autoComplete="off" />
            </Field>
            <Field label="Arrivée" htmlFor="ship-to" error={errors.toCountry}>
              <Input id="ship-to" value={form.toCountry} onChange={(e) => set("toCountry", iso2(e.target.value))} placeholder="DE" autoCapitalize="characters" />
            </Field>
            <Field label="Code postal" htmlFor="ship-to-pc">
              <Input id="ship-to-pc" value={form.toPostcode} onChange={(e) => set("toPostcode", e.target.value.slice(0, 12))} placeholder="10115" autoComplete="off" />
            </Field>
          </div>
          {boxtal ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ville de départ" htmlFor="ship-from-city">
                <Input id="ship-from-city" value={form.fromCity} onChange={(e) => set("fromCity", e.target.value.slice(0, 80))} placeholder="Facultatif" />
              </Field>
              <Field label="Ville d'arrivée" htmlFor="ship-to-city">
                <Input id="ship-to-city" value={form.toCity} onChange={(e) => set("toCity", e.target.value.slice(0, 80))} placeholder="Facultatif" />
              </Field>
            </div>
          ) : null}
        </FormBlock>
        <div className="lg:col-span-2">
          <Button type="submit" size="lg" disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Interrogation des plateformes…" : "Comparer"}
          </Button>
        </div>
      </form>

      {submitted ? (
        <section aria-labelledby="ship-results" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="ship-results" className="text-base font-semibold" aria-live="polite">
              {options.length} option{options.length > 1 ? "s" : ""}
            </h2>
            <ChoiceChips
              label="Trier par"
              options={[
                { value: "price" as ShippingSort, label: "Prix" },
                { value: "speed" as ShippingSort, label: "Rapidité" },
              ]}
              value={sort}
              onChange={setSort}
            />
          </div>
          {apiError ? <Callout tone="danger">{apiError}</Callout> : null}
          {(apiResult?.providers ?? [])
            .filter((p) => p.state !== "not_configured" && p.message)
            .map((p) => (
              <p key={p.id} className="text-sm text-muted-strong">
                {p.label} : {p.message}
              </p>
            ))}
          {options.length === 0 && !pending ? (
            <EmptyState
              title="Aucun tarif pour ce colis"
              description={noSource ? "Connectez une plateforme d'expédition (administrateur) ou saisissez vos grilles tarifaires." : "Aucune grille ni plateforme ne couvre ce poids, ces dimensions ou ce trajet."}
              action={<ButtonLink href="/tools/shipping-rates/new" variant="secondary" size="sm">Saisir une grille</ButtonLink>}
            />
          ) : null}
          {options.length > 0 ? (
            <Card className="overflow-hidden">
              <Table>
                <caption className="sr-only">Options d'expédition pour ce colis</caption>
                <THead>
                  <TR>
                    <TH scope="col">Transporteur</TH>
                    <TH scope="col" align="right">
                      Prix
                    </TH>
                    <TH scope="col">Délai</TH>
                    <TH scope="col">Suivi</TH>
                    <TH scope="col">Source</TH>
                  </TR>
                </THead>
                <TBody>
                  {options.map((o) => (
                    <TR key={o.key} className="align-top">
                      <TD>
                        <div className="font-medium">{o.carrier}</div>
                        {o.service ? <div className="text-xs text-muted">{o.service}</div> : null}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {hl.cheapest === o.key ? <Badge variant="success">Le moins cher</Badge> : null}
                          {hl.fastest === o.key ? <Badge variant="info">Le plus rapide</Badge> : null}
                        </div>
                        {o.deliveryMode ? <div className="mt-1 text-xs text-muted">{o.deliveryMode}</div> : null}
                        {o.restrictions.map((r) => (
                          <div key={r} className="text-xs text-muted">
                            – {r}
                          </div>
                        ))}
                      </TD>
                      <TD align="right">
                        <div className="font-semibold">{formatMoneyDec(o.price, o.currency)}</div>
                        <div className="text-xs text-muted">{priceTaxText(o)}</div>
                      </TD>
                      <TD>{transitText(o)}</TD>
                      <TD>{trackingText(o.tracking)}</TD>
                      <TD>
                        <Badge variant={o.origin === "api" ? "accent" : "neutral"}>{o.origin === "api" ? `Devis réel ${o.provider ?? ""}`.trim() : "Estimation : votre grille"}</Badge>
                        <div className="mt-1 text-xs text-muted">{quotedAtText(o)}</div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ) : null}
          {excluded.length ? (
            <Card className="space-y-1 px-5 py-4 text-sm">
              <h3 className="font-semibold">Grilles non applicables</h3>
              {excluded.map((x) => (
                <p key={x.key} className="text-muted-strong">
                  {x.carrier} {x.service} : {x.reason}
                </p>
              ))}
            </Card>
          ) : null}
        </section>
      ) : null}
      <EstimateNote>
        Devis réels : prix renvoyés par la plateforme pour votre compte au moment de la demande (HT/TTC indiqué seulement si l'API le précise). Estimations : vos grilles saisies, à jour selon la date de vérification indiquée. Aucune étiquette n'est achetée depuis cet écran ; le prix final dépend de l'étiquette achetée. MON STOCK n'est affilié à aucun transporteur.
      </EstimateNote>
    </div>
  );
}
