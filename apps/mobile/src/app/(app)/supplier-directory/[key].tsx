import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSupplierDirectory } from "~/data/hooks";
import { ACCESS_MODE_LABEL, mailtoLink, SEGMENT_LABEL, STAGE_LABEL, STAGE_TONE } from "~/data/suppliers-pro";
import { useActiveOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { Button, Card, DetailHeader, ErrorState, Screen, SectionHeader, SkeletonList, StatusChip, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Fiche fournisseur : ce qu'il vend, comment obtenir ses prix, ce qui a été réellement vérifié. */
export default function SupplierDirectoryEntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const directory = useSupplierDirectory();
  const { permissions } = useActiveOrg();
  const toast = useToast();

  if (directory.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Fournisseurs" />
        <SkeletonList rows={4} thumb={false} />
      </Screen>
    );
  const e = directory.data?.entries.find((x) => x.key === key);
  if (directory.isError || !e)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Fournisseurs" />
        <ErrorState description={directory.isError ? userMessage(directory.error) : "Fournisseur introuvable."} onRetry={() => void directory.refetch()} />
      </Screen>
    );

  const open = (u: string | null) => {
    const safe = safeExternalUrl(u);
    if (safe) void WebBrowser.openBrowserAsync(safe).catch(() => toast({ text: "Lien impossible à ouvrir.", tone: "error" }));
  };
  const mail = (lang: "fr" | "en") => {
    void Linking.openURL(mailtoLink(e.email[lang])).catch(() => toast({ text: "Aucune application de messagerie configurée sur cet appareil.", tone: "error" }));
  };
  const facts: [string, string | null][] = [
    ["Pays", [e.country, e.deliveryZones.length ? `livre : ${e.deliveryZones.join(", ")}` : null].filter(Boolean).join(" · ") || null],
    ["Produits", [...e.categories, ...e.productTypes].join(", ") || null],
    ["Marques", e.brands.join(", ") || null],
    ["Vente", e.sales],
    ["Compte professionnel", e.proAccountRequired === null ? "non précisé" : e.proAccountRequired ? "requis" : "non requis"],
    ["Conditions d'accès", e.accessConditions],
    ["Prix", [e.pricesTax, e.currency].filter(Boolean).join(" · ") || null],
    ["Quantité minimale", e.moq],
    ["Livraison", e.shipping],
    ["Garantie / retours", e.warranty],
    ["Qualité des pièces", e.partQuality],
  ];

  return (
    <Screen>
      <DetailHeader parentLabel="Fournisseurs" />
      <View style={{ gap: 6 }}>
        <Txt variant="title2" accessibilityRole="header">
          {e.name}
        </Txt>
        <Txt variant="label">{SEGMENT_LABEL[e.segment]}</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {e.stages.map((s) => (
            <StatusChip key={s} label={STAGE_LABEL[s]} tone={STAGE_TONE[s]} />
          ))}
          {e.activeInOrg ? <StatusChip label="Activé dans votre organisation" tone="success" /> : null}
        </View>
      </View>
      {e.whyUseful ? (
        <Card padded>
          <Txt variant="body">{e.whyUseful}</Txt>
        </Card>
      ) : null}

      <SectionHeader title="Obtenir ses prix" />
      <Card padded style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {e.accessModes.length ? e.accessModes.map((m) => <StatusChip key={m} label={ACCESS_MODE_LABEL[m] ?? m} tone="neutral" />) : <Txt variant="label">Mode d'accès non documenté.</Txt>}
        </View>
        {e.howToGetCatalog ? <Txt variant="body">{e.howToGetCatalog}</Txt> : null}
        <Txt variant="label">
          {e.integration.kind === "library"
            ? "Dans MON STOCK : source interrogeable automatiquement, à activer dans la bibliothèque de sources."
            : e.integration.kind === "connector"
              ? "Dans MON STOCK : connecteur API disponible — il faut les identifiants de VOTRE compte chez ce fournisseur."
              : "Dans MON STOCK : importez le fichier catalogue ou la grille tarifaire qu'il vous transmet (CSV, Excel, XML, JSON)."}
        </Txt>
      </Card>
      <View style={{ gap: space[2] }}>
        {permissions.canWrite ? <Button label="Importer un catalogue de ce fournisseur" onPress={() => router.push({ pathname: "/sourcing-import", params: { supplierName: e.name } })} /> : null}
        {e.integration.kind === "library" ? <Button label="Bibliothèque de sources" variant="secondary" onPress={() => router.push("/sourcing-sources")} /> : null}
        <Button label="E-mail de demande d'accès (français)" variant="secondary" onPress={() => mail("fr")} />
        <Button label="Access request e-mail (English)" variant="ghost" onPress={() => mail("en")} />
      </View>

      <SectionHeader title="Fiche" />
      <Card padded style={{ gap: space[2] }}>
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <View key={k} style={{ gap: 2 }}>
              <Txt variant="label">{k}</Txt>
              <Txt variant="body">{v}</Txt>
            </View>
          ))}
      </Card>
      <View style={{ gap: space[2] }}>
        {e.website ? <Button label="Site officiel" variant="ghost" onPress={() => open(e.website)} /> : null}
        {e.catalogUrl && e.catalogUrl !== e.website ? <Button label="Page catalogue" variant="ghost" onPress={() => open(e.catalogUrl)} /> : null}
        {e.apiDocsUrl ? <Button label="Documentation API" variant="ghost" onPress={() => open(e.apiDocsUrl)} /> : null}
      </View>

      <SectionHeader title="Ce qui a été vérifié" />
      <Card padded style={{ gap: space[2] }}>
        <Txt variant="label" color={color.ink}>
          Serveur MON STOCK
        </Txt>
        <Txt variant="body">
          {e.check ? `${e.check.message ?? (e.check.reachable ? "Site joignable." : "Site injoignable.")} (${formatDateTime(e.check.checkedAt)})` : "Site pas encore vérifié depuis le serveur."}
        </Txt>
        <Txt variant="label" color={color.ink}>
          Recherche documentaire ({e.researchedAt.split("-").reverse().join("/")})
        </Txt>
        <Txt variant="body">{e.researchVerified ?? "—"}</Txt>
        <Txt variant="label">Aucun prix n'est issu de cette fiche : les prix proviennent uniquement de vos imports ou des sources connectées.</Txt>
      </Card>
    </Screen>
  );
}
