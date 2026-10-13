import { useState } from "react";
import { Pressable, RefreshControl, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink, Search, Truck } from "lucide-react-native";
import { useSupplierSearch } from "~/data/hooks";
import { STOCK_TEXT, type SimpleOfferDTO, type SimpleSupplierResultDTO } from "~/data/supplier-search";
import { fontFamily } from "~/theme/typography";
import { userMessage } from "~/lib/errors";
import { formatMoney, formatNumber } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { Button, Card, EmptyState, ErrorState, FilterChip, Screen, Skeleton, TabHeader, Txt } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

const EXAMPLES = ["iPhone 13", "iPhone 15 Pro", "Écran iPhone 12", "Batterie iPhone 11"];

/**
 * Fournisseurs : on tape ce qu'on cherche, l'application interroge les fournisseurs et affiche
 * les résultats fournisseur par fournisseur, avec les prix, du moins cher au plus cher.
 */
export default function SuppliersScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState(params.q ?? "");
  const [submitted, setSubmitted] = useState(params.q ?? "");
  const [appliedParam, setAppliedParam] = useState(params.q ?? "");
  // arrivée depuis une fiche produit alors que l'onglet est déjà ouvert
  if ((params.q ?? "") !== appliedParam) {
    setAppliedParam(params.q ?? "");
    if (params.q) {
      setDraft(params.q);
      setSubmitted(params.q);
    }
  }
  const search = useSupplierSearch(submitted);
  const run = (q: string) => {
    const t = q.trim();
    setDraft(t);
    setSubmitted(t);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={search.isRefetching} onRefresh={() => (submitted ? void search.refetch() : undefined)} />}>
      <TabHeader title="Fournisseurs" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 52, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space[3] }}>
        <Search size={18} color={color.ink3} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => run(draft)}
          placeholder="Que cherchez-vous ? Ex. iPhone 13"
          placeholderTextColor={color.ink3}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Rechercher chez les fournisseurs"
          maxFontSizeMultiplier={1.6}
          style={{ flex: 1, fontFamily: fontFamily[600], fontSize: 16, color: color.ink, paddingVertical: 0 }}
          testID="supplier-query"
        />
        <Button label="Chercher" compact disabled={draft.trim().length < 2} loading={search.isFetching} onPress={() => run(draft)} testID="supplier-search" />
      </View>

      {!submitted ? (
        <View style={{ gap: space[3] }}>
          <Txt variant="bodyRegular">Tapez un produit : on regarde chez vos fournisseurs et on affiche ce qu'ils ont, avec leurs prix.</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {EXAMPLES.map((e) => (
              <FilterChip key={e} label={e} selected={false} onPress={() => run(e)} />
            ))}
          </View>
        </View>
      ) : search.isPending ? (
        <View style={{ gap: space[3] }} testID="supplier-loading">
          <Txt variant="label">Recherche chez vos fournisseurs… (jusqu'à 40 secondes)</Txt>
          <Skeleton w="100%" h={140} r={radius.xl} />
          <Skeleton w="100%" h={140} r={radius.xl} />
        </View>
      ) : search.isError ? (
        <ErrorState title="La recherche n'a pas abouti" description={userMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : search.data.total === 0 ? (
        <>
          <EmptyState icon={<Truck size={28} color={color.ink2} />} title={`Rien trouvé pour « ${search.data.query} »`} description="Aucun de vos fournisseurs ne propose ce produit pour l'instant. Essayez un mot plus simple (ex. « iPhone 12 » au lieu de « iPhone 12 128 Go noir »)." />
          <Checked data={search.data} />
        </>
      ) : (
        <>
          <Txt variant="body" testID="supplier-summary">
            {formatNumber(search.data.total)} résultat{search.data.total > 1 ? "s" : ""} chez {search.data.suppliers.length} fournisseur{search.data.suppliers.length > 1 ? "s" : ""} pour « {search.data.query} »
          </Txt>
          {search.data.partial ? <Txt variant="label">Certains fournisseurs ont mis trop de temps à répondre : les résultats déjà connus sont affichés.</Txt> : null}
          {search.data.suppliers.map((s) => (
            <SupplierBlock key={s.supplierId} supplier={s} orgCurrency={search.data.currency} />
          ))}
          <Checked data={search.data} />
        </>
      )}

      <Button label="Gérer mes fournisseurs" variant="ghost" compact onPress={() => router.push("/sourcing-connections")} testID="manage-suppliers" />
    </Screen>
  );
}

function SupplierBlock({ supplier: s, orgCurrency }: { supplier: SimpleSupplierResultDTO; orgCurrency: string }) {
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`Chez ${s.supplierName}, ${s.total} résultat${s.total > 1 ? "s" : ""}`}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[2] }}>
        <Txt variant="headline" style={{ flex: 1 }} numberOfLines={2}>
          Chez {s.supplierName}
        </Txt>
        <Txt variant="label">
          {s.total} résultat{s.total > 1 ? "s" : ""}
          {s.country ? ` · ${s.country}` : ""}
        </Txt>
      </View>
      {s.offers.map((o, i) => (
        <OfferRow key={o.id} offer={o} orgCurrency={orgCurrency} first={i === 0} />
      ))}
      {s.total > s.offers.length ? <Txt variant="label">… et {s.total - s.offers.length} autre(s) : précisez la recherche.</Txt> : null}
    </Card>
  );
}

function OfferRow({ offer: o, orgCurrency, first }: { offer: SimpleOfferDTO; orgCurrency: string; first: boolean }) {
  const link = safeExternalUrl(o.url);
  const price = o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "Prix non indiqué";
  const converted = o.currency && o.currency !== orgCurrency && o.priceConverted !== null ? `≈ ${formatMoney(o.priceConverted, orgCurrency)}` : null;
  const tax = o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : "";
  return (
    <Pressable
      disabled={!link}
      onPress={() => link && void WebBrowser.openBrowserAsync(link).catch(() => {})}
      accessibilityRole={link ? "link" : undefined}
      accessibilityLabel={`${o.title}, ${price}`}
      style={{ flexDirection: "row", gap: space[3], paddingTop: first ? 0 : space[2], borderTopWidth: first ? 0 : 1, borderTopColor: color.line }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={2}>
          {o.title}
        </Txt>
        <Txt variant="label" color={o.stock === "out_of_stock" ? color.dangerInk : o.stock === "in_stock" ? color.success : color.ink2}>
          {o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : STOCK_TEXT[o.stock]}
          {link ? "  ·  Voir chez le fournisseur" : ""}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
        <Txt variant="body" num style={{ fontFamily: fontFamily[700] }}>
          {price}
          {o.price !== null ? tax : ""}
        </Txt>
        {converted ? <Txt variant="label">{converted}</Txt> : null}
        {link ? <ExternalLink size={14} color={color.ink3} /> : null}
      </View>
    </Pressable>
  );
}

function Checked({ data }: { data: { checked: { supplierName: string; ok: boolean; found: number; message: string | null }[] } }) {
  if (data.checked.length === 0) return null;
  return (
    <Txt variant="label">
      Fournisseurs consultés : {data.checked.map((c) => `${c.supplierName}${c.ok ? "" : " (n'a pas répondu)"}`).join(", ")}.
    </Txt>
  );
}
