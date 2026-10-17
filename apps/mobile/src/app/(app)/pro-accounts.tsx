import { useState } from "react";
import { Linking, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { PRO_METHOD_LABEL, PRO_STATUS_LABEL } from "@/domain/sourcing/pro-accounts";
import { useConnectProAccount, useDisconnectProAccount, useProAccounts, useSyncProAccount } from "~/data/hooks";
import type { ProAccountDTO, PublicSourceDTO } from "~/data/pro-accounts";
import { mailtoLink } from "~/data/suppliers-pro";
import { useActiveOrg } from "~/org/org-provider";
import { SupplierLogo } from "~/components/supplier-logo";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { BottomSheet, Button, Card, DetailHeader, ErrorState, Screen, SectionHeader, SkeletonList, StatusChip, TextField, Txt, useToast, type ChipTone } from "~/components/ui";
import { color, space } from "~/theme/tokens";

const STATUS_TONE: Record<ProAccountDTO["status"], ChipTone> = { connected: "success", pending: "accent", error: "danger", not_connected: "neutral" };

/**
 * « Connectez vos comptes » : les meilleurs prix d'achat sont derrière vos comptes revendeur (prix
 * HT, par grade). On les branche en premier (API, flux ou liste de stock), puis MON STOCK complète
 * avec les sources publiques, chaque offre gardant son lien vers la page du produit.
 */
export default function ProAccountsScreen() {
  const hub = useProAccounts();
  const { permissions } = useActiveOrg();
  const [connecting, setConnecting] = useState<ProAccountDTO | null>(null);
  const header = <DetailHeader parentLabel="Sourcing" title="Comptes fournisseurs" />;

  if (hub.isPending)
    return (
      <Screen scroll={false}>
        {header}
        <SkeletonList rows={6} />
      </Screen>
    );
  if (hub.isError)
    return (
      <Screen>
        {header}
        <ErrorState description={userMessage(hub.error)} onRetry={() => void hub.refetch()} />
      </Screen>
    );

  const { accounts, publicSources, totals } = hub.data;
  const connected = accounts.filter((a) => a.status === "connected").length;
  return (
    <Screen refreshControl={<RefreshControl refreshing={hub.isRefetching} onRefresh={() => void hub.refetch()} />}>
      {header}
      <Card padded style={{ gap: space[2] }}>
        <Txt variant="headline">Vos prix pro passent en premier</Txt>
        <Txt variant="label" testID="pro-accounts-totals">
          {connected} compte{connected > 1 ? "s" : ""} connecté{connected > 1 ? "s" : ""} · {formatNumber(totals.account)} offre{totals.account > 1 ? "s" : ""} de vos comptes · {formatNumber(totals.public)} offres publiques · {formatNumber(totals.marketplace)} annonces de places de marché
        </Txt>
        <Txt variant="note">Ouverture d'un compte : Kbis et n° de TVA en général.</Txt>
      </Card>

      <SectionHeader title="Comptes professionnels" />
      {accounts.map((a) => (
        <AccountCard key={a.key} account={a} canWrite={permissions.canWrite} canAdmin={permissions.isAdmin} onConnect={() => setConnecting(a)} />
      ))}

      <SectionHeader title={`Sources publiques déjà incluses (${publicSources.length})`} />
      <PublicSources sources={publicSources} />

      <Txt variant="label" style={{ marginTop: space[2] }}>
        Logos affichés uniquement pour identifier les fournisseurs : ils restent la propriété de leurs titulaires et n'indiquent aucun partenariat. Informations issues de l'étude du 15/10/2026, à confirmer avec chaque fournisseur.
      </Txt>
      {connecting ? <ConnectSheet account={connecting} onClose={() => setConnecting(null)} /> : null}
    </Screen>
  );
}

function AccountCard({ account: a, canWrite, canAdmin, onConnect }: { account: ProAccountDTO; canWrite: boolean; canAdmin: boolean; onConnect: () => void }) {
  const toast = useToast();
  const sync = useSyncProAccount();
  const disconnect = useDisconnectProAccount();
  const openSite = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => {});
  const importFile = () => router.push({ pathname: "/sourcing-import", params: { supplierName: a.name, ...(a.supplierId ? { supplierId: a.supplierId } : {}) } });
  const askAccess = () => void Linking.openURL(mailtoLink(a.email.fr)).catch(() => toast({ text: "Aucune application de messagerie configurée sur cet appareil.", tone: "error" }));

  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${a.name}, ${PRO_STATUS_LABEL[a.status]}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <SupplierLogo domain={a.domain} name={a.name} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="headline" numberOfLines={2}>
            {a.name}
          </Txt>
          <Txt variant="label" numberOfLines={1}>
            {[a.country, a.domain].filter(Boolean).join(" · ")}
          </Txt>
        </View>
        <StatusChip label={PRO_STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
      </View>
      <Txt variant="bodyRegular">{a.benefit}</Txt>
      <Txt variant="label">{a.requirements}</Txt>
      {a.caution ? (
        <Txt variant="label" color={color.accentInkOnSoft}>
          {a.caution}
        </Txt>
      ) : null}
      {a.status !== "not_connected" ? (
        <Txt variant="label" testID={`pro-account-facts-${a.key}`}>
          {formatNumber(a.offers)} offre{a.offers > 1 ? "s" : ""} de votre compte{a.lastSyncAt ? ` · mise à jour ${formatDateTime(a.lastSyncAt)}` : ""}
          {a.lastError ? ` · ${a.lastError}` : ""}
        </Txt>
      ) : null}

      <View style={{ gap: space[2] }}>
        {canWrite && a.connector && !a.connectionId ? <Button label={PRO_METHOD_LABEL.api} onPress={onConnect} testID={`pro-connect-${a.key}`} /> : null}
        {canWrite && a.connectionId ? (
          <Button
            label="Synchroniser mes prix"
            loading={sync.isPending}
            onPress={() => sync.mutate(a.connectionId!, { onSuccess: (r) => toast({ text: r.message }), onError: (e) => toast({ text: userMessage(e), tone: "error" }) })}
            testID={`pro-sync-${a.key}`}
          />
        ) : null}
        {canWrite && a.methods.includes("file") ? <Button label={PRO_METHOD_LABEL.file} variant={a.connector ? "secondary" : "primary"} onPress={importFile} testID={`pro-file-${a.key}`} /> : null}
        {canWrite && a.methods.includes("feed") ? <Button label={PRO_METHOD_LABEL.feed} variant="secondary" onPress={() => router.push("/sourcing-feed-new")} testID={`pro-feed-${a.key}`} /> : null}
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Button label={a.status === "not_connected" ? "Créer mon compte" : "Ouvrir le site"} variant="ghost" compact onPress={() => openSite(a.signupUrl)} style={{ flex: 1 }} testID={`pro-site-${a.key}`} />
          {a.status === "not_connected" ? <Button label="Demander l'accès (e-mail prêt)" variant="ghost" compact onPress={askAccess} style={{ flex: 1 }} testID={`pro-email-${a.key}`} /> : null}
        </View>
        {canAdmin && a.connectionId ? (
          <Button
            label="Déconnecter"
            variant="ghost"
            compact
            loading={disconnect.isPending}
            onPress={() => disconnect.mutate(a.connectionId!, { onSuccess: (r) => toast({ text: r.message }), onError: (e) => toast({ text: userMessage(e), tone: "error" }) })}
            testID={`pro-disconnect-${a.key}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

function ConnectSheet({ account: a, onClose }: { account: ProAccountDTO; onClose: () => void }) {
  const toast = useToast();
  const connect = useConnectProAccount();
  const fields = a.connector?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = fields.every((f) => (values[f.name] ?? "").trim().length > 0);
  return (
    <BottomSheet visible title={`Connecter ${a.name}`} description="Vos identifiants partent uniquement vers le serveur MON STOCK, qui les chiffre. Ils ne sont jamais conservés sur ce téléphone ni réaffichés." onClose={onClose}>
      <View style={{ gap: space[3] }}>
        {fields.map((f) => (
          <TextField
            key={f.name}
            label={f.label}
            value={values[f.name] ?? ""}
            onChangeText={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
            placeholder={f.placeholder ?? undefined}
            secureTextEntry={f.secret}
            autoCapitalize="none"
            autoCorrect={false}
            testID={`pro-field-${f.name}`}
          />
        ))}
        <Button
          label="Connecter et tester"
          disabled={!complete}
          loading={connect.isPending}
          onPress={() =>
            connect.mutate(
              { key: a.key, credentials: values },
              {
                onSuccess: (r) => {
                  toast({ text: r.message, tone: r.ok ? undefined : "error" });
                  onClose();
                },
                onError: (e) => toast({ text: userMessage(e), tone: "error" }),
              },
            )
          }
          testID="pro-connect-submit"
        />
      </View>
    </BottomSheet>
  );
}

function PublicSources({ sources }: { sources: PublicSourceDTO[] }) {
  if (sources.length === 0) return <Txt variant="label">Aucune source publique active pour l'instant.</Txt>;
  return (
    <Card padded style={{ gap: space[2] }}>
      <Txt variant="label">Catalogues consultables publiquement, relevés automatiquement ; chaque offre garde le lien vers la page du produit.</Txt>
      {sources.map((s, i) => (
        <View key={s.sourceId} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingTop: i === 0 ? 0 : space[2], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: color.line }}>
          <SupplierLogo domain={s.domain} name={s.supplierName} size={28} />
          <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
            {s.supplierName}
          </Txt>
          <Txt variant="label" num>
            {formatNumber(s.offers)} offre{s.offers > 1 ? "s" : ""}
          </Txt>
        </View>
      ))}
    </Card>
  );
}
