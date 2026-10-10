import { RefreshControl, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from "lucide-react-native";
import { useUser } from "~/auth/session-provider";
import { useActiveOrg } from "~/org/org-provider";
import { runDiagnostics, type CheckState } from "~/data/diagnostics";
import { requireSupabase } from "~/lib/supabase";
import { appConfig } from "~/lib/config";
import { Card, DetailHeader, Screen, SkeletonList, Txt } from "~/components/ui";
import { color, space } from "~/theme/tokens";

/** Diagnostic : état réel de chaque service, sans jamais afficher de jeton, de clé ou de secret. */
const ICON: Record<CheckState, LucideIcon> = { ok: CircleCheck, warning: CircleAlert, error: CircleX };
const TONE: Record<CheckState, string> = { ok: color.success, warning: color.accent, error: color.danger };

export default function DiagnosticsScreen() {
  const user = useUser();
  const { active } = useActiveOrg();
  const q = useQuery({
    queryKey: [active.organization.id, "diagnostics"],
    queryFn: () => runDiagnostics(requireSupabase(), { organizationId: active.organization.id, organizationName: active.organization.name, role: active.role, email: user?.email ?? null }),
    staleTime: 0,
    retry: 0,
  });

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <DetailHeader parentLabel="Réglages" />
      <Txt variant="title2" accessibilityRole="header">
        Diagnostic
      </Txt>
      <Txt variant="label">Environnement : {appConfig.ok ? appConfig.config.appEnv : "configuration incomplète"} · tirez vers le bas pour relancer les contrôles.</Txt>
      {q.isPending ? <SkeletonList rows={6} thumb={false} /> : null}
      {(q.data ?? []).map((c) => {
        const Icon = ICON[c.state];
        return (
          <Card key={c.key} padded style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <Icon size={18} color={TONE[c.state]} />
              <Txt variant="headline" style={{ flex: 1 }}>
                {c.label}
              </Txt>
              {c.durationMs !== null ? <Txt variant="label">{c.durationMs} ms</Txt> : null}
            </View>
            <Txt variant="label" color={color.ink2}>
              {c.detail}
            </Txt>
          </Card>
        );
      })}
      <Txt variant="label">Aucun jeton, clé ni secret n'est affiché ici : uniquement des états et des messages destinés à l'utilisateur.</Txt>
    </Screen>
  );
}
