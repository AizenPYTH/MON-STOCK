import { useState } from "react";
import { Pressable, View } from "react-native";
import { Bookmark, ExternalLink, TriangleAlert } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useActiveOrg } from "~/org/org-provider";
import { useDraftPurchaseOrder, useRadar, useRadarOffer, useSavedOffer } from "~/data/hooks";
import { appraisalText, FRESHNESS_LABEL, PRICE_ORIGIN_LABEL, STATUS_LABEL, STATUS_TONE, VERDICT_LABEL, VERDICT_TONE } from "~/data/radar";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber, formatRelative } from "~/lib/format";
import { SupplierLogo } from "~/components/supplier-logo";
import { safeExternalUrl } from "~/lib/url";
import { BottomSheet, Button, Card, Collapsible, DetailHeader, ErrorState, MarginWaterfall, MonoTitle, ScoreBar, Screen, SkeletonList, StageFigure, StatusChip, Stepper, StickyActions, Txt, useToast, type WaterfallLine } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

/** Détail d'une opportunité : calcul complet ligne à ligne, coûts manquants, réserves, actions confirmées. */
export default function RadarOfferScreen() {
  const { offerId, order } = useLocalSearchParams<{ offerId: string; order?: string }>();
  const radar = useRadar("score");
  // détail enrichi (scénarios, offres concurrentes) : facultatif, l'écran reste utilisable sans
  const detail = useRadarOffer(offerId ?? "");
  const save = useSavedOffer();
  const po = useDraftPurchaseOrder();
  const { permissions } = useActiveOrg();
  const toast = useToast();
  // « Brouillon » depuis l'accueil : la feuille de quantité s'ouvre directement (rien n'est envoyé).
  const [ordering, setOrdering] = useState(order === "1");
  const [qty, setQty] = useState<number | null>(null);

  if (radar.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Radar" />
        <SkeletonList rows={5} thumb={false} />
      </Screen>
    );
  const item = radar.data?.items.find((i) => i.offer.offerId === offerId);
  if (radar.isError || !item)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Radar" />
        <ErrorState description={radar.isError ? userMessage(radar.error) : "Cette offre n'est plus dans le radar (expirée ou dissociée)."} onRetry={() => void radar.refetch()} />
      </Screen>
    );

  const e = item.evaluation;
  const o = item.offer;
  const cur = item.sku.currency;
  const minQty = Math.max(1, o.moq ?? 1);
  const quantity = qty ?? minQty;
  const link = safeExternalUrl(o.sourceUrl);
  const assessment = detail.data?.item.assessment ?? item.assessment ?? null;
  const details = detail.data?.item.details ?? item.details ?? null;
  const scenarios = detail.data?.scenarios ?? [];
  const peers = detail.data?.peers ?? [];
  const extras = details
    ? [
        details.condition ? `état ${details.condition}` : null,
        details.grade ? `grade ${details.grade}` : null,
        details.warrantyMonths !== null ? `garantie ${details.warrantyMonths} mois` : null,
        details.shipFromCountry ? `expédié depuis ${details.shipFromCountry}` : null,
        details.vatRegime ? `TVA : ${details.vatRegime}` : null,
        details.orderMultiple ? `par multiple de ${details.orderMultiple}` : null,
        details.deliveryMaxDays !== null ? `livraison ≤ ${details.deliveryMaxDays} j` : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  function toggleSave() {
    save.mutate(
      { offerId: o.offerId, price: o.price, currency: o.currency, saved: Boolean(item!.savedAt) },
      {
        onSuccess: () => toast({ text: item!.savedAt ? "Offre retirée de vos offres enregistrées." : `Offre enregistrée au prix de ${o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"}.` }),
        onError: (err) => toast({ text: userMessage(err), tone: "error" }),
      },
    );
  }

  function createDraft() {
    setOrdering(false);
    po.create.mutate(
      { offer: { id: o.offerId, supplierId: item!.supplierId, skuId: item!.sku.id, price: o.price }, quantity },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast({ text: `Brouillon de commande créé chez ${o.supplierName} (non envoyé).` });
        },
        onError: (err) => toast({ text: userMessage(err), tone: "error" }),
      },
    );
  }

  const lines = waterfallFromBreakdown(e.breakdown);
  const profit = e.estimatedProfit;
  const missing = [...e.missing, ...e.cautions];
  const canOrder = permissions.canWrite && o.price !== null;

  return (
    <Screen
      footer={
        <StickyActions>
          {link ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Voir l'offre chez ${o.supplierName}`} onPress={() => void WebBrowser.openBrowserAsync(link).catch(() => {})} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.surfacePressed : color.card, alignItems: "center", justifyContent: "center" })}>
              <ExternalLink size={20} color={color.ink} strokeWidth={2} />
            </Pressable>
          ) : null}
          {permissions.canWrite ? (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(item.savedAt), busy: save.isPending }} accessibilityLabel={item.savedAt ? "Retirer des offres enregistrées" : "Enregistrer pour comparer plus tard"} disabled={save.isPending} onPress={toggleSave} testID="radar-save" style={({ pressed }) => ({ width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.surfacePressed : color.card, alignItems: "center", justifyContent: "center" })}>
              <Bookmark size={20} color={item.savedAt ? color.accentInkOnSoft : color.ink} fill={item.savedAt ? color.accent : "transparent"} strokeWidth={2} />
            </Pressable>
          ) : null}
          {canOrder ? <Button label="Préparer un brouillon" loading={po.create.isPending} onPress={() => setOrdering(true)} style={{ flex: 1 }} testID="radar-draft" /> : null}
        </StickyActions>
      }
    >
      <DetailHeader parentLabel="Radar" over={`${item.sku.code} · stock ${formatNumber(item.sku.quantityAvailable)} · ${formatNumber(item.sku.units30d)} ventes / 30 j`} title={item.sku.name} />
      <Card padded style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <SupplierLogo domain={null} name={o.supplierName} size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }} numberOfLines={1}>
              {o.supplierName}
            </Txt>
            <Txt variant="code" numberOfLines={1} style={{ textTransform: "uppercase", fontSize: 10.5 }}>
              {[o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} dispo` : o.stockStatus === "out_of_stock" ? "en rupture" : "stock ?", o.moq ? `MOQ ${o.moq}` : null, o.lastSeenAt ? `vu ${formatRelative(o.lastSeenAt)}` : "date inconnue"].filter(Boolean).join(" · ")}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt variant="price" num>
              {o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "—"}
            </Txt>
            <Txt variant="code" style={{ fontSize: 10.5 }}>
              {o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : "HT/TTC ?"}
            </Txt>
          </View>
        </View>
        <Txt variant="label" numberOfLines={2}>
          {o.title}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <StatusChip label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
          <ScoreBar score={e.score} />
        </View>
      </Card>

      <View style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space[3] }}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Txt variant="monoSm">Bénéfice estimé par unité</Txt>
            <StageFigure value={profit === null ? "—" : `${e.status === "profitable" ? "" : "≈ "}${profit >= 0 ? "+" : "−"}${formatMoney(Math.abs(profit), cur)}`} size="sheet" onDark={false} tone={profit === null ? color.ink3 : profit >= 0 ? color.success : color.dangerInk} />
          </View>
          {e.marginPercent !== null ? (
            <Txt variant="label" style={{ textAlign: "right" }}>
              <Txt variant="label" num color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
                {formatNumber(e.marginPercent)} %
              </Txt>
              {"\n"}du prix de vente
            </Txt>
          ) : null}
        </View>
        <Txt variant="note">{FRESHNESS_LABEL[e.freshness]} · {PRICE_ORIGIN_LABEL[o.priceOrigin]}</Txt>
      </View>

      <MonoTitle title="Calcul par unité" />
      {lines.length ? <MarginWaterfall lines={lines} format={(n) => formatMoney(n, cur)} /> : <Card padded><Txt variant="label">Calcul impossible : données essentielles manquantes.</Txt></Card>}

      {missing.length ? (
        <>
          <MonoTitle title="À vérifier avant d'acheter" />
          <View style={{ gap: 8 }}>
            {missing.map((m) => (
              <View key={m} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <TriangleAlert size={15} color={color.accentInkOnSoft} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <Txt variant="label" color={color.accentInkOnSoft} style={{ flex: 1 }}>
                  {m}
                </Txt>
              </View>
            ))}
          </View>
          {e.missing.length ? <Button label="Compléter mes coûts" variant="secondary" compact onPress={() => router.push("/radar/settings")} /> : null}
        </>
      ) : null}

      {scenarios.length ? (
        <>
          <MonoTitle title="Scénarios de quantité" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {scenarios.map((sc) => (
              <Card key={`${sc.quantity}-${sc.label}`} padded style={{ gap: 4, minWidth: 150 }}>
                <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }}>
                  {formatNumber(sc.quantity)} u. · {sc.label}
                </Txt>
                <Txt variant="label" num>
                  Capital {sc.capital === null ? "—" : formatMoney(sc.capital, cur)}
                </Txt>
                <Txt variant="label" num color={sc.totalProfit !== null && sc.totalProfit < 0 ? color.dangerInk : color.success} style={{ fontFamily: "Manrope_700Bold" }}>
                  Bénéfice ≈ {sc.totalProfit === null ? "—" : formatMoney(sc.totalProfit, cur)}
                </Txt>
                {sc.exceedsStock ? <StatusChip label="Dépasse le stock annoncé" tone="danger" /> : null}
                {sc.missing.length ? (
                  <Txt variant="note" color={color.accentInkOnSoft}>
                    Manque : {sc.missing.join(", ")}
                  </Txt>
                ) : null}
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {peers.length ? (
        <>
          <MonoTitle title="Autres offres" count={peers.length} />
          <Card>
            {peers.map((p, i) => (
              <View key={p.offerId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2], paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: i === peers.length - 1 ? 0 : 1, borderBottomColor: color.lineSoft }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="body" numberOfLines={1}>
                    {p.supplierName}
                  </Txt>
                  <Txt variant="code" numberOfLines={1} style={{ fontSize: 10.5 }}>
                    {p.availableQuantity !== null ? `${formatNumber(p.availableQuantity)} dispo` : p.stockStatus === "out_of_stock" ? "en rupture" : "stock ?"} · {p.ageDays === null ? "date ?" : `il y a ${p.ageDays} j`}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
                    {p.landedCost === null ? "—" : formatMoney(p.landedCost, cur)}
                  </Txt>
                  <StatusChip label={VERDICT_LABEL[p.verdict]} tone={VERDICT_TONE[p.verdict]} />
                </View>
              </View>
            ))}
          </Card>
          <Txt variant="note">Coût rendu par unité ; seules les offres rattachées au même article sont comparées.</Txt>
        </>
      ) : null}

      {assessment ? (
        <Collapsible title="Appréciation" summary={VERDICT_LABEL[assessment.verdict]} testID="radar-assessment">
          {assessment.verdictReasons.map((r) => (
            <Txt key={r} variant="label" color={color.ink2}>
              – {r}
            </Txt>
          ))}
          {(
            [
              ["Compétitivité", assessment.competitiveness],
              ["Fiabilité de la source", assessment.sourceReliability],
              ["Confiance des données", assessment.dataConfidence],
            ] as const
          ).map(([label, a]) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}>
              <Txt variant="label" color={color.ink} style={{ flex: 1 }}>
                {label}
              </Txt>
              <Txt variant="label" num color={color.ink}>
                {appraisalText(a)}
              </Txt>
            </View>
          ))}
          {extras.length ? <Txt variant="note">Annoncé par le fournisseur : {extras.join(" · ")}</Txt> : null}
          {e.reasons.length ? <Txt variant="note">{e.reasons.join(" ")}</Txt> : null}
        </Collapsible>
      ) : null}
      <Txt variant="note">Estimation sur vos paramètres de coûts. Rien n'est commandé ni envoyé au fournisseur.</Txt>

      <BottomSheet visible={ordering && permissions.canWrite && o.price !== null} onClose={() => setOrdering(false)} title="Brouillon de commande fournisseur" description={`Rien n'est envoyé à ${o.supplierName} : le brouillon reste modifiable et supprimable.`}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt variant="body">Quantité (MOQ {minQty})</Txt>
          <Stepper value={quantity} onChange={(v) => setQty(Math.max(minQty, v))} min={minQty} />
        </View>
        <Txt variant="label">Total estimé : {o.price !== null ? formatMoney(o.price * quantity, cur) : "—"} {o.taxType === "ht" ? "HT" : ""} (hors transport)</Txt>
        <Button label="Créer le brouillon" loading={po.create.isPending} onPress={createDraft} />
        <Button label="Annuler" variant="ghost" onPress={() => setOrdering(false)} />
      </BottomSheet>
    </Screen>
  );
}

/** Lignes de cascade depuis le calcul du radar : 1re = base, sous-totaux, bénéfice = résultat. Pur. */
export function waterfallFromBreakdown(breakdown: { label: string; amount: number | null }[]): WaterfallLine[] {
  return breakdown.map((l, i) => ({
    label: l.label,
    amount: l.amount,
    kind: i === 0 ? "base" : /^Bénéfice/.test(l.label) ? "result" : /^(Marge brute|Coût d'achat rendu)/.test(l.label) ? "subtotal" : "minus",
  }));
}
