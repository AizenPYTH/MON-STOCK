import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { EbayListingCheckDTO, EbayListingDraftDTO, EbayListingPrefillDTO } from "@/features/mobile-api/contract";
import { EBAY_CONDITIONS, EBAY_CONDITION_LABEL } from "@/integrations/ebay/conditions";
import { useActiveOrg } from "~/org/org-provider";
import { checkEbayListing, fetchEbayAccountSetup, fetchListingPrefill, publishEbayListing } from "~/data/ebay";
import { userMessage } from "~/lib/errors";
import { AlertBanner, BottomSheet, Button, Card, DetailHeader, ErrorState, FilterChip, Screen, SectionHeader, SkeletonList, StickyActions, TextField, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/**
 * Préparation d'une annonce eBay depuis un SKU : pré-remplie avec les vraies données, contrôlée
 * par le serveur (contenu exact affiché), publiable uniquement si le serveur lève ses trois
 * verrous (activation, administrateur, confirmation). Rien n'est publié par défaut.
 */
export default function EbayListingScreen() {
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const { active } = useActiveOrg();
  const orgId = active.organization.id;
  const prefill = useQuery({ queryKey: [orgId, "ebay-prefill", skuId], queryFn: () => fetchListingPrefill(orgId, skuId), retry: 0 });
  if (prefill.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="SKU" />
        <ErrorState description={userMessage(prefill.error)} onRetry={() => void prefill.refetch()} />
      </Screen>
    );
  if (prefill.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="SKU" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  return <ListingForm key={skuId} orgId={orgId} prefill={prefill.data} />;
}

function ListingForm({ orgId, prefill }: { orgId: string; prefill: EbayListingPrefillDTO }) {
  const toast = useToast();
  const setup = useQuery({ queryKey: [orgId, "ebay-setup"], queryFn: () => fetchEbayAccountSetup(orgId), retry: 0 });
  const [d, setD] = useState<EbayListingDraftDTO>(prefill.draft);
  const [images, setImages] = useState("");
  const [priceText, setPriceText] = useState(prefill.draft.price === null ? "" : String(prefill.draft.price).replace(".", ","));
  const [qtyText, setQtyText] = useState(String(prefill.draft.quantity));
  const [check, setCheck] = useState<EbayListingCheckDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const patch = (p: Partial<EbayListingDraftDTO>) => {
    setD({ ...d, ...p });
    setCheck(null);
  };
  const assembled = (): EbayListingDraftDTO => ({
    ...d,
    price: Number(priceText.replace(",", ".")) || null,
    quantity: Number.parseInt(qtyText, 10) || 0,
    imageUrls: images.split(/\s+/).map((u) => u.trim()).filter(Boolean),
  });

  async function verify() {
    setBusy(true);
    try {
      setCheck(await checkEbayListing(orgId, assembled()));
    } catch (e) {
      toast({ text: userMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setConfirming(false);
    setBusy(true);
    try {
      const r = await publishEbayListing(orgId, assembled());
      toast({ text: r.listingId ? `Annonce publiée sur eBay (n° ${r.listingId}).` : "Offre enregistrée chez eBay." });
    } catch (e) {
      toast({ text: userMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const s = setup.data;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <StickyActions>
            <Button label="Vérifier l'annonce" variant={check?.publication.allowed ? "secondary" : "primary"} loading={busy && !confirming} onPress={() => void verify()} style={{ flex: 1 }} testID="ebay-listing-check" />
            {check?.publication.allowed ? <Button label="Publier…" onPress={() => setConfirming(true)} style={{ flex: 1 }} /> : null}
          </StickyActions>
        }
      >
        <DetailHeader parentLabel="SKU" />
        <Txt variant="title2" accessibilityRole="header">
          Annonce eBay
        </Txt>
        <AlertBanner text="Préparation et contrôle uniquement : la publication reste désactivée tant que vous ne l'avez pas explicitement activée sur le serveur (EBAY_LISTING_ENABLED) et confirmée." tone="dark" />
        {prefill.notes.map((n) => (
          <Txt key={n} variant="label">
            {n}
          </Txt>
        ))}
        <Card padded style={{ gap: space[3] }}>
          <TextField label={`Titre (${d.title.length}/80)`} value={d.title} onChangeText={(v) => patch({ title: v })} maxLength={80} />
          <TextField label="Description" value={d.description} onChangeText={(v) => patch({ description: v })} multiline style={{ minHeight: 96 }} />
          <TextField label="Catégorie eBay (identifiant)" value={d.categoryId} onChangeText={(v) => patch({ categoryId: v.replace(/\D/g, "") })} keyboardType="number-pad" hint="Ex. 9355 : Téléphones mobiles et smartphones (à confirmer dans eBay)." />
          <TextField label="Prix (EUR)" value={priceText} onChangeText={(v) => (setPriceText(v), setCheck(null))} keyboardType="decimal-pad" />
          <TextField label="Quantité" value={qtyText} onChangeText={(v) => (setQtyText(v.replace(/\D/g, "")), setCheck(null))} keyboardType="number-pad" />
          <TextField label="Photos (URL HTTPS, une par ligne)" value={images} onChangeText={(v) => (setImages(v), setCheck(null))} multiline autoCapitalize="none" autoCorrect={false} />
        </Card>
        <SectionHeader title="État de l'objet" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {EBAY_CONDITIONS.map((c) => (
            <FilterChip key={c} label={EBAY_CONDITION_LABEL[c]} selected={d.condition === c} onPress={() => patch({ condition: c })} />
          ))}
        </ScrollView>

        <SectionHeader title="Compte eBay" />
        {setup.isPending ? <SkeletonList rows={2} thumb={false} /> : null}
        {s && (!s.configured || !s.connected || s.errors.length) ? <AlertBanner text={[...(!s.configured ? ["Clés eBay non configurées sur le serveur."] : []), ...(s.configured && !s.connected ? ["Aucun compte eBay connecté."] : []), ...s.errors].join(" ")} /> : null}
        {s?.connected ? (
          <Card padded style={{ gap: space[2] }}>
            {(
              [
                ["Expédition", s.fulfillment, "fulfillmentPolicyId"],
                ["Paiement", s.payment, "paymentPolicyId"],
                ["Retours", s.return, "returnPolicyId"],
              ] as const
            ).map(([label, list, key]) => (
              <View key={key} style={{ gap: 4 }}>
                <Txt variant="label">{label}</Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
                  {list.length === 0 ? <Txt variant="label" color={color.danger}>Aucune politique : créez-la dans eBay (Compte → Politiques).</Txt> : null}
                  {list.map((p) => (
                    <FilterChip
                      key={p.id}
                      label={p.name || p.id}
                      selected={d.policies?.[key] === p.id}
                      onPress={() => patch({ policies: { fulfillmentPolicyId: d.policies?.fulfillmentPolicyId ?? "", paymentPolicyId: d.policies?.paymentPolicyId ?? "", returnPolicyId: d.policies?.returnPolicyId ?? "", [key]: p.id } })}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}
            <Txt variant="label">Emplacement d'inventaire</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
              {s.locations.length === 0 ? <Txt variant="label" color={color.danger}>Aucun emplacement : à créer chez eBay (adresse d'expédition).</Txt> : null}
              {s.locations.map((l) => (
                <FilterChip key={l.id} label={l.name || l.id} selected={d.merchantLocationKey === l.id} onPress={() => patch({ merchantLocationKey: l.id })} />
              ))}
            </ScrollView>
          </Card>
        ) : null}

        {check ? (
          <>
            <SectionHeader title="Résultat du contrôle" />
            <Card padded style={{ gap: 4 }}>
              {check.errors.map((e) => (
                <Txt key={e} variant="body" color={color.danger}>
                  ✕ {e}
                </Txt>
              ))}
              {check.warnings.map((w) => (
                <Txt key={w} variant="label">
                  ! {w}
                </Txt>
              ))}
              {check.ok ? <Txt variant="body" color={color.success}>Annonce complète.</Txt> : null}
              {!check.publication.allowed ? (
                <Txt variant="label" color={color.ink2}>
                  Publication impossible pour l'instant : {check.publication.blockers.join(" ") || "corrigez les erreurs ci-dessus."}
                </Txt>
              ) : null}
            </Card>
          </>
        ) : null}
      </Screen>
      <BottomSheet visible={confirming} onClose={() => setConfirming(false)} title="Publier sur eBay ?" description={`« ${d.title} » sera mise en vente sur eBay.fr à ${priceText} € (${qtyText} unité(s)). Une annonce existante pour ce SKU est mise à jour, jamais dupliquée.`}>
        <Button label="Publier maintenant" loading={busy} onPress={() => void publish()} />
        <Button label="Annuler" variant="ghost" onPress={() => setConfirming(false)} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
