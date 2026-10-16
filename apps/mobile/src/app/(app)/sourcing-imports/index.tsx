import { RefreshControl } from "react-native";
import { CheckCircle2, Copy, FileWarning, FileX2, Loader, ShieldAlert, Upload } from "lucide-react-native";
import { useActiveOrg } from "~/org/org-provider";
import { router, useLocalSearchParams } from "expo-router";
import type { ImportJobDTO } from "@/features/mobile-api/contract";
import { useImportJobs } from "~/data/hooks";
import { IMPORT_STATUS_LABEL } from "~/data/sourcing-b2b";
import { userMessage } from "~/lib/errors";
import { formatNumber, formatRelative } from "~/lib/format";
import { ActionRow, Button, Card, DetailHeader, EmptyState, ErrorState, FadeIn, MetricStrip, Screen, SkeletonList, Txt, type BlockTone } from "~/components/ui";
import { color } from "~/theme/tokens";

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
  const header = <DetailHeader parentLabel="Sourcing" title="Imports de catalogues" sub="Chaque fichier ou flux importé, son résultat et ses lignes ignorées" right={newImport} />;
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
  const failed = jobs.data.filter((j) => j.status === "failed" || j.status === "quarantined").length;
  const updated = jobs.data.reduce((a, j) => a + j.counts.created + j.counts.updated, 0);
  const ignored = jobs.data.reduce((a, j) => a + j.counts.invalid + j.counts.rejected + j.counts.duplicates + j.counts.unrecognized, 0);
  return (
    <Screen refreshControl={<RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} />}>
      {header}
      {jobs.data.length === 0 ? (
        <EmptyState icon={<Upload size={26} color={color.ink2} />} title="Aucun import pour l'instant" description="Importez la liste de prix ou de stock reçue d'un fournisseur (CSV, Excel, XML, JSON) : aperçu, correspondance des colonnes et rapport d'erreurs inclus." actions={permissions.canWrite ? [{ label: "Importer un catalogue", onPress: () => router.push("/sourcing-import") }] : []} />
      ) : (
        <>
          <MetricStrip
            metrics={[
              { label: "Imports", value: formatNumber(jobs.data.length), hint: "récents" },
              { label: "Offres à jour", value: formatNumber(updated), hint: "créées + mises à jour", tone: updated > 0 ? "success" : undefined },
              { label: "Lignes ignorées", value: formatNumber(ignored), hint: failed ? `${failed} en échec` : "voir rapports", tone: failed ? "danger" : ignored ? "warning" : undefined },
            ]}
          />
          <Card>
            {jobs.data.map((j, i) => (
              <FadeIn key={j.id} index={i}>
                <ActionRow
                  testID={`import-${j.id}`}
                  icon={ICON[j.status]}
                  tone={TONE[j.status]}
                  title={`${j.supplierName ?? "Fournisseur"} · ${j.fileName ?? "flux"}`}
                  detail={`${IMPORT_STATUS_LABEL[j.status]} · ${formatRelative(j.startedAt)}\n${j.status === "failed" && j.message ? j.message : countsText(j.counts)}`}
                  detailLines={3}
                  onPress={() => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } })}
                  last={i === jobs.data.length - 1}
                />
              </FadeIn>
            ))}
          </Card>
        </>
      )}
      <Txt variant="label">Chaque import conserve le fichier d'origine (nom et empreinte), l'utilisateur et le détail des lignes ignorées. Un import ne s'annule pas : relancez-en un nouveau pour corriger.</Txt>
    </Screen>
  );
}
