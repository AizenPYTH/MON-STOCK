import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import { useActiveOrg } from "~/org/org-provider";
import { useScheduleSource, useSources, useSyncSource } from "~/data/hooks";
import { SOURCE_STATUS_TONE } from "~/data/sourcing-b2b";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { BottomSheet, Button, Card, DetailHeader, EmptyState, ErrorState, FilterChip, Screen, SectionHeader, SkeletonList, StatusChip, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

const FREQUENCIES: { value: SourceOverviewDTO["frequency"]; label: string }[] = [
  { value: "manual", label: "Manuelle" },
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

  const header = <DetailHeader parentLabel="Sourcing" title="Mes sources" sub="Statut réel, âge des données et synchronisation" />;
  const actions = (
    <>
      {permissions.canWrite ? (
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Button label="Importer un fichier" compact onPress={() => router.push("/sourcing-import")} style={{ flex: 1 }} testID="sources-import" />
          <Button label="Ajouter un flux autorisé" compact variant="secondary" onPress={() => router.push("/sourcing-feed-new")} style={{ flex: 1 }} testID="sources-add-feed" />
        </View>
      ) : null}
      <Button label="Historique des imports" variant="ghost" compact onPress={() => router.push("/sourcing-imports")} testID="sources-history" />
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

  const list = sources.data;
  const automatic = list.filter((s) => s.schedulable);
  const manual = list.filter((s) => !s.schedulable);

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
      {actions}
      {list.length === 0 ? <EmptyState title="Aucune source" description="Importez la liste de stock d'un grossiste ou ajoutez le lien de flux qu'il vous a fourni." /> : null}
      {automatic.length > 0 ? <SectionHeader title={`Synchronisation automatique (${automatic.length})`} /> : null}
      {automatic.map((s) => (
        <SourceCard key={s.id} source={s} busy={sync.isPending && sync.variables === s.id} canWrite={permissions.canWrite} onPrimary={() => primary(s)} onSettings={permissions.isAdmin ? () => setSettings(s) : undefined} />
      ))}
      {manual.length > 0 ? <SectionHeader title={`Fichiers et saisie (${manual.length})`} /> : null}
      {manual.map((s) => (
        <SourceCard key={s.id} source={s} busy={false} canWrite={permissions.canWrite} onPrimary={() => primary(s)} onSettings={permissions.isAdmin ? () => setSettings(s) : undefined} />
      ))}
      <Txt variant="label">
        Une panne du fournisseur n'efface jamais vos offres : elles gardent leur date de vérification et un nouvel essai est programmé (15 min, puis 30 min, 1 h…). Une alerte apparaît après 3 échecs consécutifs.
      </Txt>
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
  return (
    <Card padded style={{ gap: space[2] }} accessibilityLabel={`${s.supplierName ?? s.name}, ${s.statusLabel}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space[2] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body" numberOfLines={2}>
            {s.supplierName ?? s.name}
          </Txt>
          <Txt variant="label" numberOfLines={1}>
            {s.methodLabel}
            {s.country ? ` · ${s.country}` : ""}
          </Txt>
        </View>
        <StatusChip label={s.statusLabel} tone={SOURCE_STATUS_TONE[s.status]} />
      </View>
      <Txt variant="label" color={color.ink}>
        {formatNumber(s.activeOffers)} offre{s.activeOffers > 1 ? "s" : ""} exploitable{s.activeOffers > 1 ? "s" : ""} · données {ageText(s.lastSuccessfulSyncAt)}
      </Txt>
      <Txt variant="label">
        Dernier succès : {s.lastSuccessfulSyncAt ? formatDateTime(s.lastSuccessfulSyncAt) : "jamais"}
        {s.schedulable ? ` · ${s.frequencyLabel}${s.nextRunAt && s.frequency !== "manual" ? ` · prochain passage ${formatDateTime(s.nextRunAt)}` : ""}` : ""}
      </Txt>
      {s.consecutiveFailures > 0 || s.lastError ? (
        <Txt variant="label" color={color.dangerInk}>
          {s.consecutiveFailures > 0 ? `${s.consecutiveFailures} échec(s) consécutif(s). ` : ""}
          {s.lastError ?? ""}
        </Txt>
      ) : null}
      {canWrite && s.primaryAction !== "configure" ? (
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Button label={action} compact loading={busy} disabled={s.primaryAction === "sync_now" && !s.canSyncNow} onPress={onPrimary} style={{ flex: 1 }} testID={`source-action-${s.id}`} />
          {onSettings ? <Button label="Réglages" compact variant="secondary" onPress={onSettings} testID={`source-settings-${s.id}`} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
