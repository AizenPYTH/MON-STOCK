import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { requireOrgContext, canWrite } from "@/features/auth/dal";
import { PageHeader, EmptyState, Callout, Section } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buildRadarOffer } from "@/services/radar/radar";
import type { RadarOfferDetailDTO } from "@/features/mobile-api/contract";
import { isAppError, toUserMessage } from "@/lib/errors";
import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn, safeExternalUrl } from "@/lib/utils";
import { ActionButtonForm } from "@/features/sourcing/components/action-button-form";
import { toggleSavedOfferAction } from "@/features/radar/actions";
import { RadarDraftForm } from "@/features/radar/components/draft-form";
import { FRESHNESS_LABEL, PRICE_ORIGIN_LABEL, STATUS_LABEL, STATUS_VARIANT, VERDICT_LABEL, VERDICT_VARIANT, ageDaysText, appraisalText, classifyBreakdown, profitPrefix } from "@/features/radar/labels";

export const metadata: Metadata = { title: "Opportunité d'achat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Détail d'une opportunité : calcul complet ligne à ligne, coûts manquants, réserves, scénarios, offres concurrentes, actions confirmées. */
export default async function RadarOfferPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const { offerId } = await params;
  const sp = await searchParams;
  const rawQty = Array.isArray(sp.quantity) ? sp.quantity[0] : sp.quantity;
  const qty = rawQty && /^\d{1,6}$/.test(rawQty) && Number(rawQty) >= 1 && Number(rawQty) <= 100_000 ? Number(rawQty) : null;

  let detail: RadarOfferDetailDTO | null = null;
  let error: string | null = null;
  if (!UUID.test(offerId)) error = "Offre introuvable.";
  else {
    try {
      detail = await buildRadarOffer(ctx, offerId, qty ? [qty] : []);
    } catch (e) {
      error = isAppError(e) && e.code === "NOT_FOUND" ? "Cette offre n'est plus dans le radar (expirée, dissociée de son produit ou d'une autre organisation)." : toUserMessage(e);
    }
  }
  const eyebrow = (
    <Link href="/radar" className="hover:text-foreground">
      Radar d&apos;achat
    </Link>
  );
  if (!detail) {
    return (
      <>
        <PageHeader eyebrow={eyebrow} title="Opportunité d'achat" />
        <EmptyState title="Offre indisponible" description={error ?? undefined} action={<ButtonLink href="/radar">Retour au radar</ButtonLink>} />
      </>
    );
  }

  const { item, scenarios, peers } = detail;
  const e = item.evaluation;
  const o = item.offer;
  const cur = item.sku.currency;
  const link = safeExternalUrl(o.sourceUrl);
  const writable = canWrite(ctx.role);
  const tax = o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : null;
  const lines = classifyBreakdown(e.breakdown);
  const toCheck = [...e.missing.map((m) => `Coût inconnu : ${m}`), ...e.cautions];
  const d = item.details;
  const extras = [
    d.condition ? `état ${d.condition}` : null,
    d.grade ? `grade ${d.grade}` : null,
    d.warrantyMonths !== null ? `garantie ${d.warrantyMonths} mois` : null,
    d.shipFromCountry ? `expédié depuis ${d.shipFromCountry}` : null,
    d.vatRegime ? `TVA : ${d.vatRegime}` : null,
    d.orderMultiple ? `par multiple de ${d.orderMultiple}` : null,
    d.deliveryMaxDays !== null ? `livraison ≤ ${d.deliveryMaxDays} j` : null,
  ].filter((x): x is string => Boolean(x));
  const profit = e.estimatedProfit;
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, cur));

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={item.sku.name}
        description={
          <span>
            <span className="font-mono">{item.sku.code}</span> · stock {formatNumber(item.sku.quantityAvailable)} · {formatNumber(item.sku.units30d)} ventes / 30 j · {formatNumber(item.offersForSku)} offre{item.offersForSku > 1 ? "s" : ""} pour ce produit
          </span>
        }
        actions={
          <>
            {link ? (
              <ButtonLink href={link} variant="secondary" aria-label={`Voir l'offre chez ${o.supplierName} (nouvel onglet)`}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Voir l&apos;offre
              </ButtonLink>
            ) : null}
            {writable ? (
              <ActionButtonForm action={toggleSavedOfferAction} fields={{ offer_id: o.offerId }} size="md" variant="ghost" showSuccess>
                {item.savedAt ? "Retirer des offres enregistrées" : "Enregistrer pour comparer"}
              </ActionButtonForm>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{o.supplierName}</div>
                  <div className="text-xs text-muted">
                    {[o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} dispo` : o.stockStatus === "out_of_stock" ? "en rupture" : "stock non indiqué", o.moq ? `MOQ ${o.moq}` : null, o.lastSeenAt ? `prix vu ${formatRelative(o.lastSeenAt)}` : "date du prix inconnue", o.supplierCountry].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-right tnum">
                  <div className="text-lg font-semibold">{o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"}</div>
                  <div className="text-xs text-muted">{tax ?? "HT/TTC ?"}</div>
                  {item.priceAtSave !== null && o.price !== null && item.priceAtSave !== o.price ? <div className="text-xs text-muted">enregistrée à {money(item.priceAtSave)}</div> : null}
                </div>
              </div>
              <p className="text-sm text-muted-strong">{o.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                <Badge variant={VERDICT_VARIANT[item.assessment.verdict]}>{VERDICT_LABEL[item.assessment.verdict]}</Badge>
                <span className="text-xs text-muted tnum">Score {e.score}/100</span>
                <span className={cn("text-xs", e.freshness === "stale" || e.freshness === "unknown" ? "font-medium text-warning" : "text-muted")}>
                  {FRESHNESS_LABEL[e.freshness]} ({ageDaysText(e.ageDays)})
                </span>
                <span className="text-xs text-muted">· {PRICE_ORIGIN_LABEL[o.priceOrigin]}</span>
              </div>
            </CardContent>
          </Card>

          <Section title="Bénéfice estimé par unité">
            <div className="flex flex-wrap items-end gap-6">
              <div className={cn("text-3xl font-semibold tnum", profit === null ? "text-muted" : profit >= 0 ? "text-success" : "text-danger")}>{profit === null ? "—" : `${profitPrefix(e.status)}${profit >= 0 ? "+" : "−"}${formatMoney(Math.abs(profit), cur)}`}</div>
              {e.marginPercent !== null ? (
                <div className="text-sm text-muted">
                  <span className="font-semibold text-foreground tnum">{formatNumber(e.marginPercent, 1)} %</span> du prix de vente
                </div>
              ) : null}
            </div>
            {e.missing.length > 0 ? <p className="text-xs text-warning">Provisoire : calculé avec les seuls coûts connus.</p> : null}
          </Section>

          <Section title="Calcul par unité">
            {lines.length === 0 ? (
              <Callout tone="neutral">Calcul impossible : données essentielles manquantes ({e.missing.join(", ") || "prix"}).</Callout>
            ) : (
              <Table className="min-w-0">
                <caption className="sr-only">Cascade : prix de vente, coût d&apos;achat rendu, marge brute, frais de vente, bénéfice</caption>
                <THead>
                  <tr>
                    <TH>Étape</TH>
                    <TH align="right">Montant</TH>
                  </tr>
                </THead>
                <TBody>
                  {lines.map((l, idx) => (
                    <TR key={`${l.label}-${idx}`} className={l.kind === "subtotal" || l.kind === "result" ? "bg-surface-muted/50" : undefined}>
                      <TD className={cn(l.kind === "cost" ? "pl-8" : "", l.kind === "subtotal" || l.kind === "result" ? "font-semibold" : "")}>{l.label}</TD>
                      <TD align="right" className={cn("tnum", l.kind === "subtotal" || l.kind === "result" ? "font-semibold" : "", l.kind === "result" && l.amount !== null ? (l.amount >= 0 ? "text-success" : "text-danger") : "")}>
                        {l.amount === null ? "—" : l.kind === "deduction" ? `− ${money(l.amount)}` : l.kind === "cost" ? `+ ${money(l.amount)}` : l.kind === "result" ? `${profitPrefix(e.status)}${money(l.amount)}` : money(l.amount)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="text-xs text-muted">Les lignes « + » composent le coût d&apos;achat rendu ; les lignes « − » se déduisent de la marge brute.</p>
          </Section>

          {toCheck.length > 0 ? (
            <Section title="À vérifier avant d'acheter" actions={e.missing.length > 0 ? <ButtonLink href="/radar/settings" variant="secondary" size="sm">Compléter mes coûts</ButtonLink> : undefined}>
              <ul className="space-y-1.5">
                {toCheck.map((m) => (
                  <li key={m} className="flex items-start gap-2 text-sm text-warning">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {scenarios.length > 0 ? (
            <Section
              title="Scénarios de quantité"
              description="Coût rendu et bénéfice selon la quantité commandée (minimum et multiple de commande respectés)."
              actions={
                <form method="get" className="flex items-end gap-2">
                  <label htmlFor="scenario_qty" className="text-xs text-muted">
                    Simuler une quantité
                  </label>
                  <Input id="scenario_qty" name="quantity" type="number" min={1} max={100000} step={1} defaultValue={qty ?? ""} className="h-8 w-24" />
                  <Button type="submit" size="sm" variant="secondary">
                    Calculer
                  </Button>
                </form>
              }
            >
              <Table>
                <THead>
                  <tr>
                    <TH align="right">Quantité</TH>
                    <TH>Scénario</TH>
                    <TH align="right">Coût rendu / u.</TH>
                    <TH align="right">Bénéfice / u.</TH>
                    <TH align="right">Capital</TH>
                    <TH align="right">Bénéfice total ≈</TH>
                    <TH>Réserves</TH>
                  </tr>
                </THead>
                <TBody>
                  {scenarios.map((sc) => (
                    <TR key={`${sc.quantity}-${sc.label}`}>
                      <TD align="right" className="tnum font-medium">
                        {formatNumber(sc.quantity)}
                      </TD>
                      <TD>{sc.label}</TD>
                      <TD align="right" className="tnum">
                        {money(sc.unitLandedCost)}
                      </TD>
                      <TD align="right" className="tnum">
                        {money(sc.unitProfit)}
                      </TD>
                      <TD align="right" className="tnum">
                        {money(sc.capital)}
                      </TD>
                      <TD align="right" className={cn("tnum font-semibold", sc.totalProfit === null ? "text-muted" : sc.totalProfit >= 0 ? "text-success" : "text-danger")}>
                        {money(sc.totalProfit)}
                      </TD>
                      <TD className="text-xs">
                        {sc.exceedsStock ? <Badge variant="danger">Dépasse le stock annoncé</Badge> : null}
                        {sc.missing.length > 0 ? <div className="text-warning">Manque : {sc.missing.join(", ")}</div> : null}
                        {sc.assumption ? <div className="text-muted">{sc.assumption}</div> : null}
                        {!sc.exceedsStock && sc.missing.length === 0 && !sc.assumption ? <span className="text-muted">—</span> : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
          ) : null}

          {peers.length > 0 ? (
            <Section title={`Autres offres pour ce produit (${peers.length})`} description="Coût rendu par unité ; seules les offres rattachées au même article sont comparées.">
              <Table>
                <THead>
                  <tr>
                    <TH>Fournisseur</TH>
                    <TH align="right">Prix</TH>
                    <TH align="right">Coût rendu</TH>
                    <TH>Disponibilité</TH>
                    <TH>Prix vu</TH>
                    <TH>Verdict</TH>
                  </tr>
                </THead>
                <TBody>
                  {peers.map((p) => (
                    <TR key={p.offerId}>
                      <TD>
                        <Link href={`/radar/${p.offerId}` as never} className="font-medium hover:underline">
                          {p.supplierName}
                        </Link>
                      </TD>
                      <TD align="right" className="tnum">
                        {money(p.price)}
                      </TD>
                      <TD align="right" className={cn("tnum", p.landedCost !== null && e.landedCost !== null && p.landedCost < e.landedCost ? "font-semibold text-success" : "")}>
                        {money(p.landedCost)}
                      </TD>
                      <TD className="text-xs">{p.availableQuantity !== null ? `${formatNumber(p.availableQuantity)} dispo` : p.stockStatus === "out_of_stock" ? "en rupture" : "stock ?"}</TD>
                      <TD className="text-xs text-muted">{ageDaysText(p.ageDays)}</TD>
                      <TD>
                        <Badge variant={VERDICT_VARIANT[p.verdict]}>{VERDICT_LABEL[p.verdict]}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Brouillon de commande" description={writable ? "Préparez une commande fournisseur à partir de cette offre." : "Lecture seule : votre rôle ne permet pas de créer une commande."} />
            <CardContent className="py-4">
              {writable && o.price !== null ? (
                <RadarDraftForm offerId={o.offerId} supplierName={o.supplierName} moq={o.moq} unitPrice={o.price} currency={o.currency ?? cur} taxLabel={tax} />
              ) : (
                <p className="text-sm text-muted">{o.price === null ? "Prix de l'offre inconnu : brouillon impossible." : "Demandez à un rédacteur ou un administrateur de préparer la commande."}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Appréciation" description={VERDICT_LABEL[item.assessment.verdict]} />
            <CardContent className="space-y-3 py-4 text-sm">
              {item.assessment.verdictReasons.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-muted-strong">
                  {item.assessment.verdictReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="space-y-1">
                {(
                  [
                    ["Compétitivité", item.assessment.competitiveness],
                    ["Fiabilité de la source", item.assessment.sourceReliability],
                    ["Confiance des données", item.assessment.dataConfidence],
                  ] as const
                ).map(([label, a]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-muted">{label}</dt>
                    <dd className="tnum font-medium">{appraisalText(a)}</dd>
                  </div>
                ))}
              </dl>
              {extras.length > 0 ? <p className="text-xs text-muted">Annoncé par le fournisseur : {extras.join(" · ")}</p> : null}
              {e.reasons.length > 0 ? <p className="text-xs text-muted">{e.reasons.join(" ")}</p> : null}
            </CardContent>
          </Card>
          <p className="text-xs text-muted">Estimation sur vos paramètres de coûts. Rien n&apos;est commandé ni envoyé au fournisseur.</p>
        </div>
      </div>
    </>
  );
}
