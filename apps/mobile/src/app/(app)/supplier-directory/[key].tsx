import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink } from "lucide-react-native";
import type { DirectoryEntryDTO, SimpleOfferDTO } from "@/features/mobile-api/contract";
import { useDisconnectProAccount, useImportJobs, useSupplierDirectory, useSupplierOffers } from "~/data/hooks";
import { ACCESS_MODE_LABEL, mailtoLink } from "~/data/suppliers-pro";
import { STOCK_TEXT } from "~/data/supplier-search";
import { useSupplierFavorites } from "~/data/supplier-favorites";
import { useActiveOrg } from "~/org/org-provider";
import { SupplierLogo } from "~/components/supplier-logo";
import { ACCESS_METHOD_LABEL, countryLabel, FadeIn, FavoriteButton, INTEGRATION_STATUS_LABEL, INTEGRATION_TONE, ORG_STATUS_LABEL, ORG_STATUS_TONE, RELIABILITY_LABEL, segmentLabel, useSupplierAction } from "~/components/supplier-library";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { Button, Card, DetailHeader, ErrorState, Screen, SectionHeader, SkeletonList, StatusChip, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

type Method = DirectoryEntryDTO["registry"]["accessMethods"][number];

/** Ce que chaque méthode permet concrètement dans MON STOCK. */
export const METHOD_DETAIL: Record<Method, string> = {
  official_api: "Connecteur MON STOCK prêt : saisissez les identifiants API de VOTRE compte ; prix et stocks récupérés automatiquement.",
  oauth: "Autorisation officielle : vous vous connectez chez le fournisseur, MON STOCK reçoit un accès limité et révocable.",
  catalog_feed: "Le fournisseur fournit un lien de flux (CSV, XML, JSON, EDI) : il se met à jour sans intervention.",
  portal_export: "Depuis votre espace client, exportez la liste de prix et importez-la dans MON STOCK.",
  manual_import: "Importez le fichier reçu ou téléchargé (CSV, Excel, XML, JSON) : aperçu, correspondance des colonnes mémorisée, sans doublon.",
  custom_development: "API annoncée sans documentation publique : intégration possible après réception de la documentation et des accès.",
  pro_account_first: "Il faut d'abord VOTRE compte revendeur chez ce fournisseur (souvent Kbis et n° de TVA).",
  not_automatable: "Aucune intégration automatisable aujourd'hui : consultation sur leur site, ou import d'un fichier s'ils en fournissent un.",
  public_integrated: "Catalogue public déjà intégré à MON STOCK : activez-le pour voir ses produits dans vos recherches, avec le lien de chaque fiche.",
};

/** Fiche fournisseur premium : identité, méthodes d'accès réelles, état de votre connexion, produits récupérés, actions adaptées. */
export default function SupplierEntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const directory = useSupplierDirectory();
  const { active, permissions } = useActiveOrg();
  const { favorites, toggle } = useSupplierFavorites(active.organization.id);
  const e = directory.data?.entries.find((x) => x.key === key);

  if (directory.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Bibliothèque" />
        <SkeletonList rows={4} thumb={false} />
      </Screen>
    );
  if (directory.isError || !e)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Bibliothèque" />
        <ErrorState description={directory.isError ? userMessage(directory.error) : "Fournisseur introuvable."} onRetry={() => void directory.refetch()} />
      </Screen>
    );
  return <EntryBody entry={e} favorite={favorites.has(e.key)} onToggleFavorite={() => void toggle(e.key)} canWrite={permissions.canWrite} canAdmin={permissions.isAdmin} />;
}

function EntryBody({ entry: e, favorite, onToggleFavorite, canWrite, canAdmin }: { entry: DirectoryEntryDTO; favorite: boolean; onToggleFavorite: () => void; canWrite: boolean; canAdmin: boolean }) {
  const toast = useToast();
  const action = useSupplierAction(e, canWrite);
  const disconnect = useDisconnectProAccount();
  const offers = useSupplierOffers(e.org.supplierId);
  const imports = useImportJobs(e.org.supplierId ?? undefined);
  const open = (u: string | null) => {
    const safe = safeExternalUrl(u);
    if (safe) void WebBrowser.openBrowserAsync(safe).catch(() => toast({ text: "Lien impossible à ouvrir.", tone: "error" }));
  };
  const name = e.name.replace(/\s*\(.*\)\s*$/, "");
  const r = e.registry;
  const lastImport = (imports.data ?? [])[0] ?? null;
  const advantages = [...r.priority.reasons, e.pricesTax === "HT" ? "Prix affichés HT" : null, e.partQuality ? `Qualités : ${e.partQuality}` : null].filter((x): x is string => Boolean(x));
  const limits = [
    r.abandonedReason,
    r.accessMethods.includes("not_automatable") ? "Aucune intégration automatisable actuellement." : null,
    r.accessMethods.includes("custom_development") ? "API sans documentation publique : accès commercial à obtenir." : null,
    e.proAccountRequired ? "Compte professionnel requis : vos propres identifiants, jamais partagés." : null,
    r.reliability === "inferred" ? "Informations issues de sources secondaires : à confirmer avec le fournisseur." : null,
    e.moq ? `Minimum de commande : ${e.moq}` : null,
  ].filter((x): x is string => Boolean(x));
  const facts: [string, string | null][] = [
    ["Pays", [countryLabel(e.country), e.deliveryZones.length ? `livre : ${e.deliveryZones.join(", ")}` : null].filter(Boolean).join(" · ") || null],
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
    ["Modes annoncés", e.accessModes.map((m) => ACCESS_MODE_LABEL[m] ?? m).join(", ") || null],
  ];

  return (
    <Screen>
      <DetailHeader parentLabel="Bibliothèque" />
      <FadeIn>
        <Card padded style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
            <SupplierLogo domain={r.domain} name={e.name} size={64} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title2" accessibilityRole="header" numberOfLines={2}>
                {name}
              </Txt>
              <Txt variant="label">{[countryLabel(e.country), segmentLabel(e.segment), r.domain].filter(Boolean).join(" · ")}</Txt>
            </View>
            <FavoriteButton active={favorite} onPress={onToggleFavorite} name={e.name} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <StatusChip label={ORG_STATUS_LABEL[e.org.status]} tone={ORG_STATUS_TONE[e.org.status]} />
            <StatusChip label={INTEGRATION_STATUS_LABEL[r.integrationStatus]} tone={INTEGRATION_TONE[r.integrationStatus]} />
            <StatusChip label={`Priorité ${r.priority.tier}`} tone="neutral" />
          </View>
          {e.whyUseful ? <Txt variant="bodyRegular">{e.whyUseful}</Txt> : null}
          {r.primaryAction.kind !== "none" ? (
            <View style={{ gap: 6 }}>
              <Button label={r.primaryAction.label} loading={action.busy} onPress={() => action.run()} testID="entry-primary-action" />
              <Txt variant="label">{r.primaryAction.outcome}</Txt>
            </View>
          ) : null}
        </Card>
      </FadeIn>

      <SectionHeader title="Votre connexion" />
      <Card padded style={{ gap: space[2] }} accessibilityLabel={`Connexion : ${ORG_STATUS_LABEL[e.org.status]}`}>
        {e.org.status === "not_connected" ? (
          <Txt variant="bodyRegular">
            {e.proAccountRequired
              ? "Pas encore connecté. Il vous faut votre propre compte professionnel chez ce fournisseur et les autorisations qu'il accorde (clé API, flux ou export)."
              : "Pas encore connecté. Choisissez une méthode d'accès ci-dessous."}
          </Txt>
        ) : (
          <>
            <Txt variant="body" testID="entry-connection-facts">
              {formatNumber(e.org.accountOffers)} offre{e.org.accountOffers > 1 ? "s" : ""} de votre compte · {formatNumber(e.org.publicOffers)} publique{e.org.publicOffers > 1 ? "s" : ""}
            </Txt>
            <Txt variant="label">{e.org.lastSyncAt ? `Dernière mise à jour : ${formatDateTime(e.org.lastSyncAt)} — données datées, pas du temps réel.` : "Aucune mise à jour réussie pour l'instant."}</Txt>
            {lastImport ? <Txt variant="label">Dernier import : {formatDateTime(lastImport.startedAt)} · {formatNumber(lastImport.counts.created)} créées, {formatNumber(lastImport.counts.updated)} mises à jour, {formatNumber(lastImport.counts.invalid + lastImport.counts.rejected)} ignorées</Txt> : null}
          </>
        )}
        {e.org.lastError ? (
          <Txt variant="label" color={color.dangerInk}>
            Dernière erreur : {e.org.lastError}
          </Txt>
        ) : null}
        <View style={{ gap: space[2] }}>
          {canWrite && e.org.supplierId ? <Button label="Historique des imports" variant="ghost" compact onPress={() => router.push({ pathname: "/sourcing-imports", params: { supplierId: e.org.supplierId! } })} /> : null}
          {canAdmin && e.org.connectionId ? (
            <Button
              label="Déconnecter le compte"
              variant="ghost"
              compact
              loading={disconnect.isPending}
              onPress={() => disconnect.mutate(e.org.connectionId!, { onSuccess: (x) => toast({ text: x.message }), onError: (err) => toast({ text: userMessage(err), tone: "error" }) })}
              testID="entry-disconnect"
            />
          ) : null}
        </View>
      </Card>

      {e.org.supplierId ? (
        <>
          <SectionHeader title={`Produits récupérés${offers.data ? ` (${formatNumber(offers.data.total)})` : ""}`} />
          {offers.isPending ? (
            <SkeletonList rows={3} thumb={false} />
          ) : offers.data && offers.data.offers.length > 0 ? (
            <Card padded style={{ gap: space[2] }}>
              {offers.data.offers.slice(0, 12).map((o, i) => (
                <OfferLine key={o.id} offer={o} first={i === 0} onOpen={open} />
              ))}
              {offers.data.total > 12 ? <Txt variant="label">… et {formatNumber(offers.data.total - 12)} autres : utilisez la recherche Fournisseurs pour les comparer.</Txt> : null}
            </Card>
          ) : (
            <Txt variant="label">Aucun produit actif pour ce fournisseur : importez son catalogue ou lancez une synchronisation.</Txt>
          )}
        </>
      ) : null}

      <SectionHeader title="Méthodes d'accès" />
      <Card padded style={{ gap: space[3] }}>
        {r.accessMethods.map((m) => (
          <View key={m} style={{ gap: 2 }}>
            <Txt variant="body" style={{ fontFamily: "Manrope_700Bold" }}>
              {ACCESS_METHOD_LABEL[m]}
            </Txt>
            <Txt variant="label">{METHOD_DETAIL[m]}</Txt>
          </View>
        ))}
        <Txt variant="label">Fiabilité : {RELIABILITY_LABEL[r.reliability]} · fiche du {e.researchedAt.split("-").reverse().join("/")}</Txt>
        <View style={{ gap: space[2] }}>
          {canWrite && r.accessMethods.some((m) => m === "manual_import" || m === "portal_export") && r.primaryAction.kind !== "import_catalog" ? <Button label="Importer mon catalogue" variant="secondary" onPress={action.importFile} /> : null}
          {canWrite && r.accessMethods.includes("catalog_feed") && r.primaryAction.kind !== "add_feed" ? <Button label="Ajouter mon flux" variant="secondary" onPress={() => router.push("/sourcing-feed-new")} testID="directory-add-feed" /> : null}
          {e.org.status === "not_connected" ? <Button label="Demander l'accès (e-mail prêt)" variant="ghost" onPress={action.email} testID="entry-email" /> : null}
        </View>
      </Card>

      {advantages.length || limits.length ? (
        <>
          <SectionHeader title="Avantages et limites" />
          <Card padded style={{ gap: space[2] }}>
            {advantages.map((a) => (
              <Txt key={a} variant="label" color={color.success}>
                + {a}
              </Txt>
            ))}
            {limits.map((l) => (
              <Txt key={l} variant="label" color={color.accentInkOnSoft}>
                – {l}
              </Txt>
            ))}
          </Card>
        </>
      ) : null}

      {e.b2b ? (
        <>
          <SectionHeader title="Questions à poser au fournisseur" />
          <Card padded style={{ gap: space[2] }}>
            <Txt variant="body">{e.b2b.activation}</Txt>
            {e.b2b.questions.map((q) => (
              <Txt key={q} variant="label">
                – {q}
              </Txt>
            ))}
            <Txt variant="label">Reprises dans l'e-mail de demande en français. Aucun message n'est envoyé automatiquement.</Txt>
          </Card>
        </>
      ) : null}

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
        {e.howToGetCatalog ? (
          <View style={{ gap: 2 }}>
            <Txt variant="label">Obtenir le catalogue</Txt>
            <Txt variant="body">{e.howToGetCatalog}</Txt>
          </View>
        ) : null}
      </Card>
      <View style={{ gap: space[2] }}>
        {e.website ? <Button label="Ouvrir le site fournisseur" variant="ghost" onPress={() => open(e.website)} /> : null}
        {e.apiDocsUrl ? <Button label="Documentation API officielle" variant="ghost" onPress={() => open(e.apiDocsUrl)} /> : null}
        <Button label="Access request e-mail (English)" variant="ghost" onPress={() => void Linking.openURL(mailtoLink(e.email.en)).catch(() => toast({ text: "Aucune application de messagerie configurée sur cet appareil.", tone: "error" }))} />
      </View>

      <SectionHeader title="Ce qui a été vérifié" />
      <Card padded style={{ gap: space[2] }}>
        <Txt variant="body">{e.check ? `${e.check.message ?? (e.check.reachable ? "Site joignable." : "Site injoignable.")} (${formatDateTime(e.check.checkedAt)})` : "Site pas encore vérifié depuis le serveur."}</Txt>
        <Txt variant="label">{e.researchVerified ?? "—"}</Txt>
        <Txt variant="label">Aucun prix n'est issu de cette fiche : les prix proviennent uniquement de vos imports, de vos comptes connectés ou des catalogues publics. Logo : icône publiée par le fournisseur sur son site, usage d'identification, aucun partenariat.</Txt>
      </Card>
      {action.sheet}
    </Screen>
  );
}

function OfferLine({ offer: o, first, onOpen }: { offer: SimpleOfferDTO; first: boolean; onOpen: (u: string | null) => void }) {
  const price = o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "Prix non indiqué";
  return (
    <View style={{ flexDirection: "row", gap: space[2], alignItems: "center", paddingTop: first ? 0 : space[2], borderTopWidth: first ? 0 : 1, borderTopColor: color.line }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={2}>
          {o.title}
        </Txt>
        <Txt variant="label">
          {o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : STOCK_TEXT[o.stock]}
          {o.access === "account" ? " · Votre compte" : ""}
          {o.seenAt ? ` · vu ${formatDateTime(o.seenAt)}` : ""}
        </Txt>
      </View>
      <Txt variant="body" num style={{ fontFamily: "Manrope_700Bold" }}>
        {price}
        {o.taxType === "ht" ? " HT" : o.taxType === "ttc" ? " TTC" : ""}
      </Txt>
      {o.url ? <ExternalLink size={14} color={color.ink3} onPress={() => onOpen(o.url)} accessibilityLabel={`Ouvrir ${o.title}`} /> : null}
    </View>
  );
}
