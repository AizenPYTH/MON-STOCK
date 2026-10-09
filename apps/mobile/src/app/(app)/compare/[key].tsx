import { useMemo, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useActiveOrg } from "~/org/org-provider";
import { useComparison, useDraftPurchaseOrder } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatMoneyRounded, formatNumber, formatRelative } from "~/lib/format";
import { BottomSheet, Button, DetailHeader, EmptyState, ErrorState, KpiCard, KpiGrid, Screen, Skeleton, StickyActions, Txt, useToast } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import type { ComparedOffer } from "~/data/compare";

/**
 * Comparaison d'offres réelles : triées par marge estimée (coût rendu si le port est connu ;
 * frais d'import inconnus signalés). « Préparer la commande » crée un BROUILLON de commande
 * fournisseur — rien n'est envoyé au fournisseur depuis le mobile.
 */
export default function CompareScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const q = useComparison(key ?? "");
  const { active, permissions } = useActiveOrg();
  const currency = active.organization.currency;
  const draft = useDraftPurchaseOrder();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const selected = useMemo<ComparedOffer | null>(() => (q.data ? (q.data.offers.find((o) => o.id === selectedId) ?? q.data.offers[0] ?? null) : null), [q.data, selectedId]);

  if (q.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <Skeleton w="80%" h={26} />
        <Skeleton w="100%" h={74} r={radius.lg} />
        <Skeleton w="100%" h={100} r={radius.xl} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <ErrorState description={userMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  const c = q.data;
  if (!c)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <EmptyState title="Offres introuvables" description="Elles ont peut-être expiré ou été retirées par la source." />
      </Screen>
    );

  const qty = Math.max(1, selected?.moq ?? 1);
  const canOrder = permissions.canWrite && Boolean(selected?.skuId) && Boolean(selected?.supplierId) && selected?.price !== null;
  const bestId = c.offers[0]?.id;
  const bestTag = c.offers[0]?.marginPercent !== null && c.offers[0]?.marginPercent !== undefined ? "MEILLEURE MARGE" : "MEILLEUR PRIX";

  return (
    <Screen
      footer={
        selected ? (
          <StickyActions>
            <Button
              label={canOrder ? `Préparer la commande : ${formatNumber(qty)} unité${qty > 1 ? "s" : ""} chez ${selected.supplierName}` : !permissions.canWrite ? "Lecture seule" : "Offre non associée à un SKU"}
              disabled={!canOrder}
              onPress={() => setConfirming(true)}
              style={{ flex: 1 }}
            />
          </StickyActions>
        ) : undefined
      }
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <DetailHeader parentLabel="Sourcing" />
      <View style={{ gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">
          {c.title}
        </Txt>
        <Txt variant="label">
          {c.resalePrice === null ? "Prix de revente inconnu (marge non estimable)" : `Prix de revente ${c.resaleBasis === "average_30d" ? "moyen constaté (30 j)" : "du SKU"} : `}
          {c.resalePrice !== null ? (
            <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_800ExtraBold" }}>
              {formatMoneyRounded(c.resalePrice, currency)}
            </Txt>
          ) : null}
          {c.sku ? ` · stock actuel ${formatNumber(c.sku.available)}` : ""}
        </Txt>
      </View>
      <KpiGrid>
        {[
          <KpiCard key="best" label="Meilleur prix" value={c.best.price === null ? "—" : formatMoneyRounded(c.best.price, currency)} />,
          <KpiCard key="spread" label="Écart" value={c.best.spread === null ? "—" : formatMoneyRounded(c.best.spread, currency)} />,
          <KpiCard key="margin" label="Marge max" value={c.best.maxMargin === null ? "—" : `${Math.round(c.best.maxMargin)} %`} hintTone="success" />,
        ]}
      </KpiGrid>
      <View style={{ gap: 10 }}>
        {c.offers.map((o) => {
          const isSelected = o.id === selected?.id;
          const isBest = o.id === bestId;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${o.supplierName}, ${o.price === null ? "prix non communiqué" : formatMoneyRounded(o.price, currency)}, marge estimée ${o.marginPercent === null ? "inconnue" : `${Math.round(o.marginPercent)} %`}`}
              onPress={() => setSelectedId(o.id)}
              style={({ pressed }) => ({
                backgroundColor: color.surface,
                borderRadius: radius.xl,
                borderWidth: isSelected ? 1.5 : 1,
                borderColor: isSelected ? color.accent : color.line,
                padding: space[4],
                gap: space[3],
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Txt variant="body" style={{ fontFamily: "Manrope_700Bold", flexShrink: 1 }} numberOfLines={1}>
                  {o.supplierName}
                </Txt>
                {isBest ? (
                  <Txt variant="micro" color={color.inkOnDark} style={{ fontSize: 10, fontFamily: "Manrope_800ExtraBold", backgroundColor: color.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, overflow: "hidden" }}>
                    {bestTag}
                  </Txt>
                ) : null}
                <View style={{ flex: 1 }} />
                <Txt variant="kpiSm" num style={{ fontSize: 20 }}>
                  {o.price === null ? "—" : formatMoneyRounded(o.price, currency)}
                </Txt>
              </View>
              <View style={{ flexDirection: "row" }}>
                <Col label="Qté min" value={o.moq === null ? "—" : formatNumber(o.moq)} />
                <Col label="Délai" value={o.deliveryDays === null ? "—" : `${o.deliveryDays} j`} />
                <Col label="Marge est." value={o.marginPercent === null ? "—" : `${Math.round(o.marginPercent)} %`} tone={o.marginPercent !== null && o.marginPercent >= 38 ? color.success : color.ink2} />
              </View>
              <Txt variant="label" style={{ fontSize: 12 }}>
                {o.landedUnitCost !== null ? `Coût rendu ${formatMoneyRounded(o.landedUnitCost, currency)}/u (port inclus, frais d'import non communiqués)` : "Frais de port non communiqués"}
                {o.lastSeenAt ? ` · vérifiée ${formatRelative(o.lastSeenAt)}` : " · date de vérification inconnue"}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <BottomSheet
        visible={confirming && Boolean(selected)}
        onClose={() => setConfirming(false)}
        title="Préparer la commande ?"
        description={selected ? `Un BROUILLON de commande fournisseur sera créé : ${formatNumber(qty)} × ${selected.price === null ? "—" : formatMoneyRounded(selected.price, currency)} chez ${selected.supplierName}. Rien n'est envoyé au fournisseur : vous le validerez depuis l'application web.` : undefined}
      >
        <Button
          label="Créer le brouillon"
          loading={draft.create.isPending}
          onPress={() => {
            if (!selected) return;
            draft.create.mutate(
              { offer: selected, quantity: qty },
              {
                onSuccess: ({ purchaseOrderId }) => {
                  setConfirming(false);
                  toast({ text: `Brouillon créé chez ${selected.supplierName}`, action: { label: "Annuler", onPress: () => draft.remove.mutate(purchaseOrderId, { onSuccess: () => toast({ text: "Brouillon supprimé" }), onError: (e) => toast({ text: userMessage(e), tone: "error" }) }) } });
                  router.back();
                },
                onError: (e) => {
                  setConfirming(false);
                  toast({ text: userMessage(e), tone: "error" });
                },
              },
            );
          }}
        />
        <Button label="Annuler" variant="ghost" onPress={() => setConfirming(false)} />
      </BottomSheet>
    </Screen>
  );
}

function Col({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="micro" style={{ textTransform: "none", letterSpacing: 0 }}>
        {label}
      </Txt>
      <Txt variant="bodyRegular" num color={tone ?? color.ink} style={{ fontFamily: "Manrope_600SemiBold" }}>
        {value}
      </Txt>
    </View>
  );
}
