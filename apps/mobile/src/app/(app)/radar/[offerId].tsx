import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useActiveOrg } from "~/org/org-provider";
import { useDraftPurchaseOrder, useRadar, useRadarOffer, useSavedOffer } from "~/data/hooks";
import { appraisalText, FRESHNESS_LABEL, PRICE_ORIGIN_LABEL, STATUS_LABEL, STATUS_TONE, VERDICT_LABEL, VERDICT_TONE } from "~/data/radar";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { BottomSheet, Button, Card, DetailHeader, ErrorState, Screen, SectionHeader, SkeletonList, StatusChip, Stepper, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Détail d'une opportunité : calcul complet ligne à ligne, coûts manquants, réserves, actions confirmées. */
export default function RadarOfferScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const radar = useRadar("score");
  // détail enrichi (scénarios, offres concurrentes) : facultatif, l'écran reste utilisable sans
  const detail = useRadarOffer(offerId ?? "");
  const save = useSavedOffer();
  const po = useDraftPurchaseOrder();
  const { permissions } = useActiveOrg();
  const toast = useToast();
  const [ordering, setOrdering] = useState(false);
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

  return (
    <Screen>
      <DetailHeader parentLabel="Radar" />
      <View style={{ gap: 6 }}>
        <Txt variant="title2" accessibilityRole="header">
          {item.sku.name}
        </Txt>
        <Txt variant="label">
          {item.sku.code} · stock {formatNumber(item.sku.quantityAvailable)} · {formatNumber(item.sku.units30d)} ventes / 30 j
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <StatusChip label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
          <StatusChip label={FRESHNESS_LABEL[e.freshness]} tone={e.freshness === "stale" || e.freshness === "unknown" ? "danger" : "neutral"} />
          {item.savedAt ? <StatusChip label={`Enregistrée${item.priceAtSave !== null ? ` à ${formatMoney(item.priceAtSave, cur)}` : ""}`} tone="accent" /> : null}
        </View>
      </View>

      <Card padded style={{ gap: 4 }}>
        <Txt variant="headline">{o.supplierName}</Txt>
        <Txt variant="body" numberOfLines={3}>
          {o.title}
        </Txt>
        <Txt variant="label">
          {o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "prix inconnu"}
          {o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : " (HT/TTC non précisé)"} · port fournisseur {o.shippingCost !== null ? formatMoney(o.shippingCost, o.currency ?? cur) : "non précisé"} · MOQ {o.moq ?? "non précisé"} · {o.availableQuantity !== null ? `${formatNumber(o.availableQuantity)} dispo.` : o.stockStatus === "in_stock" ? "en stock (quantité non communiquée)" : o.stockStatus === "out_of_stock" ? "en rupture" : "stock non communiqué"}
        </Txt>
        <Txt variant="label">
          {PRICE_ORIGIN_LABEL[o.priceOrigin]} · {o.lastSeenAt ? `relevé le ${formatDateTime(o.lastSeenAt)}` : "date de relevé inconnue"}
        </Txt>
        {extras.length ? <Txt variant="label">Annoncé par le fournisseur : {extras.join(" · ")}</Txt> : null}
      </Card>

      {assessment ? (
        <>
          <SectionHeader title="Appréciation" />
          <Card padded style={{ gap: space[2] }} accessibilityLabel={`Verdict : ${VERDICT_LABEL[assessment.verdict]}`}>
            <StatusChip label={VERDICT_LABEL[assessment.verdict]} tone={VERDICT_TONE[assessment.verdict]} />
            {assessment.verdictReasons.map((r) => (
              <Txt key={r} variant="body">
                – {r}
              </Txt>
            ))}
            {(
              [
                ["Compétitivité de l'offre", assessment.competitiveness],
                ["Fiabilité de la source", assessment.sourceReliability],
                ["Confiance des données", assessment.dataConfidence],
              ] as const
            ).map(([label, a]) => (
              <View key={label} style={{ gap: 2, paddingTop: space[1] }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}>
                  <Txt variant="body" style={{ flex: 1 }}>
                    {label}
                  </Txt>
                  <Txt variant="body" num>
                    {appraisalText(a)}
                  </Txt>
                </View>
                {a.reasons.slice(0, 3).map((r) => (
                  <Txt key={r} variant="label">
                    {r}
                  </Txt>
                ))}
              </View>
            ))}
            <Txt variant="label">Trois notes séparées : un bon prix ne compense jamais une donnée ancienne ou un stock non confirmé. Aucune recommandation ne déclenche d'achat.</Txt>
          </Card>
        </>
      ) : null}

      {scenarios.length ? (
        <>
          <SectionHeader title="Scénarios de quantité" />
          {scenarios.map((sc) => (
            <Card key={`${sc.quantity}-${sc.label}`} padded style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}>
                <Txt variant="headline" style={{ flex: 1 }}>
                  {formatNumber(sc.quantity)} unité{sc.quantity > 1 ? "s" : ""} · {sc.label}
                </Txt>
                {sc.exceedsStock ? <StatusChip label="dépasse le stock annoncé" tone="danger" /> : null}
              </View>
              <Txt variant="label" color={color.ink}>
                Capital {sc.capital === null ? "—" : formatMoney(sc.capital, cur)} · bénéfice total {sc.totalProfit === null ? "—" : formatMoney(sc.totalProfit, cur)} · coût rendu {sc.unitLandedCost === null ? "—" : formatMoney(sc.unitLandedCost, cur)} / u
              </Txt>
              {sc.assumption ? <Txt variant="label">Hypothèse : {sc.assumption}</Txt> : null}
              {sc.missing.length ? (
                <Txt variant="label" color={color.accentInkOnSoft}>
                  Manque : {sc.missing.join(", ")}
                </Txt>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      {peers.length ? (
        <>
          <SectionHeader title={`Autres offres du même produit (${peers.length})`} />
          <Card padded style={{ gap: space[2] }}>
            {peers.map((p) => (
              <View key={p.offerId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="body" numberOfLines={1}>
                    {p.supplierName}
                  </Txt>
                  <Txt variant="label" numberOfLines={1}>
                    {p.availableQuantity !== null ? `${formatNumber(p.availableQuantity)} dispo.` : p.stockStatus === "out_of_stock" ? "en rupture" : "stock non confirmé"} · {p.ageDays === null ? "date inconnue" : `vu il y a ${p.ageDays} j`}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Txt variant="body" num>
                    {p.landedCost === null ? "—" : formatMoney(p.landedCost, cur)}
                  </Txt>
                  <StatusChip label={VERDICT_LABEL[p.verdict]} tone={VERDICT_TONE[p.verdict]} />
                </View>
              </View>
            ))}
            <Txt variant="label">Coût rendu par unité, du moins cher au plus cher. Seules les offres rattachées au même article de votre stock sont comparées (rattachement confirmé ou fiche identifiée par marque, modèle et capacité), jamais sur la seule ressemblance du nom.</Txt>
          </Card>
        </>
      ) : null}

      {e.reasons.length ? (
        <>
          <SectionHeader title="Pourquoi cette offre" />
          <Card padded style={{ gap: 4 }}>
            {e.reasons.map((r) => (
              <Txt key={r} variant="body">
                – {r}
              </Txt>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Calcul par unité" />
      <Card padded style={{ gap: 6 }}>
        {e.breakdown.length === 0 ? <Txt variant="label">Calcul impossible : données essentielles manquantes.</Txt> : null}
        {e.breakdown.map((l, idx) => (
          <View key={`${l.label}-${idx}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}>
            <Txt variant={/Marge brute|Bénéfice/.test(l.label) ? "headline" : "body"} style={{ flex: 1 }}>
              {l.label}
            </Txt>
            <Txt variant={/Marge brute|Bénéfice/.test(l.label) ? "headline" : "body"} num>
              {l.amount === null ? "—" : formatMoney(l.amount, cur)}
            </Txt>
          </View>
        ))}
        <Txt variant="label">Chiffre d'affaires, marge brute et bénéfice sont distincts : le bénéfice ne déduit que les coûts connus.</Txt>
      </Card>

      {e.missing.length ? (
        <>
          <SectionHeader title="Coûts ou données manquants" />
          <Card padded style={{ gap: 4 }}>
            {e.missing.map((m) => (
              <Txt key={m} variant="body" color={color.accentInkOnSoft}>
                – {m}
              </Txt>
            ))}
            <Button label="Compléter mes paramètres de coûts" variant="ghost" onPress={() => router.push("/radar/settings")} />
          </Card>
        </>
      ) : null}
      {e.cautions.length ? (
        <>
          <SectionHeader title="Réserves" />
          <Card padded style={{ gap: 4 }}>
            {e.cautions.map((c) => (
              <Txt key={c} variant="label">
                – {c}
              </Txt>
            ))}
          </Card>
        </>
      ) : null}

      <View style={{ gap: space[2] }}>
        {link ? <Button label="Voir l'offre chez le fournisseur" variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(link).catch(() => {})} /> : null}
        {permissions.canWrite ? <Button label={item.savedAt ? "Retirer des offres enregistrées" : "Enregistrer pour comparer plus tard"} variant="secondary" loading={save.isPending} onPress={toggleSave} /> : null}
        {permissions.canWrite && o.price !== null ? <Button label="Préparer un brouillon de commande" loading={po.create.isPending} onPress={() => setOrdering(true)} /> : null}
      </View>

      <BottomSheet visible={ordering} onClose={() => setOrdering(false)} title="Brouillon de commande fournisseur" description={`Rien n'est envoyé à ${o.supplierName} : le brouillon reste modifiable et supprimable.`}>
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
