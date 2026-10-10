import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink, Link2 } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useCatalog, useListing, useMapListing } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { useDebounced } from "~/lib/use-debounced";
import { AlertBanner, BottomSheet, Button, Card, DetailHeader, EmptyState, ErrorState, ListRow, Screen, SearchField, SectionHeader, Skeleton, StatusChip, Txt, useToast } from "~/components/ui";
import { variantTitle } from "~/components/stock";
import { color, radius, space } from "~/theme/tokens";

/**
 * Annonce eBay ↔ SKU MON STOCK (map_listing_to_sku, fonction SQL existante) : une fois associée,
 * les ventes de l'annonce déduisent le stock du SKU lors des synchronisations. Les ventes passées
 * ne sont PAS déduites rétroactivement (action explicite sur la fiche SKU, après contrôle physique).
 */
export default function ListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const listing = useListing(listingId ?? "");
  const catalog = useCatalog();
  const map = useMapListing(listingId ?? "");
  const toast = useToast();
  const { permissions, active } = useActiveOrg();
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 200);
  const [choice, setChoice] = useState<{ skuId: string; label: string } | null>(null);

  const skus = useMemo(() => {
    const all = (catalog.data?.products ?? []).flatMap((p) => p.skus.map((v) => ({ v, product: p.name })));
    const q = query.trim().toLowerCase();
    // Suggestion : SKU dont le code correspond au SKU déclaré sur eBay (custom label).
    const ext = listing.data?.external_sku?.trim().toUpperCase() ?? null;
    const filtered = q ? all.filter(({ v, product }) => `${product} ${v.row.code ?? ""} ${v.row.variant_name ?? ""}`.toLowerCase().includes(q)) : all;
    return filtered.sort((a, b) => Number((b.v.row.code ?? "").toUpperCase() === ext) - Number((a.v.row.code ?? "").toUpperCase() === ext)).slice(0, 40);
  }, [catalog.data, query, listing.data?.external_sku]);

  if (listing.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Annonces" />
        <Skeleton w="100%" h={140} r={radius.xl} />
      </Screen>
    );
  if (listing.isError || !listing.data)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Annonces" />
        {listing.isError ? <ErrorState description={userMessage(listing.error)} onRetry={() => void listing.refetch()} /> : <EmptyState title="Annonce introuvable" description="Elle n'appartient pas à l'organisation active." />}
      </Screen>
    );

  const l = listing.data;
  const url = safeExternalUrl(l.listing_url);

  function apply(skuId: string | null) {
    map.mutate(skuId, {
      onSuccess: () => {
        setChoice(null);
        toast({ text: skuId ? "Annonce associée : ses prochaines ventes déduiront le stock du SKU." : "Association retirée." });
      },
      onError: (e) => {
        setChoice(null);
        toast({ text: userMessage(e), tone: "error" });
      },
    });
  }

  return (
    <Screen>
      <DetailHeader parentLabel="Annonces" />
      <Card padded style={{ gap: space[2] }}>
        <Txt variant="body">{l.title ?? l.external_listing_id}</Txt>
        <Txt variant="label">
          eBay n° {l.external_listing_id}
          {l.external_sku ? ` · SKU vendeur « ${l.external_sku} »` : ""}
        </Txt>
        <View style={{ flexDirection: "row", gap: space[3], alignItems: "center", flexWrap: "wrap" }}>
          <Txt variant="kpiSm" num>
            {l.price === null ? "—" : formatMoney(l.price, l.currency ?? active.organization.currency)}
          </Txt>
          <Txt variant="label">{formatNumber(l.quantity_available ?? 0)} en vente</Txt>
          <StatusChip label={l.status === "active" ? "Active" : "Terminée"} tone={l.status === "active" ? "success" : "neutral"} />
        </View>
        <Txt variant="label">Dernière synchronisation : {l.last_synced_at ? formatDateTime(l.last_synced_at) : "—"}</Txt>
        {url ? (
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(url).catch(() => {})} style={{ flexDirection: "row", gap: 6, alignItems: "center", minHeight: 32 }}>
            <ExternalLink size={14} color={color.ink2} />
            <Txt variant="label">Voir sur eBay</Txt>
          </Pressable>
        ) : null}
      </Card>

      {l.sku_id && l.sku ? (
        <Card padded style={{ gap: space[2] }}>
          <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
            <Link2 size={18} color={color.success} />
            <Txt variant="body">Associée à {l.sku.product?.name ?? "—"} · SKU {l.sku.code}</Txt>
          </View>
          <Txt variant="label">Les ventes de cette annonce déduisent le stock de ce SKU à chaque synchronisation (une seule fois par vente).</Txt>
          {permissions.canWrite ? <Button label="Retirer l'association" variant="ghost" loading={map.isPending} onPress={() => apply(null)} /> : null}
        </Card>
      ) : (
        <AlertBanner text="Annonce non associée : ses ventes ne modifient pas votre stock. Choisissez le SKU correspondant ci-dessous." />
      )}

      {permissions.canWrite ? (
        <>
          <SectionHeader title={l.sku_id ? "Changer de SKU" : "Associer à un SKU"} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Produit, code SKU…" />
          {catalog.isPending ? (
            <Skeleton w="100%" h={120} r={radius.lg} />
          ) : skus.length === 0 ? (
            <EmptyState title="Aucun SKU" description="Créez d'abord le produit dans l'onglet Stock." actions={[{ label: "Créer un produit", onPress: () => router.push("/product/new") }]} />
          ) : (
            <Card>
              {skus.map(({ v, product }, i) => (
                <ListRow
                  key={v.row.sku_id ?? i}
                  title={`${product} · ${variantTitle(v)}`}
                  subtitle={`SKU ${v.row.code}${(v.row.code ?? "").toUpperCase() === l.external_sku?.trim().toUpperCase() ? " · correspond au SKU vendeur eBay" : ""} · stock ${formatNumber(v.row.quantity_available ?? 0)}`}
                  onPress={() => setChoice({ skuId: v.row.sku_id ?? "", label: `${product} · SKU ${v.row.code}` })}
                  last={i === skus.length - 1}
                />
              ))}
            </Card>
          )}
        </>
      ) : null}

      <BottomSheet
        visible={choice !== null}
        onClose={() => setChoice(null)}
        title="Associer cette annonce ?"
        description={`${l.title ?? l.external_listing_id} → ${choice?.label ?? ""}. Les prochaines ventes déduiront le stock de ce SKU. Les ventes passées non déduites restent à appliquer depuis la fiche SKU, après vérification du stock physique.`}
      >
        <Button label="Associer" loading={map.isPending} onPress={() => choice && apply(choice.skuId)} testID="listing-map-confirm" />
        <Button label="Annuler" variant="ghost" onPress={() => setChoice(null)} />
      </BottomSheet>
    </Screen>
  );
}
