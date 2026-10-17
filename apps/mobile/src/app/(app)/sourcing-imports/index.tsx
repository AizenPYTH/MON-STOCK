import { Pressable, RefreshControl, View } from "react-native";
import { CheckCircle2, ChevronRight, Copy, FileWarning, FileX2, Loader, ShieldAlert, Upload } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { router, useLocalSearchParams } from "expo-router";
import type { ImportJobDTO } from "@/features/mobile-api/contract";
import { useImportJobs } from "~/data/hooks";
import { IMPORT_STATUS_LABEL } from "~/data/sourcing-b2b";
import { userMessage } from "~/lib/errors";
import { formatNumber, formatRelative } from "~/lib/format";
import { Button, Card, DetailHeader, EmptyState, ErrorState, FadeIn, IconBadge, Screen, SkeletonList, SplitBar, StageStats, Txt, type BlockTone } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Résumé d'un import : nouvelles, mises à jour, inchangées, ignorées. */
export function countsText(c: ImportJobDTO["counts"]): string {
  const ignored = c.duplicates + c.invalid + c.rejected;
  return [`${c.created} nouvelle${c.created > 1 ? "s" : ""}`, `${c.updated} mise${c.updated > 1 ? "s" : ""} à jour`, `${c.unchanged} inchangée${c.unchanged > 1 ? "s" : ""}`, ignored ? `${ignored} ignorée${ignored > 1 ? "s" : ""}` : null, c.expired ? `${c.expired} expirée${c.expired > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
}

const ICON = { completed: CheckCircle2, partial: FileWarning, failed: FileX2, quarantined: ShieldAlert, running: Loader, skipped_duplicate: Copy } as const;
const TONE: Record<ImportJobDTO["status"], BlockTone> = { completed: "success", partial: "warning", failed: "danger", quarantined: "warning", running: "info", skipped_duplicate: "neutral" };

/** Historique des imports de l'organisation (fichiers et flux), du plus récent au plus ancien. */
export default function ImportHistoryScreen() {
  const { supplierId } = useLocalSearchParams<{ supplierId?: string }>();
  const jobs = useImportJobs(supplierId || undefined);
  const { permissions } = useActiveOrg();
  const newImport = permissions.canWrite ? <Button label="Importer" compact icon={<Upload size={16} color={color.onMint} strokeWidth={2.4} />} onPress={() => router.push({ pathname: "/sourcing-import", params: supplierId ? { supplierId } : {} })} testID="imports-new" /> : undefined;
  const totals = jobs.data
    ? {
        failed: jobs.data.filter((j) => j.status === "failed" || j.status === "quarantined").length,
        updated: jobs.data.reduce((a, j) => a + j.counts.created + j.counts.updated, 0),
        ignored: jobs.data.reduce((a, j) => a + j.counts.invalid + j.counts.rejected + j.counts.duplicates + j.counts.unrecognized, 0),
      }
    : null;
  const header = (
    <DetailHeader
      parentLabel="Sourcing"
      title="Imports"
      right={newImport}
      stage={
        jobs.data && jobs.data.length > 0 && totals ? (
          <StageStats
            light
            size={26}
            style={{ marginTop: space[4] }}
            stats={[
              { label: "Imports récents", value: formatNumber(jobs.data.length) },
              { label: "Offres à jour", value: formatNumber(totals.updated), tone: totals.updated > 0 ? "mint" : undefined },
              { label: "Lignes ignorées", value: formatNumber(totals.ignored), tone: totals.ignored ? "warning" : undefined },
            ]}
          />
        ) : undefined
      }
    />
  );
  if (jobs.isPending)
    return (
      <Screen scroll={false}>
        {header}
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (jobs.isError)
    return (
      <Screen scroll={false}>
        {header}
        <ErrorState description={userMessage(jobs.error)} onRetry={() => void jobs.refetch()} />
      </Screen>
    );
  return (
    <Screen refreshControl={<RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} />}>
      {header}
      {jobs.data.length === 0 ? (
        <EmptyState icon={<Upload size={26} color={color.ink2} />} title="Aucun import" description="CSV, Excel, XML ou JSON reçu d'un fournisseur." actions={permissions.canWrite ? [{ label: "Importer un catalogue", onPress: () => router.push("/sourcing-import") }] : []} />
      ) : (
        <>
          <Card>
            {jobs.data.map((j, i) => (
              <FadeIn key={j.id} index={i}>
                <ImportRow job={j} last={i === jobs.data.length - 1} />
              </FadeIn>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

/** Ligne d'historique : statut, fichier, résumé et mini-barre de répartition (vrais comptes). */
function ImportRow({ job: j, last }: { job: ImportJobDTO; last: boolean }) {
  const ignored = j.counts.duplicates + j.counts.invalid + j.counts.rejected + j.counts.unrecognized;
  const failed = j.status === "failed" || j.status === "quarantined";
  return (
    <Pressable
      testID={`import-${j.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${j.supplierName ?? "Fournisseur"}, ${j.fileName ?? "flux"}, ${IMPORT_STATUS_LABEL[j.status]}, ${formatRelative(j.startedAt)}. ${failed && j.message ? j.message : countsText(j.counts)}`}
      onPress={() => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } })}
      style={({ pressed }) => ({ flexDirection: "row", gap: space[3], paddingVertical: space[3], paddingHorizontal: 14, backgroundColor: pressed ? color.surfacePressed : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: color.lineSoft })}
    >
      <IconBadge icon={ICON[j.status]} tone={TONE[j.status]} size={32} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Txt variant="body" numberOfLines={1}>
          {j.supplierName ?? "Fournisseur"} · {j.fileName ?? "flux"}
        </Txt>
        <Txt variant="label" numberOfLines={1} style={{ fontSize: 12.5 }} color={failed ? color.dangerInk : color.ink3}>
          {IMPORT_STATUS_LABEL[j.status]} · {formatRelative(j.startedAt)}
        </Txt>
        <Txt variant="note" numberOfLines={2}>
          {failed && j.message ? j.message : countsText(j.counts)}
        </Txt>
        {!failed && j.counts.read > 0 ? (
          <View style={{ marginTop: 4 }}>
            <SplitBar
              height={5}
              legend="none"
              label="Répartition"
              parts={[
                { label: "Nouvelles", value: j.counts.created, tone: "success" },
                { label: "Mises à jour", value: j.counts.updated, tone: "brand" },
                { label: "Inchangées", value: j.counts.unchanged, tone: "neutral" },
                { label: "Ignorées", value: ignored, tone: "warning" },
              ]}
            />
          </View>
        ) : null}
      </View>
      <ChevronRight size={16} color={color.ink4} strokeWidth={2.2} style={{ alignSelf: "center" }} />
    </Pressable>
  );
}
