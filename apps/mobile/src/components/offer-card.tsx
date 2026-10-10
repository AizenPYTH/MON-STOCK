import { Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink } from "lucide-react-native";
import type { SourcingOfferDTO } from "@/features/mobile-api/contract";
import { classifyOffer, OFFER_CLASS_HELP, OFFER_CLASS_LABEL, type OfferClass } from "~/data/sourcing-live";
import { formatDateTime, formatMoney, formatNumber } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { Card, StatusChip, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

const CLASS_TONE: Record<OfferClass, "success" | "accent" | "neutral"> = { verified: "success", published: "accent", indicative: "neutral" };
const CONDITION: Record<string, string> = { new: "Neuf", refurbished: "Reconditionné", used: "Occasion" };
const TAX: Record<string, string> = { ht: "HT", ttc: "TTC" };

function money(v: number | null, currency: string | null): string {
  if (v === null) return "—";
  return currency ? formatMoney(v, currency) : `${formatNumber(v)} (devise non communiquée)`;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[3] }}>
      <Txt variant="label">{label}</Txt>
      <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700], flexShrink: 1, textAlign: "right" }}>
        {value}
      </Txt>
    </View>
  );
}

/** Offre fournisseur : uniquement des données relevées (inconnu = « non communiqué »), classe honnête, lien direct. */
export function OfferCard({ offer: o, orgCurrency }: { offer: SourcingOfferDTO; orgCurrency: string }) {
  const cls = classifyOffer(o);
  const url = safeExternalUrl(o.sourceUrl);
  const seen = o.provenance?.retrievedAt ?? o.lastSeenAt;
  const condition = [o.condition ? (CONDITION[o.condition] ?? null) : null, o.grade ? `Grade ${o.grade}` : null].filter(Boolean).join(" · ");
  const stock =
    o.quantityAvailable !== null ? `${formatNumber(o.quantityAvailable)} en stock (selon la source)` : o.stockStatus === "in_stock" ? "En stock (sans quantité)" : o.stockStatus === "out_of_stock" ? "Rupture" : "Non communiquée";
  return (
    <Card padded style={{ gap: space[3] }} accessibilityLabel={`${o.title}, ${o.supplierName}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space[3] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">{o.supplierName}{o.supplierCountry ? ` · ${o.supplierCountry}` : ""}</Txt>
          <Txt variant="body" numberOfLines={3}>
            {o.title}
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt variant="kpiSm" num>
            {money(o.price, o.currency)}
          </Txt>
          {o.taxType && TAX[o.taxType] ? <Txt variant="label">{TAX[o.taxType]}</Txt> : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        <StatusChip label={OFFER_CLASS_LABEL[cls]} tone={CLASS_TONE[cls]} />
        {condition ? <StatusChip label={condition} tone="neutral" /> : null}
      </View>
      <Txt variant="label">{OFFER_CLASS_HELP[cls]}</Txt>
      <View style={{ gap: 4 }}>
        <Line label="Frais de port" value={o.shippingCost === null ? "Non communiqués" : o.shippingCost === 0 ? "Offerts (selon la source)" : money(o.shippingCost, o.shippingCurrency ?? o.currency)} />
        <Line label="Quantité minimale" value={o.moq === null ? "Non communiquée" : formatNumber(o.moq)} />
        <Line label="Disponibilité" value={stock} />
        {o.landedUnitCost !== null ? <Line label="Coût rendu unitaire" value={formatMoney(o.landedUnitCost, orgCurrency)} /> : null}
        {o.procurement.totalCost !== null && o.procurement.unitsToBuy > 1 ? <Line label={`Coût total (${formatNumber(o.procurement.unitsToBuy)} u.)`} value={formatMoney(o.procurement.totalCost, orgCurrency)} /> : null}
        {o.marginNetProfit !== null ? <Line label="Marge nette estimée / unité" value={formatMoney(o.marginNetProfit, orgCurrency)} /> : o.marginUnavailableReason ? <Line label="Marge" value={o.marginUnavailableReason} /> : null}
        <Line label="Dernière vérification" value={seen ? formatDateTime(seen) : "Inconnue"} />
      </View>
      {url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Voir l'offre chez ${o.supplierName}`}
          onPress={() => void WebBrowser.openBrowserAsync(url).catch(() => {})}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1, minHeight: 32 })}
        >
          <ExternalLink size={16} color={color.ink} />
          <Txt variant="body" style={{ textDecorationLine: "underline" }}>
            Voir l'offre chez le fournisseur
          </Txt>
        </Pressable>
      ) : (
        <Txt variant="label">Lien de l'offre non communiqué.</Txt>
      )}
    </Card>
  );
}
