import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useScheduleSource, useSources, useSyncSource } from "~/data/hooks";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { ActionRow, BottomSheet, Button, Card, DetailHeader, EmptyState, ErrorState, FilterChip, MetricStrip, Screen, SectionHeader, SkeletonList, StatusLine, Txt, useToast, type BlockTone } from "~/components/ui";
import { SupplierLogo } from "~/components/supplier-logo";
import { History, KeyRound, Plug, Rss, Upload } from "lucide-react-native";
import { color, radius, space } from "~/theme/tokens";

const FREQUENCIES: { value: SourceOverviewDTO["frequency"]; label: string }[] = [
  { value: "manual", label: "Manuelle" },
  { value: "weekly", label: "1 fois / semaine" },
  { value: "daily", label: "1 fois / jour" },
  { value: "every_6_hours", label: "Toutes les 6 h" },
  { value: "hourly", label: "Toutes les heures" },
];

/** Âge lisible d'une donnée (« il y a 3 h », « il y a 5 j »). */
export function ageText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "jamais";
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/**
 * Mes sources : chaque source de l'organisation avec son statut RÉEL (connecté seulement après une
 * synchronisation réussie), ses offres exploitables, l'âge des données, le prochain passage et
 * l'action principale (synchroniser, importer un fichier, réactiver).
 */
export default function SourcingConnectionsScreen() {
  const sources = useSources();
  const sync = useSyncSource();
  const schedule = useScheduleSource();
  const { permissions } = useActiveOrg();
  const toast = useToast();
  const [settings, setSettings] = useState<SourceOverviewDTO | null>(null);

  const header = <DetailHeader parentLabel="Sourcing" title="Mes sources" />;
  const actions = (
    <>
      <SectionHeader title="Ajouter ou gérer" />
      <Card>
        {permissions.canWrite ? <ActionRow icon={Upload} title="Importer un fichier" detail="Liste de prix ou de stock : CSV, Excel, XML, JSON" onPress={() => router.push("/sourcing-import")} testID="sources-import" /> : null}
        {permissions.canWrite ? <ActionRow icon={Rss} title="Ajouter un flux autorisé" detail="Lien HTTPS fourni par le fournisseur, mis à jour seul" onPress={() => router.push("/sourcing-feed-new")} testID="sources-add-feed" /> : null}
        <ActionRow icon={KeyRound} title="Comptes fournisseurs" detail="API, flux ou export de votre compte" onPress={() => router.push("/pro-accounts")} testID="sources-pro-accounts" />
        <ActionRow icon={History} title="Historique des imports" detail="Résultats et rapports d'erreurs" onPress={() => router.push("/sourcing-imports")} last testID="sources-history" />
      </Card>
    </>
  );
  if (sources.isPending)
    return (
      <Screen scroll={false}>
        {header}
        <SkeletonList rows={5} thumb={false} />
      </Screen>
    );
  if (sources.isError)
    return (
      <Screen scroll={false}>
        {header}
        {actions}
        <ErrorState description={userMessage(sources.error)} onRetry={() => void sources.refetch()} />
      </Screen>
    );

  // sources en difficulté d'abord dans chaque groupe
  const failing = (s: SourceOverviewDTO) => s.status === "error" || s.consecutiveFailures > 0;
  const list = [...sources.data].sort((a, b) => Number(failing(b)) - Number(failing(a)));
  const automatic = list.filter((s) => s.schedulable);
  const live = list.filter((s) => s.kind === "live_search");
  const manual = list.filter((s) => !s.schedulable && s.kind !== "live_search");
  const toFix = list.filter(failing).length;
  const active = list.filter((s) => s.status === "connected" || s.status === "running").length;
  const offers = list.reduce((a, s) => a + s.activeOffers, 0);
  const lastSuccess = list.map((s) => s.lastSuccessfulSyncAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;

  function runSync(s: SourceOverviewDTO) {
    sync.mutate(s.id, {
      onSuccess: (r) => {
        void Haptics.notificationAsync(r.status === "failed" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast({ text: r.message || "Synchronisation terminée.", tone: r.status === "failed" ? "error" : "success" });
      },
      onError: (e) => toast({ text: userMessage(e), tone: "error" }),
    });
  }

  function primary(s: SourceOverviewDTO) {
    if (s.primaryAction === "import_file") return router.push({ pathname: "/sourcing-import", params: { supplierId: s.supplierId } });
    if (s.primaryAction === "enable") return schedule.mutate({ sourceId: s.id, enabled: true }, { onError: (e) => toast({ text: userMessage(e), tone: "error" }) });
    if (s.primaryAction === "sync_now") return runSync(s);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={sources.isRefetching} onRefresh={() => void sources.refetch()} />}>
      {header}
      {list.length === 0 ? (
        <EmptyState icon={<Plug size={26} color={color.ink2} />} title="Aucune source pour l'instant" description="Connectez votre premier fournisseur : importez sa liste de stock, ajoutez le lien de flux qu'il vous a fourni ou activez un catalogue public de la bibliothèque." actions={[{ label: "Explorer la bibliothèque", onPress: () => router.push("/supplier-directory") }]} />
      ) : (
        <MetricStrip
          metrics={[
            { label: "Actives", value: formatNumber(active), hint: `sur ${formatNumber(list.length)}`, tone: active > 0 ? "success" : undefined },
            { label: "À corriger", value: formatNumber(toFix), hint: toFix ? "en échec" : "aucune", tone: toFix ? "danger" : undefined },
            { label: "Offres", value: formatNumber(offers), hint: lastSuccess ? `màj ${ageText(lastSuccess)}` : "jamais mises à jour" },
          ]}
        />
      )}
      {automatic.length > 0 ? <SectionHeader title={`Synchronisation automatique (${automatic.length})`} /> : null}
      {automatic.map((s) => (
        <SourceCard key={s.id} source={s} busy={sync.isPending && sync.variables === s.id} canWrite={permissions.canWrite} onPrimary={() => primary(s)} onSettings={permissions.isAdmin ? () => setSettings(s) : undefined} />
      ))}
      {live.length > 0 ? <SectionHeader title={`Recherche en direct (${live.length})`} /> : null}
      {live.length > 0 ? <Txt variant="label">Interrogées à chaque recherche de produit : leurs offres se mettent à jour quand vous cherchez, sans synchronisation.</Txt> : null}
      {live.map((s) => (
        <SourceCard key={s.id} source={s} busy={false} canWrite={permissions.canWrite} onPrimary={() => primary(s)} onSettings={permissions.isAdmin ? () => setSettings(s) : undefined} />
      ))}
      {manual.length > 0 ? <SectionHeader title={`Fichiers et saisie (${manual.length})`} /> : null}
      {manual.map((s) => (
        <SourceCard key={s.id} source={s} busy={false} canWrite={permissions.canWrite} onPrimary={() => primary(s)} onSettings={permissions.isAdmin ? () => setSettings(s) : undefined} />
      ))}
      {actions}
      <BottomSheet visible={settings !== null} title={settings?.name ?? ""} description={settings ? `${settings.methodLabel} · ${settings.statusLabel}` : undefined} onClose={() => setSettings(null)}>
        {settings?.schedulable ? (
          <>
            <Txt variant="label" color={color.ink}>
              Fréquence de synchronisation
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              {FREQUENCIES.map((f) => (
                <FilterChip
                  key={f.value}
                  label={f.label}
                  selected={settings.frequency === f.value}
                  onPress={() =>
                    schedule.mutate(
                      { sourceId: settings.id, frequency: f.value },
                      { onSuccess: (s) => setSettings(s), onError: (e) => toast({ text: userMessage(e), tone: "error" }) },
                    )
                  }
                />
              ))}
            </View>
          </>
        ) : settings?.kind === "live_search" ? (
          <Txt variant="bodyRegular">Source interrogée en direct à chaque recherche de produit (page publique, robots.txt respecté) : il n'y a rien à planifier.</Txt>
        ) : (
          <Txt variant="bodyRegular">Source alimentée par fichier : elle se met à jour à chaque nouvel import. Pour l'automatiser, demandez au fournisseur un lien de flux (CSV / XML) ou une API.</Txt>
        )}
        {settings ? (
          <Button
            label={settings.status === "disabled" ? "Réactiver la source" : "Désactiver la source"}
            variant="secondary"
            onPress={() => schedule.mutate({ sourceId: settings.id, enabled: settings.status === "disabled" }, { onSuccess: (s) => setSettings(s), onError: (e) => toast({ text: userMessage(e), tone: "error" }) })}
          />
        ) : null}
        <Button label="Fermer" variant="ghost" onPress={() => setSettings(null)} />
      </BottomSheet>
    </Screen>
  );
}

function SourceCard({ source: s, busy, canWrite, onPrimary, onSettings }: { source: SourceOverviewDTO; busy: boolean; canWrite: boolean; onPrimary: () => void; onSettings?: () => void }) {
  const action = s.primaryAction === "sync_now" ? "Synchroniser maintenant" : s.primaryAction === "import_file" ? "Importer la nouvelle liste" : s.primaryAction === "enable" ? "Réactiver" : "Configurer";
  const tone: BlockTone = s.status === "error" || s.consecutiveFailures > 0 ? "danger" : s.status === "connected" ? "success" : s.status === "running" ? "info" : s.status === "to_configure" ? "warning" : "neutral";
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${s.supplierName ?? s.name}, ${s.statusLabel}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <SupplierLogo domain={null} name={s.supplierName ?? s.name} size={36} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="body" numberOfLines={1}>
            {s.supplierName ?? s.name}
          </Txt>
          <Txt variant="label" numberOfLines={1}>
            {s.methodLabel}
            {s.country ? ` · ${s.country}` : ""}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space[3], rowGap: 2 }}>
        <StatusLine tone={tone} label={s.statusLabel} />
        <Txt variant="label" num color={color.ink}>
          {formatNumber(s.activeOffers)} offre{s.activeOffers > 1 ? "s" : ""} exploitable{s.activeOffers > 1 ? "s" : ""} · données {ageText(s.lastSuccessfulSyncAt)}
        </Txt>
      </View>
      <Txt variant="label">
        Dernier succès : {s.lastSuccessfulSyncAt ? formatDateTime(s.lastSuccessfulSyncAt) : "jamais"}
        {s.schedulable ? ` · ${s.frequencyLabel}${s.nextRunAt && s.frequency !== "manual" ? ` · prochain passage ${formatDateTime(s.nextRunAt)}` : ""}` : ""}
      </Txt>
      {s.consecutiveFailures > 0 || s.lastError ? (
        <View style={{ padding: space[3], borderRadius: radius.md, backgroundColor: color.dangerSoft }}>
          <Txt variant="label" color={color.dangerInk}>
            {s.consecutiveFailures > 0 ? `${s.consecutiveFailures} échec(s) consécutif(s). ` : ""}
            {s.lastError ?? ""}
          </Txt>
        </View>
      ) : null}
      {canWrite && (s.primaryAction !== "configure" || onSettings) ? (
        <View style={{ flexDirection: "row", gap: space[2] }}>
          {s.primaryAction !== "configure" ? <Button label={action} compact variant={tone === "danger" ? "primary" : "secondary"} loading={busy} disabled={s.primaryAction === "sync_now" && !s.canSyncNow} onPress={onPrimary} style={{ flex: 1 }} testID={`source-action-${s.id}`} /> : null}
          {onSettings ? <Button label="Réglages" compact variant="ghost" onPress={onSettings} testID={`source-settings-${s.id}`} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
