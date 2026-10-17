import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AlertTriangle, CheckCircle2, Copy, FileWarning, FileX2, Info, Repeat, Share2, ShieldAlert, SearchX, type LucideIcon } from "lucide-react-native";
import type { ImportJobDetailDTO } from "@/features/mobile-api/contract";
import { useImportJob } from "~/data/hooks";
import { IMPORT_STATUS_LABEL, ISSUE_KIND_LABEL, issuesCsv } from "~/data/sourcing-b2b";
import { useActiveOrg } from "~/org/org-provider";
import { userMessage } from "~/lib/errors";
import { formatNumber, formatRelative } from "~/lib/format";
import { SupplierLogo } from "~/components/supplier-logo";
import { ActionRow, Card, DetailHeader, ErrorState, FilterChip, MonoTitle, Screen, SkeletonList, SplitBar, StageFigure, Txt, useToast, type BlockTone } from "~/components/ui";
import { color, radius, space } from "~/theme/tokens";

type Kind = ImportJobDetailDTO["issues"][number]["kind"];

const STATUS_ICON: Record<ImportJobDetailDTO["status"], LucideIcon> = { completed: CheckCircle2, partial: FileWarning, failed: FileX2, quarantined: ShieldAlert, running: Repeat, skipped_duplicate: Copy };
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
  const header = <DetailHeader parentLabel="Imports" title="Rapport" />;
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

  const failed = j.status === "failed" || j.status === "quarantined";
  const chip = failed ? { fg: color.dangerOnDark, bg: "rgba(242,163,163,0.14)" } : j.status === "partial" ? { fg: color.accent, bg: "rgba(229,163,77,0.16)" } : j.status === "completed" ? { fg: color.mint, bg: "rgba(139,232,190,0.14)" } : { fg: color.inkOnDarkMuted, bg: color.nightRaised };
  const StatusIcon = STATUS_ICON[j.status];
  const stage = (
    <View style={{ gap: space[4], marginTop: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <SupplierLogo domain={null} name={j.supplierName ?? "Import"} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="title1" color={color.inkOnDark} accessibilityRole="header" numberOfLines={1} style={{ fontSize: 24, lineHeight: 30 }}>
            {j.supplierName ?? "Import"}
          </Txt>
          <Txt variant="code" color={color.inkOnDarkMuted} numberOfLines={1} style={{ textTransform: "uppercase", fontSize: 10.5 }}>
            {[j.fileName ?? "flux", j.mode === "snapshot" ? "catalogue complet" : "mise à jour partielle"].join(" · ")}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space[3] }}>
        <View style={{ gap: 2, flexShrink: 0 }}>
          <StageFigure value={formatNumber(j.counts.read)} size="lg" />
          <Txt variant="monoSm" color={color.inkOnDarkMuted}>
            Lignes lues · {formatNumber(j.counts.valid)} valides
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6, paddingBottom: 2, flexShrink: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs, backgroundColor: chip.bg }}>
            <StatusIcon size={13} color={chip.fg} strokeWidth={2.2} />
            <Txt variant="label" color={chip.fg} style={{ fontFamily: "Manrope_700Bold", fontSize: 12, flexShrink: 1 }} numberOfLines={2} testID="import-status">
              {IMPORT_STATUS_LABEL[j.status]}
            </Txt>
          </View>
          <Txt variant="code" color={color.inkOnDarkSubtle} style={{ fontSize: 10.5 }}>
            {formatRelative(j.startedAt)}
          </Txt>
        </View>
      </View>
    </View>
  );

  return (
    <Screen>
      <DetailHeader parentLabel="Imports" stage={stage} />
      {failed ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 10, padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: color.dangerLine, backgroundColor: color.dangerSoft }}>
          <FileX2 size={18} color={color.dangerInk} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="body" color={color.dangerInk} style={{ fontFamily: "Manrope_700Bold" }}>
              Le fichier n'a pas été importé
            </Txt>
            {j.message ? (
              <Txt variant="label" color={color.dangerInk}>
                {j.message}
              </Txt>
            ) : null}
          </View>
        </View>
      ) : (
        <Card padded style={{ gap: space[3] }}>
          <MonoTitle title="Répartition des lignes" />
          {j.counts.read > 0 ? (
            <SplitBar
              height={12}
              legend="grid"
              label="Répartition des lignes"
              parts={[
                { label: "Nouvelles", value: j.counts.created, tone: "success" },
                { label: "Mises à jour", value: j.counts.updated, tone: "brand" },
                { label: "Inchangées", value: j.counts.unchanged, tone: "neutral" },
                { label: "Ignorées", value: ignored, tone: "warning" },
              ]}
            />
          ) : (
            <Txt variant="label">Aucune ligne lue.</Txt>
          )}
          {j.message ? <Txt variant="note">{j.message}</Txt> : null}
          {j.counts.expired > 0 ? (
            <Txt variant="note">
              {formatNumber(j.counts.expired)} offre{j.counts.expired > 1 ? "s" : ""} absente{j.counts.expired > 1 ? "s" : ""} du catalogue complet : marquée{j.counts.expired > 1 ? "s" : ""} expirée{j.counts.expired > 1 ? "s" : ""} (historique conservé).
            </Txt>
          ) : null}
          {j.truncated ? (
            <Txt variant="note" color={color.dangerInk}>
              Fichier tronqué : seules les 5 000 premières lignes ont été traitées.
            </Txt>
          ) : null}
        </Card>
      )}

      {permissions.canWrite && (j.status === "failed" || j.status === "partial" || j.status === "quarantined") ? (
        <Card>
          <ActionRow icon={Repeat} tone="info" title="Relancer un import corrigé" detail="Colonnes reprises, ajustables" onPress={reimport} last testID="import-retry" />
        </Card>
      ) : null}

      <MonoTitle
        title="Rapport d'erreurs"
        count={j.issues.length}
        right={
          j.issues.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Exporter le rapport (CSV)" hitSlop={10} onPress={() => void exportCsv()} testID="import-issues-export" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 5, opacity: pressed ? 0.6 : 1 })}>
              <Share2 size={14} color={color.ink} strokeWidth={2.2} />
              <Txt variant="label" color={color.ink} style={{ fontFamily: "Manrope_700Bold" }}>
                Exporter (CSV)
              </Txt>
            </Pressable>
          ) : undefined
        }
      />
      {j.issues.length === 0 ? (
        <Card>
          <ActionRow icon={CheckCircle2} tone="success" title="Aucune ligne ignorée" last />
        </Card>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <FilterChip label="Toutes" count={j.issues.length} selected={kind === "all"} onPress={() => setKind("all")} />
            {byKind.map(([k, n]) => (
              <FilterChip key={k} label={ISSUE_KIND_LABEL[k]} count={n} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </ScrollView>
          <Txt variant="note">{kind !== "all" ? KIND_HINT[kind] : `${formatNumber(j.issues.length)} ligne${j.issues.length > 1 ? "s" : ""} à vérifier${j.issues.length >= 500 ? " (500 premières)" : ""}, en ${byKind.length} catégorie${byKind.length > 1 ? "s" : ""}.`}</Txt>
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
