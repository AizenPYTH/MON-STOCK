import { useMemo, useState } from "react";
import { ScrollView, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AlertTriangle, CheckCircle2, Copy, FileWarning, FileX2, Info, Repeat, Share2, ShieldAlert, SearchX, type LucideIcon } from "lucide-react-native";
import type { ImportJobDetailDTO } from "@/features/mobile-api/contract";
import { useImportJob } from "~/data/hooks";
import { IMPORT_STATUS_LABEL, ISSUE_KIND_LABEL, issuesCsv } from "~/data/sourcing-b2b";
import { useActiveOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { formatDateTime, formatNumber } from "~/lib/format";
import { ActionRow, Button, Card, DetailHeader, ErrorState, FilterChip, IconBadge, Screen, SectionHeader, SkeletonList, SplitBar, Txt, useToast, type BlockTone } from "~/components/ui";
import { color, space } from "~/theme/tokens";

type Kind = ImportJobDetailDTO["issues"][number]["kind"];

const STATUS_ICON: Record<ImportJobDetailDTO["status"], LucideIcon> = { completed: CheckCircle2, partial: FileWarning, failed: FileX2, quarantined: ShieldAlert, running: Repeat, skipped_duplicate: Copy };
const STATUS_TONE: Record<ImportJobDetailDTO["status"], BlockTone> = { completed: "success", partial: "warning", failed: "danger", quarantined: "warning", running: "info", skipped_duplicate: "neutral" };
const KIND_ICON: Record<Kind, LucideIcon> = { invalid: AlertTriangle, duplicate: Copy, rejected: FileX2, unrecognized: SearchX, warning: Info };
const KIND_TONE: Record<Kind, BlockTone> = { invalid: "danger", duplicate: "neutral", rejected: "danger", unrecognized: "warning", warning: "info" };

/** Que faire pour chaque type de ligne ignorée (affiché dans le rapport). */
const KIND_HINT: Record<Kind, string> = {
  invalid: "Prix ou colonne obligatoire illisible : corrigez la colonne dans le fichier ou l'association des colonnes.",
  duplicate: "Même référence plusieurs fois : seule la première ligne est conservée.",
  rejected: "Valeur refusée par les contrôles de qualité (prix aberrant, devise inconnue…).",
  unrecognized: "Modèle introuvable dans le titre : ajoutez une colonne modèle ou marque.",
  warning: "Remarque sans blocage : une valeur par défaut a été appliquée.",
};

/** Rapport d'un import : résultat, répartition des lignes, erreurs par catégorie, export CSV et relance. */
export default function ImportJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useImportJob(id ?? "");
  const header = <DetailHeader parentLabel="Imports" title="Rapport d'import" />;
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
  return <Report job={job.data} />;
}

function Report({ job: j }: { job: ImportJobDetailDTO }) {
  const toast = useToast();
  const { permissions } = useActiveOrg();
  const [kind, setKind] = useState<Kind | "all">("all");
  const byKind = useMemo(() => {
    const m = new Map<Kind, number>();
    for (const i of j.issues) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [j.issues]);
  const shown = kind === "all" ? j.issues : j.issues.filter((i) => i.kind === kind);
  const ignored = j.counts.duplicates + j.counts.invalid + j.counts.rejected + j.counts.unrecognized;
  const exportCsv = async () => {
    try {
      const r = await Share.share({ title: `Rapport d'import ${j.supplierName ?? ""}`.trim(), message: issuesCsv(j) });
      if (r.action === Share.sharedAction) toast({ text: `Rapport exporté (${formatNumber(j.issues.length)} ligne${j.issues.length > 1 ? "s" : ""}, CSV compatible Excel).` });
    } catch {
      toast({ text: "Export impossible sur cet appareil.", tone: "error" });
    }
  };
  const reimport = () => router.push({ pathname: "/sourcing-import", params: { ...(j.supplierId ? { supplierId: j.supplierId } : {}), ...(j.supplierName ? { supplierName: j.supplierName } : {}) } });

  return (
    <Screen>
      <DetailHeader parentLabel="Imports" title={j.supplierName ?? "Import"} sub={`${j.fileName ?? "flux"} · ${formatDateTime(j.startedAt)} · ${j.mode === "snapshot" ? "catalogue complet" : "mise à jour partielle"}`} />
      <Card padded style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <IconBadge icon={STATUS_ICON[j.status]} tone={STATUS_TONE[j.status]} size={44} />
          <View style={{ flex: 1 }}>
            <Txt variant="headline" testID="import-status">
              {IMPORT_STATUS_LABEL[j.status]}
            </Txt>
            <Txt variant="label" num>
              {formatNumber(j.counts.read)} ligne{j.counts.read > 1 ? "s" : ""} lue{j.counts.read > 1 ? "s" : ""} · {formatNumber(j.counts.valid)} valide{j.counts.valid > 1 ? "s" : ""}
            </Txt>
          </View>
        </View>
        {j.message ? (
          <Txt variant="bodyRegular" color={j.status === "failed" ? color.dangerInk : color.ink2}>
            {j.message}
          </Txt>
        ) : null}
        {j.counts.read > 0 ? (
          <SplitBar
            label="Répartition des lignes"
            parts={[
              { label: "Nouvelles", value: j.counts.created, tone: "success" },
              { label: "Mises à jour", value: j.counts.updated, tone: "brand" },
              { label: "Inchangées", value: j.counts.unchanged, tone: "neutral" },
              { label: "Ignorées", value: ignored, tone: "warning" },
            ]}
          />
        ) : null}
        {j.counts.expired > 0 ? (
          <Txt variant="label">
            {formatNumber(j.counts.expired)} offre{j.counts.expired > 1 ? "s" : ""} absente{j.counts.expired > 1 ? "s" : ""} du catalogue complet : marquée{j.counts.expired > 1 ? "s" : ""} expirée{j.counts.expired > 1 ? "s" : ""} (historique conservé).
          </Txt>
        ) : null}
        {j.truncated ? (
          <Txt variant="label" color={color.dangerInk}>
            Fichier tronqué : seules les 5 000 premières lignes ont été traitées. Demandez un export filtré.
          </Txt>
        ) : null}
      </Card>

      {permissions.canWrite && (j.status === "failed" || j.status === "partial" || j.status === "quarantined") ? (
        <Card>
          <ActionRow icon={Repeat} tone="info" title="Relancer un import corrigé" detail="Même fournisseur ; la correspondance des colonnes est reprise et ajustable" onPress={reimport} last testID="import-retry" />
        </Card>
      ) : null}

      <SectionHeader title="Rapport d'erreurs" count={j.issues.length} />
      {j.issues.length === 0 ? (
        <Card>
          <ActionRow icon={CheckCircle2} tone="success" title="Aucune ligne ignorée" detail="Toutes les lignes lues ont été prises en compte." last />
        </Card>
      ) : (
        <>
          <Card padded style={{ gap: space[3] }}>
            <Txt variant="bodyRegular">
              {formatNumber(j.issues.length)} ligne{j.issues.length > 1 ? "s" : ""} à vérifier{j.issues.length >= 500 ? " (500 premières)" : ""}, en {byKind.length} catégorie{byKind.length > 1 ? "s" : ""}. Exportez le rapport pour le corriger dans Excel ou le transmettre au fournisseur.
            </Txt>
            <Button label="Exporter le rapport (CSV)" icon={<Share2 size={16} color={color.onMint} strokeWidth={2.4} />} onPress={() => void exportCsv()} testID="import-issues-export" />
          </Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <FilterChip label="Toutes" count={j.issues.length} selected={kind === "all"} onPress={() => setKind("all")} />
            {byKind.map(([k, n]) => (
              <FilterChip key={k} label={ISSUE_KIND_LABEL[k]} count={n} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </ScrollView>
          {kind !== "all" ? <Txt variant="label">{KIND_HINT[kind]}</Txt> : null}
          <Card>
            {shown.slice(0, 200).map((i, k) => (
              <ActionRow
                key={`${i.line}-${k}`}
                icon={KIND_ICON[i.kind]}
                tone={KIND_TONE[i.kind]}
                title={`${ISSUE_KIND_LABEL[i.kind]}${i.line ? ` · ligne ${i.line}` : ""}`}
                detail={`${i.reference ? `${i.reference} — ` : ""}${i.message}`}
                titleLines={1}
                last={k === Math.min(shown.length, 200) - 1}
              />
            ))}
          </Card>
          {shown.length > 200 ? <Txt variant="label">… {formatNumber(shown.length - 200)} autres lignes dans le CSV exporté.</Txt> : null}
        </>
      )}
    </Screen>
  );
}
