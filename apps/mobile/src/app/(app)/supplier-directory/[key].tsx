import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { BadgeCheck, Ban, Check, CircleAlert, Code2, Download, ExternalLink, Globe, History, KeyRound, Mail, MessageSquareText, Plug, Rss, ShieldCheck, TriangleAlert, Unplug, Upload } from "lucide-react-native";
import type { DirectoryEntryDTO } from "@/features/mobile-api/contract";
import { useDisconnectProAccount, useImportJobs, useSupplierDirectory, useSupplierOffers } from "~/data/hooks";
import { ACCESS_MODE_LABEL, mailtoLink } from "~/data/suppliers-pro";
import { useSupplierFavorites } from "~/data/supplier-favorites";
import { useActiveOrg } from "~/org/org-provider";
import { SupplierLogo } from "~/components/supplier-logo";
import { ACCESS_METHOD_LABEL, countryLabel, FadeIn, FavoriteButton, INTEGRATION_STATUS_LABEL, INTEGRATION_TONE, ORG_STATUS_LABEL, RELIABILITY_LABEL, segmentLabel, useSupplierAction } from "~/components/supplier-library";
import { OfferLines } from "~/components/offer-result";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber, formatRelative } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { ActionRow, BottomSheet, Button, Card, Collapsible, DetailHeader, EmptyState, ErrorState, Screen, SectionHeader, Segmented, SkeletonList, StageStats, StatusChip, StatusLine, Timeline, Txt, useToast, type BlockTone } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

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

type Tab = "overview" | "products" | "access" | "facts";

const METHOD_ICON: Record<Method, typeof KeyRound> = {
  official_api: Plug,
  oauth: KeyRound,
  catalog_feed: Rss,
  portal_export: Download,
  manual_import: Upload,
  custom_development: Code2,
  pro_account_first: BadgeCheck,
  not_automatable: Ban,
  public_integrated: Globe,
};

function EntryBody({ entry: e, favorite, onToggleFavorite, canWrite, canAdmin }: { entry: DirectoryEntryDTO; favorite: boolean; onToggleFavorite: () => void; canWrite: boolean; canAdmin: boolean }) {
  const toast = useToast();
  const action = useSupplierAction(e, canWrite);
  const disconnect = useDisconnectProAccount();
  const offers = useSupplierOffers(e.org.supplierId);
  const imports = useImportJobs(e.org.supplierId ?? undefined);
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const orgCurrency = useActiveOrg().active.organization.currency;
  const open = (u: string | null) => {
    const safe = safeExternalUrl(u);
    if (safe) void WebBrowser.openBrowserAsync(safe).catch(() => toast({ text: "Lien impossible à ouvrir.", tone: "error" }));
  };
  const name = e.name.replace(/\s*\(.*\)\s*$/, "");
  const r = e.registry;
  const connected = e.org.status !== "not_connected";
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
    ["Obtenir le catalogue", e.howToGetCatalog],
  ];
  const statusTone: BlockTone = e.org.status === "connected" ? "success" : e.org.status === "error" ? "danger" : e.org.status === "pending" ? "warning" : "neutral";
  const total = offers.data?.total ?? e.org.accountOffers + e.org.publicOffers;

  const statusOnDark = e.org.status === "connected" ? color.mint : e.org.status === "error" ? color.dangerOnDark : e.org.status === "pending" ? color.accent : color.inkOnDarkMuted;
  const stage = (
    <View style={{ gap: space[3], marginTop: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <SupplierLogo domain={r.domain} name={e.name} size={68} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title1" color={color.inkOnDark} accessibilityRole="header" numberOfLines={2} style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.7 }}>
            {name}
          </Txt>
          <Txt variant="label" color={color.inkOnDarkMuted} numberOfLines={2}>
            {[countryLabel(e.country), segmentLabel(e.segment), r.domain].filter(Boolean).join(" · ")}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }} accessible accessibilityLabel={`État : ${connected ? ORG_STATUS_LABEL[e.org.status] : INTEGRATION_STATUS_LABEL[r.integrationStatus]}`}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusOnDark, borderWidth: 3, borderColor: "rgba(255,255,255,0.08)" }} />
          <Txt variant="label" color={statusOnDark} style={{ fontFamily: "Manrope_700Bold" }}>
            {connected ? ORG_STATUS_LABEL[e.org.status] : INTEGRATION_STATUS_LABEL[r.integrationStatus]}
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, borderWidth: 1, borderColor: color.nightStroke }}>
          <Txt variant="monoSm" color={color.inkOnDarkMuted}>
            Priorité {r.priority.tier}
          </Txt>
        </View>
      </View>
      {connected ? (
        <StageStats
          stats={[
            { label: "Offres du compte", value: formatNumber(e.org.accountOffers) },
            { label: "Publiques", value: formatNumber(e.org.publicOffers) },
            { label: "Mise à jour", value: e.org.lastSyncAt ? formatRelative(e.org.lastSyncAt) : null, tone: e.org.status === "error" ? "danger" : undefined },
          ]}
          size={15}
        />
      ) : null}
    </View>
  );

  return (
    <Screen>
      <DetailHeader parentLabel="Bibliothèque" right={<FavoriteButton onDark active={favorite} onPress={onToggleFavorite} name={e.name} />} stage={stage} />
      {e.org.lastError ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 10, padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: color.dangerLine, backgroundColor: color.dangerSoft }}>
          <CircleAlert size={18} color={color.dangerInk} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="body" color={color.dangerInk} style={{ fontFamily: "Manrope_700Bold" }}>
              Connexion en erreur
            </Txt>
            <Txt variant="label" color={color.dangerInk}>
              {e.org.lastError}
            </Txt>
            {e.org.lastSyncAt ? (
              <Txt variant="note" color={color.dangerInk}>
                Dernière réussite {formatRelative(e.org.lastSyncAt)}
              </Txt>
            ) : null}
          </View>
        </View>
      ) : null}
      {r.primaryAction.kind !== "none" ? (
        <View style={{ gap: 6 }}>
          <Button label={r.primaryAction.label} loading={action.busy} onPress={() => action.run()} testID="entry-primary-action" />
          <Txt variant="note" style={{ textAlign: "center" }}>
            {r.primaryAction.outcome}
          </Txt>
        </View>
      ) : null}

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Aperçu" },
          { value: "products", label: e.org.supplierId ? `Produits${total ? ` · ${formatNumber(total)}` : ""}` : "Produits" },
          { value: "access", label: "Accès" },
          { value: "facts", label: "Fiche" },
        ]}
      />

      {tab === "overview" ? (
        <>
          <SectionHeader title="Votre connexion" />
          <Card padded style={{ gap: space[2] }} accessibilityLabel={`Connexion : ${ORG_STATUS_LABEL[e.org.status]}`}>
            {!connected ? (
              <Txt variant="bodyRegular">{e.proAccountRequired ? "Pas encore connecté. Il faut votre propre compte pro chez ce fournisseur." : "Pas encore connecté. Voir l'onglet Accès."}</Txt>
            ) : e.org.connectionId ? (
              <>
                <Timeline
                  steps={[
                    { label: "Identifiants enregistrés", meta: "Chiffrés côté serveur", state: "done" },
                    e.org.status === "error"
                      ? { label: "Test par le serveur", meta: e.org.lastError ?? "Refusé", state: "error", metaTone: "danger" }
                      : e.org.status === "pending"
                        ? { label: "Test par le serveur", meta: "En cours", state: "current", metaTone: "accent" }
                        : { label: "Test par le serveur", meta: "Réussi", state: "done" },
                    e.org.status === "connected" && e.org.lastSyncAt
                      ? { label: "Synchronisation des prix", meta: `Faite ${formatRelative(e.org.lastSyncAt)} · ${formatNumber(e.org.accountOffers)} offres`, state: "done" }
                      : { label: "Synchronisation des prix", meta: e.org.status === "error" ? "En attente d'une connexion valide" : "À venir", state: e.org.status === "connected" ? "current" : "todo" },
                  ]}
                />
                <Txt variant="note" testID="entry-connection-facts">
                  Chaque étape est confirmée par le serveur. Données datées, pas du temps réel.
                </Txt>
              </>
            ) : (
              <>
                <Txt variant="body" testID="entry-connection-facts">
                  {formatNumber(e.org.accountOffers)} offre{e.org.accountOffers > 1 ? "s" : ""} de votre compte · {formatNumber(e.org.publicOffers)} publique{e.org.publicOffers > 1 ? "s" : ""}
                </Txt>
                <Txt variant="label">{e.org.lastSyncAt ? `Dernière mise à jour : ${formatDateTime(e.org.lastSyncAt)} — données datées, pas du temps réel.` : "Aucune mise à jour réussie pour l'instant."}</Txt>
                {lastImport ? <Txt variant="label">Dernier import : {formatDateTime(lastImport.startedAt)} · {formatNumber(lastImport.counts.created)} créées, {formatNumber(lastImport.counts.updated)} mises à jour, {formatNumber(lastImport.counts.invalid + lastImport.counts.rejected)} ignorées</Txt> : null}
              </>
            )}
          </Card>
          {(canWrite && e.org.supplierId) || (canAdmin && e.org.connectionId) ? (
            <Card>
              {canWrite && e.org.supplierId ? <ActionRow icon={History} title="Historique des imports" detail={lastImport ? `Dernier : ${formatRelative(lastImport.startedAt)}` : "Aucun import pour l'instant"} onPress={() => router.push({ pathname: "/sourcing-imports", params: { supplierId: e.org.supplierId! } })} last={!(canAdmin && e.org.connectionId)} /> : null}
              {canAdmin && e.org.connectionId ? <ActionRow icon={Unplug} tone="danger" title="Déconnecter le compte" detail="Identifiants supprimés ; les offres reçues restent dans l'historique" onPress={() => setConfirmDisconnect(true)} last testID="entry-disconnect" /> : null}
            </Card>
          ) : null}
          {e.org.supplierId && offers.data && offers.data.offers.length > 0 ? (
            <>
              <SectionHeader title={`Produits récupérés (${formatNumber(offers.data.total)})`} action={{ label: "Tout voir", onPress: () => setTab("products") }} />
              <OfferLines offers={offers.data.offers.slice(0, 3)} orgCurrency={orgCurrency} />
            </>
          ) : null}
          {advantages.length || limits.length ? (
            <>
              <SectionHeader title="Avantages et limites" />
              <Card padded style={{ gap: space[2] }}>
                {advantages.map((x) => (
                  <View key={x} style={{ flexDirection: "row", gap: space[2] }}>
                    <Check size={15} color={color.success} strokeWidth={2.6} style={{ marginTop: 2 }} />
                    <Txt variant="label" color={color.ink} style={{ flex: 1 }}>
                      {x}
                    </Txt>
                  </View>
                ))}
                {limits.map((l) => (
                  <View key={l} style={{ flexDirection: "row", gap: space[2] }}>
                    <TriangleAlert size={15} color={color.accentInkOnSoft} strokeWidth={2.2} style={{ marginTop: 2 }} />
                    <Txt variant="label" color={color.accentInkOnSoft} style={{ flex: 1 }}>
                      {l}
                    </Txt>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "products" ? (
        e.org.supplierId ? (
          <>
            <SectionHeader title={`Produits récupérés${offers.data ? ` (${formatNumber(offers.data.total)})` : ""}`} />
            {offers.isPending ? (
              <SkeletonList rows={3} thumb={false} />
            ) : offers.data && offers.data.offers.length > 0 ? (
              <>
                <OfferLines offers={offers.data.offers.slice(0, 30)} orgCurrency={orgCurrency} />
                {offers.data.total > 30 ? <Txt variant="label">… et {formatNumber(offers.data.total - 30)} autres : utilisez la recherche Sourcing pour les comparer.</Txt> : null}
              </>
            ) : (
              <EmptyState title="Aucun produit actif" description="Importez son catalogue ou lancez une synchronisation." actions={canWrite ? [{ label: "Importer un catalogue", onPress: action.importFile }] : []} />
            )}
          </>
        ) : (
          <EmptyState title="Pas encore de produits" description="Ils apparaîtront une fois ce fournisseur connecté." actions={r.primaryAction.kind !== "none" ? [{ label: r.primaryAction.label, onPress: () => action.run() }] : []} />
        )
      ) : null}

      {tab === "access" ? (
        <>
          <SectionHeader title="Méthodes d'accès" />
          <Card>
            {r.accessMethods.map((m, i) => (
              <ActionRow key={m} icon={METHOD_ICON[m]} tone={m === "official_api" || m === "public_integrated" ? "success" : m === "not_automatable" ? "danger" : m === "pro_account_first" ? "warning" : "neutral"} title={ACCESS_METHOD_LABEL[m]} detail={METHOD_DETAIL[m]} titleLines={2} last={i === r.accessMethods.length - 1} />
            ))}
          </Card>
          <Txt variant="label">
            Fiabilité : {RELIABILITY_LABEL[r.reliability]} · fiche du {e.researchedAt.split("-").reverse().join("/")}
          </Txt>
          <View style={{ gap: space[2] }}>
            {canWrite && r.accessMethods.some((m) => m === "manual_import" || m === "portal_export") && r.primaryAction.kind !== "import_catalog" ? <Button label="Importer mon catalogue" variant="secondary" onPress={action.importFile} /> : null}
            {canWrite && r.accessMethods.includes("catalog_feed") && r.primaryAction.kind !== "add_feed" ? <Button label="Ajouter mon flux" variant="secondary" onPress={() => router.push("/sourcing-feed-new")} testID="directory-add-feed" /> : null}
            {!connected ? <Button label="Demander l'accès (e-mail prêt)" variant="secondary" onPress={action.email} testID="entry-email" /> : null}
          </View>
          {e.b2b ? (
            <Collapsible title="Questions à poser au fournisseur" summary={e.b2b.activation} icon={MessageSquareText}>
              {e.b2b.questions.map((q) => (
                <Txt key={q} variant="label" color={color.ink2}>
                  – {q}
                </Txt>
              ))}
              <Txt variant="label">Reprises dans l'e-mail de demande en français. Aucun message n'est envoyé automatiquement.</Txt>
            </Collapsible>
          ) : null}
        </>
      ) : null}

      {tab === "facts" ? (
        <>
          <Card>
            {facts
              .filter(([, v]) => v)
              .map(([k, v], i, arr) => (
                <View key={k} style={{ paddingVertical: space[3], paddingHorizontal: space[4], gap: 2, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: color.lineSoft }}>
                  <Txt variant="micro">{k}</Txt>
                  <Txt variant="body" style={{ fontSize: 14.5, lineHeight: 20 }}>
                    {v}
                  </Txt>
                </View>
              ))}
          </Card>
          <Card>
            {e.website ? <ActionRow icon={ExternalLink} title="Site officiel" detail={r.domain} onPress={() => open(e.website)} /> : null}
            {e.apiDocsUrl ? <ActionRow icon={Code2} title="Documentation API officielle" onPress={() => open(e.apiDocsUrl)} /> : null}
            <ActionRow icon={Mail} title="Access request e-mail (English)" detail="Ready to send, nothing is sent automatically" onPress={() => void Linking.openURL(mailtoLink(e.email.en)).catch(() => toast({ text: "Aucune application de messagerie configurée sur cet appareil.", tone: "error" }))} last />
          </Card>
          <Collapsible title="Ce qui a été vérifié" summary={e.check ? `${e.check.reachable ? "Site joignable" : "Site injoignable"} · ${formatDateTime(e.check.checkedAt)}` : "Site pas encore vérifié depuis le serveur"} icon={ShieldCheck}>
            <Txt variant="label" color={color.ink2}>
              {e.check?.message ?? "—"}
            </Txt>
            <Txt variant="label" color={color.ink2}>
              {e.researchVerified ?? "—"}
            </Txt>
          </Collapsible>
        </>
      ) : null}

      <Txt variant="label" style={{ marginTop: space[2] }}>
        Logo : identification uniquement, aucun partenariat.
      </Txt>
      {action.sheet}
      <BottomSheet visible={confirmDisconnect} title={`Déconnecter ${name} ?`} description="Les identifiants enregistrés sont supprimés du serveur. Les offres déjà reçues restent dans l'historique. Vous pourrez reconnecter le compte à tout moment." onClose={() => setConfirmDisconnect(false)}>
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Button label="Annuler" variant="secondary" onPress={() => setConfirmDisconnect(false)} style={{ flex: 1 }} />
          <Button
            label="Déconnecter"
            variant="destructive"
            loading={disconnect.isPending}
            onPress={() =>
              disconnect.mutate(e.org.connectionId!, {
                onSuccess: (x) => {
                  setConfirmDisconnect(false);
                  toast({ text: x.message });
                },
                onError: (err) => toast({ text: userMessage(err), tone: "error" }),
              })
            }
            style={{ flex: 1 }}
            testID="entry-disconnect-confirm"
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
