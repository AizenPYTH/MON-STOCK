import { Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink } from "lucide-react-native";
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO } from "~/data/supplier-search";
import { STOCK_TEXT } from "~/data/supplier-search";
import { formatMoney, formatNumber, formatRelative } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { frenchTitle, shortSupplierName } from "@/domain/sourcing/offer-display";
import { SupplierLogo } from "~/components/supplier-logo";
import { cardStyle, DealBadge, MarketRuler, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";
import { fontFamily } from "~/theme/typography";

/**
 * Résultat d'offre fournisseur, en deux densités (carte / ligne compacte). Titres traduits en
 * français par glossaire (titre d'origine annoncé au lecteur d'écran). Prix et marge estimée mis en
 * avant ; toute estimation est marquée « ≈ » et « provisoire » si des coûts manquent.
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

export function open(link: string | null) {
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

/** Légende de la règle de marché (coût rendu, médiane du marché, écart), en capitales mono. */
export function rulerCaption(d: SimpleDealDTO, orgCurrency: string): string | undefined {
  if (d.totalCost === null || d.marketPrice === null) return undefined;
  const gap = d.marketPrice > 0 ? Math.round((d.totalCost / d.marketPrice - 1) * 1000) / 10 : null;
  return `Coût ${money(d.totalCost, orgCurrency)} · marché ${money(d.marketPrice, orgCurrency)} (${d.marketCount})${gap !== null ? ` · ${gap > 0 ? "+" : "−"}${formatNumber(Math.abs(gap))} %` : ""}`;
}

export function rulerEmptyCaption(d: SimpleDealDTO): string {
  return `Pas assez d'offres équivalentes (${d.marketCount} trouvée${d.marketCount > 1 ? "s" : ""})`;
}

/**
 * Carte d'une offre v5 (hauteur stable) : fournisseur et âge du prix ; titre en français et prix ;
 * règle de marché (coût rendu face à la médiane des offres équivalentes) ; niveau, marge, stock.
 * Toucher la carte ouvre l'analyse ; l'icône ouvre l'offre chez le fournisseur.
 */
export function OfferCard({ offer: o, orgCurrency, supplierName, domain, onAnalyze, testID }: { offer: SimpleOfferDTO | SimpleRankedOfferDTO; orgCurrency: string; supplierName?: string; domain?: string | null; supplierKey?: string | null; onAnalyze?: (o: SimpleOfferDTO | SimpleRankedOfferDTO) => void; testID?: string }) {
  const link = safeExternalUrl(o.url);
  const { price, tax, converted } = priceParts(o, orgCurrency);
  const age = ageDays(o.seenAt);
  const stale = age !== null && age > STALE_DAYS;
  const d = o.deal ?? null;
  const title = frenchTitle(o.title);
  const name = supplierName ? shortSupplierName(supplierName) : null;
  const a11y = `${title}, ${price}${tax && tax !== "HT/TTC ?" ? ` ${tax}` : ""}${name ? `, chez ${name}` : ""}${d ? `, ${d.label}${d.margin !== null ? `, marge estimée ${money(d.margin, orgCurrency)}` : ""}` : ""}`;
  return (
    <Pressable
      testID={testID}
      onPress={onAnalyze ? () => onAnalyze(o) : link ? () => open(link) : undefined}
      disabled={!onAnalyze && !link}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={onAnalyze ? "Ouvre l'analyse de rentabilité" : title !== o.title ? `Titre d'origine : ${o.title}` : undefined}
      style={({ pressed }) => [cardStyle, { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, gap: 10, backgroundColor: pressed ? color.surfacePressed : color.card }]}
    >
      {name ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 24 }}>
          <SupplierLogo domain={domain ?? null} name={name} size={24} />
          <Txt variant="label" color={color.ink} style={{ fontFamily: fontFamily[700], flexShrink: 1 }} numberOfLines={1}>
            {name}
          </Txt>
          {o.access === "account" ? <AccessTag access="account" /> : null}
          <View style={{ flex: 1 }} />
          {o.seenAt ? (
            <Txt variant="code" color={stale ? color.accentInkOnSoft : color.ink3} numberOfLines={1}>
              {formatRelative(o.seenAt)}
            </Txt>
          ) : null}
          {link ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Ouvrir l'offre chez ${name}`} hitSlop={10} onPress={() => open(link)} style={{ paddingLeft: 4 }}>
              <ExternalLink size={14} color={color.ink3} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start", minHeight: 40 }}>
        <Txt variant="body" numberOfLines={2} style={{ flex: 1 }}>
          {title}
        </Txt>
        <View style={{ alignItems: "flex-end", maxWidth: "42%" }}>
          <Txt variant="price" num numberOfLines={1} adjustsFontSizeToFit>
            {price}
          </Txt>
          {(tax && tax !== "HT/TTC ?") || converted ? (
            <Txt variant="code" num style={{ fontSize: 10.5 }}>
              {[tax !== "HT/TTC ?" ? tax : "", converted].filter(Boolean).join(" · ")}
            </Txt>
          ) : null}
        </View>
      </View>
      {d ? <MarketRuler cost={d.totalCost} market={d.marketPrice} caption={rulerCaption(d, orgCurrency)} emptyCaption={rulerEmptyCaption(d)} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 24 }}>
        {d && d.level !== "insufficient_data" ? <DealBadge level={d.level} label={d.label} provisional={d.provisional} size="sm" /> : null}
        {d && d.margin !== null ? (
          <Txt variant="label" num color={d.margin > 0 ? color.success : color.dangerInk} style={{ fontFamily: fontFamily[800], fontSize: 13.5 }}>
            ≈ {d.margin > 0 ? "+" : "−"}
            {money(Math.abs(d.margin), orgCurrency)}
          </Txt>
        ) : null}
        <View style={{ flex: 1 }} />
        <Txt variant="label" numberOfLines={1} color={o.stock === "out_of_stock" ? color.dangerInk : o.stock === "in_stock" || o.stock === "low" ? color.success : color.ink2} style={{ fontFamily: fontFamily[700], fontSize: 12.5 }}>
          {stockText(o)}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Ligne compacte : comparer beaucoup d'offres d'un coup d'œil. */
export function OfferLine({ offer: o, orgCurrency, supplierName, domain, last }: { offer: SimpleOfferDTO; orgCurrency: string; supplierName?: string; domain?: string | null; last: boolean }) {
  const link = safeExternalUrl(o.url);
  const { price, tax } = priceParts(o, orgCurrency);
  const d = o.deal ?? null;
  const title = frenchTitle(o.title);
  const name = supplierName ? shortSupplierName(supplierName) : undefined;
  return (
    <Pressable
      disabled={!link}
      onPress={() => open(link)}
      accessibilityRole={link ? "link" : undefined}
      accessibilityLabel={`${title}, ${price}${name ? `, chez ${name}` : ""}${d ? `, ${d.label}` : ""}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: 10, paddingHorizontal: space[3], backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: color.lineSoft })}
    >
      {name ? <SupplierLogo domain={domain ?? null} name={name} size={28} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt variant="body" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>
          {title}
        </Txt>
        <Txt variant="label" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
          {[name, o.access === "account" ? ACCESS_LABEL.account : null, stockText(o)].filter(Boolean).join(" · ")}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Txt variant="body" num style={{ fontFamily: fontFamily[800] }}>
          {price}
          {tax && tax !== "HT/TTC ?" ? ` ${tax}` : ""}
        </Txt>
        {d && d.margin !== null ? <MarginBlock deal={d} orgCurrency={orgCurrency} compact /> : null}
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
