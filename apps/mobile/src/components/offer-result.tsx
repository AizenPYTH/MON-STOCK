import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronDown, ExternalLink, Store } from "lucide-react-native";
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO } from "~/data/supplier-search";
import { STOCK_TEXT } from "~/data/supplier-search";
import { formatMoney, formatNumber, formatRelative } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { SupplierLogo } from "~/components/supplier-logo";
import { cardStyle, DealBadge, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Résultat d'offre fournisseur, en deux densités :
 *  - détaillée : identification du produit, prix d'achat et marge estimée mis en avant, origine
 *    (votre compte / public / place de marché), fraîcheur du prix, détail du calcul repliable ;
 *  - compacte : une ligne par offre pour comparer vite.
 * Toute estimation est marquée « ≈ » ; une marge provisoire l'indique ; rien n'est inventé.
 */

export type OfferDensity = "detailed" | "compact";

const ACCESS_LABEL = { account: "Votre compte", public: "Source publique", marketplace: "Place de marché" } as const;
const ACCESS_STYLE = {
  account: { bg: color.brand, fg: color.inkOnDark },
  public: { bg: color.infoSoft, fg: color.infoInk },
  marketplace: { bg: color.surfaceSunken, fg: color.ink2 },
} as const;

const money = (v: number | null, cur: string) => (v === null ? "—" : formatMoney(v, cur));
const STALE_DAYS = 7;

function ageDays(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

export function AccessTag({ access }: { access: keyof typeof ACCESS_LABEL }) {
  const st = ACCESS_STYLE[access];
  return (
    <View style={{ paddingVertical: 2, paddingHorizontal: 6, borderRadius: radius.xs, backgroundColor: st.bg }}>
      <Txt variant="micro" color={st.fg} style={{ letterSpacing: 0, fontSize: 10 }}>
        {ACCESS_LABEL[access]}
      </Txt>
    </View>
  );
}

function priceParts(o: SimpleOfferDTO, orgCurrency: string) {
  const price = o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "Prix non indiqué";
  const tax = o.price === null ? "" : o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : "HT/TTC ?";
  const converted = o.currency && o.currency !== orgCurrency && o.priceConverted !== null ? `≈ ${formatMoney(o.priceConverted, orgCurrency)}` : null;
  return { price, tax, converted };
}

function stockText(o: SimpleOfferDTO) {
  return o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : STOCK_TEXT[o.stock];
}

function open(link: string | null) {
  if (link) void WebBrowser.openBrowserAsync(link).catch(() => {});
}

/** Marge mise en avant : montant estimé (≈), pourcentage, « provisoire » si des coûts manquent. */
function MarginBlock({ deal: d, orgCurrency, compact = false }: { deal: SimpleDealDTO; orgCurrency: string; compact?: boolean }) {
  if (d.margin === null) return null;
  const positive = d.margin > 0;
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Txt variant={compact ? "label" : "price"} num color={positive ? color.success : color.dangerInk} style={compact ? { fontFamily: fontFamily[800], fontSize: 12.5 } : { fontSize: 17 }}>
        Marge ≈ {positive ? "+" : ""}
        {money(d.margin, orgCurrency)}
      </Txt>
      {!compact ? (
        <Txt variant="micro" num color={d.provisional ? color.accentInkOnSoft : color.ink3} style={{ letterSpacing: 0 }}>
          {d.marginPercent !== null ? `${formatNumber(d.marginPercent)} %` : ""}
          {d.provisional ? `${d.marginPercent !== null ? " · " : ""}provisoire` : ""}
        </Txt>
      ) : null}
    </View>
  );
}

/** Détail du calcul (prix marché, coût total, revente, réserves), replié par défaut. */
export function DealLines({ deal: d, orgCurrency }: { deal: SimpleDealDTO; orgCurrency: string }) {
  const basis = d.marketBasis === "marketplace" ? `${d.marketCount} annonce${d.marketCount > 1 ? "s" : ""} équivalente${d.marketCount > 1 ? "s" : ""}` : d.marketBasis === "suppliers" ? `${d.marketCount} autres fournisseurs` : null;
  const resale = d.resaleBasis === "own_sales" ? "vos ventes" : d.resaleBasis === "own_price" ? "votre prix" : d.resaleBasis === "marketplace_low" ? "bas du marché" : null;
  return (
    <View style={{ gap: 3 }} accessibilityLabel={`Analyse : ${d.label}. ${d.summary}`}>
      {d.comparable || d.marketPrice !== null ? (
        <>
          <Txt variant="label" num>
            Prix fournisseur {money(d.supplierPrice, orgCurrency)} · Marché ≈ {money(d.marketPrice, orgCurrency)}
            {basis ? ` (${basis})` : ""}
          </Txt>
          <Txt variant="label" num>
            Coût total ≈ {money(d.totalCost, orgCurrency)} · Revente ≈ {money(d.resalePrice, orgCurrency)}
            {resale ? ` (${resale})` : ""}
          </Txt>
          {d.missingCosts.length > 0 ? (
            <Txt variant="label" color={color.accentInkOnSoft}>
              Coûts non comptés : {d.missingCosts.slice(0, 4).join(", ")}
            </Txt>
          ) : null}
        </>
      ) : null}
      <Txt variant="label" color={color.ink2}>
        {d.summary}
        {d.score !== null ? ` · score ${d.score}/100` : ""}
      </Txt>
      {d.uncertainties.length > 0 ? (
        <Txt variant="label" color={color.accentInkOnSoft} numberOfLines={4}>
          À vérifier : {d.uncertainties.slice(0, 3).join(" · ")}
          {d.uncertainties.length > 3 ? ` (+${d.uncertainties.length - 3})` : ""}
        </Txt>
      ) : null}
    </View>
  );
}

/** Carte détaillée d'une offre. */
export function OfferCard({ offer: o, orgCurrency, supplierName, domain, supplierKey, testID }: { offer: SimpleOfferDTO | SimpleRankedOfferDTO; orgCurrency: string; supplierName?: string; domain?: string | null; supplierKey?: string | null; testID?: string }) {
  const [details, setDetails] = useState(false);
  const link = safeExternalUrl(o.url);
  const { price, tax, converted } = priceParts(o, orgCurrency);
  const age = ageDays(o.seenAt);
  const stale = age !== null && age > STALE_DAYS;
  const d = o.deal ?? null;
  return (
    <View style={[cardStyle, { padding: space[4], gap: space[3] }]} testID={testID}>
      <Pressable
        disabled={!link}
        onPress={() => open(link)}
        accessibilityRole={link ? "link" : undefined}
        accessibilityLabel={`${o.title}, ${price}${supplierName ? `, chez ${supplierName}` : ""}`}
        style={({ pressed }) => ({ gap: space[2], opacity: pressed ? 0.75 : 1 })}
      >
        {supplierName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <SupplierLogo domain={domain ?? null} name={supplierName} size={24} />
            <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700], flexShrink: 1 }} numberOfLines={1}>
              {supplierName}
            </Txt>
            {o.access ? <AccessTag access={o.access} /> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start" }}>
          <Txt variant="body" numberOfLines={2} style={{ flex: 1, fontSize: 15.5, lineHeight: 21 }}>
            {o.title}
          </Txt>
          <View style={{ alignItems: "flex-end", maxWidth: "42%" }}>
            <Txt variant="price" num numberOfLines={1} adjustsFontSizeToFit>
              {price}
            </Txt>
            {tax || converted ? (
              <Txt variant="micro" num style={{ letterSpacing: 0 }}>
                {[tax, converted].filter(Boolean).join(" · ")}
              </Txt>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space[3], rowGap: 2 }}>
          <Txt variant="label" color={o.stock === "out_of_stock" ? color.dangerInk : o.stock === "in_stock" ? color.success : color.ink2} style={{ fontFamily: fontFamily[700] }}>
            {stockText(o)}
          </Txt>
          {o.seenAt ? (
            <Txt variant="label" color={stale ? color.accentInkOnSoft : color.ink3}>
              {stale ? "Prix relevé " : "Vu "}
              {formatRelative(o.seenAt)}
            </Txt>
          ) : null}
        </View>
      </Pressable>

      {d ? (
        <View style={{ borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space[3], gap: space[2] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
            <DealBadge level={d.level} label={d.label} provisional={d.provisional} />
            <MarginBlock deal={d} orgCurrency={orgCurrency} />
          </View>
          {details ? <DealLines deal={d} orgCurrency={orgCurrency} /> : null}
        </View>
      ) : null}

      {link || supplierKey || d ? (
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
          {link ? (
            <Pressable onPress={() => open(link)} accessibilityRole="link" accessibilityLabel={`Voir l'offre chez ${supplierName ?? "le fournisseur"}`} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed ? color.surfacePressed : color.surfaceSunken })}>
              <ExternalLink size={14} color={color.ink} />
              <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                Voir l'offre
              </Txt>
            </Pressable>
          ) : null}
          {supplierKey ? (
            <Pressable onPress={() => router.push({ pathname: "/supplier-directory/[key]", params: { key: supplierKey } })} accessibilityRole="button" accessibilityLabel={`Fiche du fournisseur ${supplierName ?? ""}`} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed ? color.surfacePressed : color.surfaceSunken })}>
              <Store size={14} color={color.ink} />
              <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                Fournisseur
              </Txt>
            </Pressable>
          ) : null}
          {d ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} accessibilityLabel={details ? "Masquer le détail du calcul" : "Voir le détail du calcul"} onPress={() => setDetails((v) => !v)} hitSlop={8} style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 8 }}>
              <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700] }}>
                {details ? "Masquer" : "Calcul"}
              </Txt>
              <ChevronDown size={14} color={color.ink} style={{ transform: [{ rotate: details ? "180deg" : "0deg" }] }} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Ligne compacte : comparer beaucoup d'offres d'un coup d'œil. */
export function OfferLine({ offer: o, orgCurrency, supplierName, domain, last }: { offer: SimpleOfferDTO; orgCurrency: string; supplierName?: string; domain?: string | null; last: boolean }) {
  const link = safeExternalUrl(o.url);
  const { price, tax } = priceParts(o, orgCurrency);
  const d = o.deal ?? null;
  return (
    <Pressable
      disabled={!link}
      onPress={() => open(link)}
      accessibilityRole={link ? "link" : undefined}
      accessibilityLabel={`${o.title}, ${price}${supplierName ? `, chez ${supplierName}` : ""}${d ? `, ${d.label}` : ""}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: 10, paddingHorizontal: space[3], backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: color.lineSoft })}
    >
      {supplierName ? <SupplierLogo domain={domain ?? null} name={supplierName} size={28} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt variant="body" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>
          {o.title}
        </Txt>
        <Txt variant="label" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
          {[supplierName, o.access ? ACCESS_LABEL[o.access] : null, stockText(o)].filter(Boolean).join(" · ")}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Txt variant="body" num style={{ fontFamily: fontFamily[800] }}>
          {price}
          {tax && tax !== "HT/TTC ?" ? ` ${tax}` : ""}
        </Txt>
        {d && d.margin !== null ? <MarginBlock deal={d} orgCurrency={orgCurrency} compact /> : d ? <DealBadge level={d.level} label={d.label} size="sm" /> : null}
      </View>
    </Pressable>
  );
}

/** Liste compacte dans une carte. */
export function OfferLines({ offers, orgCurrency }: { offers: (SimpleRankedOfferDTO | (SimpleOfferDTO & { supplierName?: string; domain?: string | null }))[]; orgCurrency: string }) {
  return (
    <View style={[cardStyle, { overflow: "hidden" }]}>
      {offers.map((o, i) => (
        <OfferLine key={o.id} offer={o} orgCurrency={orgCurrency} supplierName={"supplierName" in o ? o.supplierName : undefined} domain={"domain" in o ? (o.domain ?? null) : null} last={i === offers.length - 1} />
      ))}
    </View>
  );
}
