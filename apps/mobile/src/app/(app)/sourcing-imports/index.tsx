import { RefreshControl } from "react-native";
import { router } from "expo-router";
import type { ImportJobDTO } from "@/features/mobile-api/contract";
import { useImportJobs } from "~/data/hooks";
import { IMPORT_STATUS_LABEL } from "~/data/sourcing-b2b";
import { userMessage } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";
import { Card, DetailHeader, EmptyState, ErrorState, ListRow, Screen, SkeletonList, StatusChip, Txt } from "~/components/ui";

const tone = (s: ImportJobDTO["status"]) => (s === "completed" ? "success" : s === "failed" ? "danger" : s === "quarantined" || s === "partial" ? "accent" : "neutral");

/** Résumé d'un import : nouvelles, mises à jour, inchangées, ignorées. */
export function countsText(c: ImportJobDTO["counts"]): string {
  const ignored = c.duplicates + c.invalid + c.rejected;
  return [`${c.created} nouvelle${c.created > 1 ? "s" : ""}`, `${c.updated} mise${c.updated > 1 ? "s" : ""} à jour`, `${c.unchanged} inchangée${c.unchanged > 1 ? "s" : ""}`, ignored ? `${ignored} ignorée${ignored > 1 ? "s" : ""}` : null, c.expired ? `${c.expired} expirée${c.expired > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
}

/** Historique des imports de l'organisation (fichiers et flux), du plus récent au plus ancien. */
export default function ImportHistoryScreen() {
  const jobs = useImportJobs();
  const header = <DetailHeader parentLabel="Mes sources" title="Historique des imports" />;
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
        <EmptyState title="Aucun import" description="Importez la liste de stock d'un fournisseur depuis Sourcing → Importer." />
      ) : (
        <Card>
          {jobs.data.map((j, i) => (
            <ListRow
              key={j.id}
              testID={`import-${j.id}`}
              title={`${j.supplierName ?? "Fournisseur"} · ${j.fileName ?? "flux"}`}
              subtitle={`${formatDateTime(j.startedAt)} · ${j.mode === "snapshot" ? "catalogue complet" : "mise à jour partielle"} · ${countsText(j.counts)}`}
              right={<StatusChip label={IMPORT_STATUS_LABEL[j.status]} tone={tone(j.status)} />}
              chevron
              last={i === jobs.data.length - 1}
              onPress={() => router.push({ pathname: "/sourcing-imports/[id]", params: { id: j.id } })}
            />
          ))}
        </Card>
      )}
      <Txt variant="label">Chaque import conserve le fichier d'origine (nom et empreinte), l'utilisateur et le détail des lignes ignorées.</Txt>
    </Screen>
  );
}
