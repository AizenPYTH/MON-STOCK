import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useImportJob } from "~/data/hooks";
import { IMPORT_STATUS_LABEL, ISSUE_KIND_LABEL } from "~/data/sourcing-b2b";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { Card, DetailHeader, ErrorState, Screen, SectionHeader, SkeletonList, StatusChip, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Détail d'un import : compteurs et lignes ignorées avec leur raison (500 au maximum). */
export default function ImportJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useImportJob(id ?? "");
  const header = <DetailHeader parentLabel="Historique" title="Import" />;
  if (job.isPending)
    return (
      <Screen scroll={false}>
        {header}
        <SkeletonList rows={6} thumb={false} />
      </Screen>
    );
  if (job.isError || !job.data)
    return (
      <Screen scroll={false}>
        {header}
        <ErrorState description={job.isError ? userMessage(job.error) : "Import introuvable."} onRetry={() => void job.refetch()} />
      </Screen>
    );
  const j = job.data;
  const rows: [string, number][] = [
    ["Lignes lues", j.counts.read],
    ["Offres nouvelles", j.counts.created],
    ["Offres mises à jour", j.counts.updated],
    ["Offres inchangées", j.counts.unchanged],
    ["Doublons dans le fichier", j.counts.duplicates],
    ["Lignes illisibles", j.counts.invalid],
    ["Offres rejetées", j.counts.rejected],
    ["Produits non reconnus", j.counts.unrecognized],
    ["Offres expirées (absentes du catalogue complet)", j.counts.expired],
  ];
  return (
    <Screen>
      <DetailHeader parentLabel="Historique" title={j.supplierName ?? "Import"} sub={`${j.fileName ?? "flux"} · ${formatDateTime(j.startedAt)}`} />
      <View style={{ flexDirection: "row", gap: space[2], flexWrap: "wrap" }}>
        <StatusChip label={IMPORT_STATUS_LABEL[j.status]} tone={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "accent"} />
        <StatusChip label={j.mode === "snapshot" ? "Catalogue complet" : "Mise à jour partielle"} tone="neutral" />
      </View>
      {j.message ? <Txt variant="bodyRegular">{j.message}</Txt> : null}
      <Card padded style={{ gap: space[2] }}>
        {rows.map(([label, n]) => (
          <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}>
            <Txt variant="label" style={{ flex: 1 }}>
              {label}
            </Txt>
            <Txt variant="body" num>
              {formatNumber(n)}
            </Txt>
          </View>
        ))}
      </Card>
      {j.truncated ? <Txt variant="label" color={color.dangerInk}>Fichier tronqué : seules les 5 000 premières lignes ont été traitées. Demandez un export filtré.</Txt> : null}
      <SectionHeader title={`Lignes à vérifier (${j.issues.length})`} />
      {j.issues.length === 0 ? (
        <Txt variant="label">Aucune ligne ignorée.</Txt>
      ) : (
        <Card padded style={{ gap: space[3] }}>
          {j.issues.map((i, k) => (
            <View key={`${i.line}-${k}`} style={{ gap: 2 }} accessible accessibilityLabel={`${ISSUE_KIND_LABEL[i.kind]}${i.line ? `, ligne ${i.line}` : ""}, ${i.message}`}>
              <Txt variant="label" color={color.ink}>
                {ISSUE_KIND_LABEL[i.kind]}
                {i.line ? ` · ligne ${i.line}` : ""}
                {i.reference ? ` · ${i.reference}` : ""}
              </Txt>
              <Txt variant="label">{i.message}</Txt>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
