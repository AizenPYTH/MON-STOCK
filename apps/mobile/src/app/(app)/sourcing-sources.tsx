import { useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { CircleCheck, CircleX, ExternalLink, KeyRound } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { useActivateSource, useSourceLibrary } from "~/data/hooks";
import { CHECK_STATUS_LABEL, LIBRARY_ACCESS_LABEL, LIBRARY_SEGMENT_LABEL, sampleOf, type LibraryEntry } from "~/data/sourcing-live";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatMoney } from "~/lib/format";
import { safeExternalUrl } from "~/lib/url";
import { BottomSheet, Button, Card, DetailHeader, EmptyState, ErrorState, Screen, SectionHeader, SkeletonList, StatusChip, Txt, useToast } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/**
 * Bibliothèque de sources fournisseurs : chaque source affiche le résultat de sa DERNIÈRE
 * VÉRIFICATION RÉELLE par le serveur (robots.txt + produits avec prix, exemples à l'appui).
 * Seules les sources vérifiées sont activables, après attestation des conditions d'utilisation.
 */
export default function SourcingSourcesScreen() {
  const library = useSourceLibrary();
  const activate = useActivateSource();
  const { permissions } = useActiveOrg();
  const toast = useToast();
  const [pending, setPending] = useState<LibraryEntry | null>(null);

  if (library.isPending)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (library.isError)
    return (
      <Screen scroll={false}>
        <DetailHeader parentLabel="Sourcing" />
        <ErrorState description={userMessage(library.error)} onRetry={() => void library.refetch()} />
      </Screen>
    );

  const entries = library.data.entries;
  const active = entries.filter((e) => e.sourceId);
  const ready = entries.filter((e) => !e.sourceId && e.activatable);
  const blocked = entries.filter((e) => !e.sourceId && !e.activatable);

  function confirm() {
    if (!pending) return;
    const entry = pending;
    activate.mutate(entry.key, {
      onSuccess: () => {
        setPending(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast({ text: `${entry.name} activée : elle sera interrogée à chaque recherche.` });
      },
      onError: (e) => {
        setPending(null);
        toast({ text: userMessage(e), tone: "error" });
      },
    });
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={library.isRefetching} onRefresh={() => void library.refetch()} />}>
      <DetailHeader parentLabel="Sourcing" />
      <View style={{ gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">
          Sources fournisseurs
        </Txt>
        <Txt variant="label">Vérifiées chaque jour par le serveur : robots.txt respecté, produits avec prix réellement obtenus. Une source non vérifiée n'est jamais présentée comme connectée.</Txt>
      </View>
      {entries.length === 0 ? <EmptyState title="Aucune source" description="La bibliothèque est vide." /> : null}
      {active.length > 0 ? (
        <>
          <SectionHeader title={`Activées (${active.length})`} />
          {active.map((e) => (
            <SourceCard key={e.key} entry={e} />
          ))}
        </>
      ) : null}
      {ready.length > 0 ? (
        <>
          <SectionHeader title={`Vérifiées, activables (${ready.length})`} />
          {ready.map((e) => (
            <SourceCard key={e.key} entry={e} action={permissions.canWrite ? { label: "Activer", onPress: () => setPending(e) } : undefined} />
          ))}
        </>
      ) : null}
      {blocked.length > 0 ? (
        <>
          <SectionHeader title={`Non activables (${blocked.length})`} />
          <Txt variant="label">Résultat de la dernière vérification réelle. Ces fournisseurs n'exposent pas leur catalogue publiquement (compte professionnel, robots.txt, site non lisible) ou attendent des clés d'API.</Txt>
          {blocked.map((e) => (
            <SourceCard key={e.key} entry={e} />
          ))}
        </>
      ) : null}
      <BottomSheet
        visible={pending !== null}
        onClose={() => setPending(null)}
        title={`Activer ${pending?.name ?? ""} ?`}
        description="Le serveur MON STOCK lira automatiquement les offres publiques de cette source lors de vos recherches (robots.txt respecté, une requête à la fois). En activant, vous attestez avoir lu ses conditions d'utilisation et qu'elles autorisent cet usage."
      >
        {pending ? <Button label="Lire les conditions d'utilisation" variant="secondary" onPress={() => { const u = safeExternalUrl(pending.termsUrl); if (u) void WebBrowser.openBrowserAsync(u).catch(() => {}); }} /> : null}
        <Button label="J'atteste et j'active" loading={activate.isPending} onPress={confirm} testID="source-activate-confirm" />
        <Button label="Annuler" variant="ghost" onPress={() => setPending(null)} />
      </BottomSheet>
    </Screen>
  );
}

function SourceCard({ entry: e, action }: { entry: LibraryEntry; action?: { label: string; onPress: () => void } }) {
  const status = e.check?.status ?? null;
  const ok = status === "ok";
  const samples = sampleOf(e);
  const site = safeExternalUrl(e.website);
  return (
    <Card padded style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start" }}>
        {e.sourceId || ok ? <CircleCheck size={20} color={color.success} /> : status === "not_configured" ? <KeyRound size={20} color={color.accent} /> : <CircleX size={20} color={color.ink3} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body">{e.name}</Txt>
          <Txt variant="label">
            {LIBRARY_SEGMENT_LABEL[e.segment]} · {e.country} · {LIBRARY_ACCESS_LABEL[e.access]}
          </Txt>
        </View>
        {e.sourceId ? <StatusChip label="Activée" tone="success" /> : null}
      </View>
      <Txt variant="label">{e.notes}</Txt>
      <Txt variant="label" color={ok ? color.success : color.ink2}>
        {status ? `${CHECK_STATUS_LABEL[status] ?? status}${e.check?.checkedAt ? ` · ${formatDateTime(e.check.checkedAt)}` : ""}` : "Pas encore vérifiée"}
        {!ok && e.check?.message ? ` — ${e.check.message.slice(0, 160)}` : ""}
      </Txt>
      {samples.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Txt variant="label">Relevé lors de la vérification :</Txt>
          {samples.map((s) => (
            <Txt key={s.title} variant="label" color={color.ink}>
              • {s.title} — {s.price === null ? "prix non communiqué" : formatMoney(s.price, s.currency ?? e.currency)}
            </Txt>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] }}>
        {site ? (
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(site).catch(() => {})} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}>
            <ExternalLink size={14} color={color.ink2} />
            <Txt variant="label">Site du fournisseur</Txt>
          </Pressable>
        ) : (
          <View />
        )}
        {action ? <Button label={action.label} compact onPress={action.onPress} /> : null}
      </View>
    </Card>
  );
}
