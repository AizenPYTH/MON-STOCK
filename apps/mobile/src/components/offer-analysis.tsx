import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ExternalLink, Store, TriangleAlert, X } from "lucide-react-native";
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO } from "~/data/supplier-search";
import { frenchTitle, shortSupplierName } from "@/domain/sourcing/offer-display";
import { formatMoney, formatNumber, formatRelative } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { SupplierLogo } from "~/components/supplier-logo";
import { AccessTag, open, rulerCaption, rulerEmptyCaption } from "~/components/offer-result";
import { DealBadge, MarginWaterfall, MarketRuler, MonoTitle, ScoreBar, StageFigure, Txt, useReduceMotion, type WaterfallLine } from "~/components/ui";
import { color, radius, shadow, space } from "~/theme/tokens";
import { useLayout } from "~/theme/layout";

/**
 * Feuille d'analyse d'une offre (v5) : marge estimée, position face au marché, décomposition par
 * unité, points à vérifier. Uniquement les montants calculés par le serveur (analyse « bonne
 * affaire ») ; sans comparaison possible, le résumé du serveur remplace la marge. Rien n'est
 * commandé ni envoyé au fournisseur depuis cette feuille.
 */
export type AnalyzedOffer = (SimpleOfferDTO | SimpleRankedOfferDTO) & { supplierName?: string; domain?: string | null };

/** Lignes de la cascade de marge à partir de l'analyse du serveur (jamais de coût supposé). Pur. */
export function waterfallLines(d: SimpleDealDTO): WaterfallLine[] {
  if (d.resalePrice === null || d.margin === null) return [];
  const resale = d.resaleBasis === "own_sales" ? "vos ventes 30 j" : d.resaleBasis === "own_price" ? "votre prix" : d.resaleBasis === "marketplace_low" ? "bas du marché" : undefined;
  const lines: WaterfallLine[] = [{ label: "Revente", note: resale, amount: d.resalePrice, kind: "base" }];
  if (d.supplierPrice !== null) lines.push({ label: "Achat", note: "HT", amount: d.supplierPrice, kind: "minus" });
  if (d.totalCost !== null && d.supplierPrice !== null && d.totalCost - d.supplierPrice > 0.005) lines.push({ label: "Frais d'achat", note: "port, change", amount: Math.round((d.totalCost - d.supplierPrice) * 100) / 100, kind: "minus" });
  const rest = d.totalCost !== null ? Math.round((d.resalePrice - d.totalCost - d.margin) * 100) / 100 : null;
  if (rest !== null && rest > 0.005) lines.push({ label: "Frais de vente et taxes", note: "paramètres", amount: rest, kind: "minus" });
  lines.push({ label: "Marge estimée", amount: d.margin, kind: "result" });
  return lines;
}

export function OfferAnalysisSheet({ offer, orgCurrency, supplierKey, onClose }: { offer: AnalyzedOffer | null; orgCurrency: string; supplierKey: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { screenX, maxWidth } = useLayout();
  const visible = offer !== null;
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: color.overlay }}>
        <Pressable style={{ height: Math.max(insets.top, 20) + 24 }} accessibilityRole="button" accessibilityLabel="Fermer l'analyse" onPress={onClose} />
        {offer ? (
          <View accessibilityViewIsModal style={[{ flex: 1, backgroundColor: color.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: "hidden", width: "100%", maxWidth, alignSelf: "center" }, shadow.sheet]}>
            <Body offer={offer} orgCurrency={orgCurrency} supplierKey={supplierKey} onClose={onClose} screenX={screenX} bottom={insets.bottom} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Body({ offer: o, orgCurrency, supplierKey, onClose, screenX, bottom }: { offer: AnalyzedOffer; orgCurrency: string; supplierKey: string | null; onClose: () => void; screenX: number; bottom: number }) {
  const d = o.deal ?? null;
  const link = safeExternalUrl(o.url);
  const name = o.supplierName ? shortSupplierName(o.supplierName) : "Fournisseur";
  const title = frenchTitle(o.title);
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, orgCurrency));
  const meta = [o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : o.stock === "out_of_stock" ? "en rupture" : null, o.seenAt ? `vu ${formatRelative(o.seenAt)}` : null].filter(Boolean).join(" · ");
  const lines = d ? waterfallLines(d) : [];
  const shareOfResale = d && d.margin !== null && d.resalePrice ? Math.round((d.margin / d.resalePrice) * 1000) / 10 : null;
  return (
    <>
      <View style={{ paddingTop: 8, paddingHorizontal: screenX, paddingBottom: space[3], gap: space[3], backgroundColor: color.card, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineStrong }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <SupplierLogo domain={o.domain ?? null} name={name} size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt variant="body" style={{ fontFamily: "Manrope_700Bold", flexShrink: 1 }} numberOfLines={1}>
                {name}
              </Txt>
              {o.access === "account" ? <AccessTag access="account" /> : null}
            </View>
            {meta ? (
              <Txt variant="code" numberOfLines={1} style={{ textTransform: "uppercase", fontSize: 10.5 }}>
                {meta}
              </Txt>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} hitSlop={8} style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, backgroundColor: pressed ? color.surfacePressed : color.bg, alignItems: "center", justifyContent: "center" })}>
            <X size={16} color={color.ink} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: screenX, paddingBottom: space[6], gap: space[5] }}>
        <View style={{ gap: 10 }}>
          <Txt variant="cardTitle" accessibilityRole="header">
            {title}
          </Txt>
          {d ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
              <DealBadge level={d.level} label={d.label} provisional={d.provisional} />
              {d.score !== null ? <ScoreBar score={d.score} /> : null}
            </View>
          ) : null}
        </View>

        {d && d.margin !== null ? (
          <View style={{ gap: space[3] }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space[3] }}>
              <View style={{ gap: 4, flexShrink: 1 }}>
                <Txt variant="monoSm">Marge estimée par unité</Txt>
                <StageFigure value={`≈ ${d.margin >= 0 ? "+" : "−"}${formatMoney(Math.abs(d.margin), orgCurrency)}`} size="sheet" onDark={false} tone={d.margin >= 0 ? color.success : color.dangerInk} />
              </View>
              {shareOfResale !== null ? (
                <Txt variant="label" style={{ textAlign: "right", maxWidth: 120 }}>
                  <Txt variant="label" num color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
                    {formatNumber(shareOfResale)} %
                  </Txt>
                  {"\n"}du prix de revente
                </Txt>
              ) : null}
            </View>
            {d.provisional ? (
              <Pressable accessibilityRole="link" accessibilityLabel={`Marge provisoire : coûts non comptés (${d.missingCosts.join(", ")}). Compléter mes coûts`} onPress={() => (onClose(), router.push("/radar/settings"))}>
                <Txt variant="note" color={color.accentInkOnSoft}>
                  Provisoire · <Txt variant="note" color={color.accentInkOnSoft} style={{ fontFamily: "Manrope_700Bold", textDecorationLine: "underline" }}>compléter mes coûts</Txt>
                </Txt>
              </Pressable>
            ) : null}
            <MarketRuler large cost={d.totalCost} market={d.marketPrice} resale={d.resalePrice} caption={rulerCaption(d, orgCurrency)} emptyCaption={rulerEmptyCaption(d)} />
          </View>
        ) : (
          <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: color.lineStrong, borderRadius: radius.card, padding: space[4], gap: 6 }}>
            <Txt variant="body">{d ? d.label : "Analyse indisponible"}</Txt>
            <Txt variant="bodyRegular">{d ? d.summary : "Aucune offre équivalente pour comparer ce prix."}</Txt>
          </View>
        )}

        {lines.length > 0 ? (
          <View style={{ gap: 10 }}>
            <MonoTitle title="Calcul par unité" />
            <MarginWaterfall lines={lines} format={(n) => money(n)} />
          </View>
        ) : null}

        {d && d.uncertainties.length > 0 ? (
          <View style={{ gap: 10 }}>
            <MonoTitle title="À vérifier avant d'acheter" />
            <View style={{ gap: 8 }}>
              {d.uncertainties.map((u) => (
                <View key={u} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <TriangleAlert size={15} color={color.accentInkOnSoft} strokeWidth={2.2} style={{ marginTop: 2 }} />
                  <Txt variant="label" color={color.accentInkOnSoft} style={{ flex: 1 }}>
                    {u}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Txt variant="note">Estimation sur vos paramètres de coûts. Rien n'est commandé ni envoyé au fournisseur.</Txt>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, paddingTop: space[3], paddingHorizontal: screenX, paddingBottom: Math.max(bottom, space[3]) + space[2], backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line }}>
        {supplierKey ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Fiche du fournisseur ${name}`}
            onPress={() => (onClose(), router.push({ pathname: "/supplier-directory/[key]", params: { key: supplierKey } }))}
            style={({ pressed }) => ({ width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.surfacePressed : color.card, alignItems: "center", justifyContent: "center" })}
          >
            <Store size={20} color={color.ink} strokeWidth={2} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Voir l'offre chez ${name}`}
          disabled={!link}
          onPress={() => open(link)}
          style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: radius.lg, backgroundColor: !link ? color.surfaceSunken : pressed ? color.mintPressed : color.mint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 })}
        >
          <ExternalLink size={18} color={link ? color.onMint : color.ink3} strokeWidth={2.2} />
          <Txt variant="button" color={link ? color.onMint : color.ink3}>
            {link ? "Voir l'offre" : "Lien indisponible"}
          </Txt>
        </Pressable>
      </View>
    </>
  );
}
