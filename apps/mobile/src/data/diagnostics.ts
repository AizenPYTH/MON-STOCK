import type { IntegrationsDTO, SourcingStatusDTO } from "@/features/mobile-api/contract";
import type { MobileSupabase } from "~/lib/supabase";
import { callApi } from "~/lib/api";
import { userMessage } from "~/lib/errors";

/**
 * Diagnostic de l'application : chaque contrôle est un VRAI appel (base, serveur, sources, eBay)
 * avec sa durée. Aucune valeur secrète n'est jamais affichée : seuls des états (configuré ou non),
 * des dates et des messages d'erreur destinés à l'utilisateur.
 */
export type CheckState = "ok" | "warning" | "error";

export interface DiagnosticCheck {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  durationMs: number | null;
}

export interface HealthDTO {
  ok: boolean;
  ebayConfigured: boolean;
  ebayEnvironment: string | null;
  cronConfigured: boolean;
  aiConfigured?: boolean;
  encryptionConfigured: boolean;
  time: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; error: string | null; ms: number }> {
  const t = Date.now();
  try {
    return { value: await fn(), error: null, ms: Date.now() - t };
  } catch (e) {
    return { value: null, error: userMessage(e), ms: Date.now() - t };
  }
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "jamais");

export async function runDiagnostics(supabase: MobileSupabase, ctx: { organizationId: string; organizationName: string; role: string; email: string | null }): Promise<DiagnosticCheck[]> {
  const out: DiagnosticCheck[] = [];
  const [db, health, status, integrations] = await Promise.all([
    timed(async () => {
      const { error } = await supabase.from("organizations").select("id").eq("id", ctx.organizationId).limit(1);
      if (error) throw error;
      return true;
    }),
    timed(() => callApi<HealthDTO>("/health", { timeoutMs: 20_000 })),
    timed(() => callApi<SourcingStatusDTO>("/sourcing/status", { organizationId: ctx.organizationId, timeoutMs: 30_000 })),
    timed(() => callApi<IntegrationsDTO>("/integrations", { organizationId: ctx.organizationId, timeoutMs: 30_000 })),
  ]);

  out.push({ key: "db", label: "Base de données (Supabase)", state: db.error ? "error" : "ok", detail: db.error ?? "Connexion et droits d'accès vérifiés.", durationMs: db.ms });
  out.push({ key: "account", label: "Compte et organisation", state: "ok", detail: `${ctx.email ?? "Compte connecté"} · ${ctx.organizationName} · rôle ${ctx.role}`, durationMs: null });

  const h = health.value;
  out.push({
    key: "server",
    label: "Serveur MON STOCK",
    state: health.error ? "error" : h?.cronConfigured && h.encryptionConfigured ? "ok" : "warning",
    detail: health.error ?? `Joignable. Tâches planifiées ${h?.cronConfigured ? "actives" : "non configurées"} ; chiffrement ${h?.encryptionConfigured ? "configuré" : "absent"}.`,
    durationMs: health.ms,
  });
  out.push({
    key: "ai",
    label: "Assistant IA",
    state: h?.aiConfigured ? "ok" : "warning",
    detail: h?.aiConfigured ? "Clé configurée sur le serveur." : "Non activé : clé ANTHROPIC_API_KEY à ajouter dans les secrets de l'Edge Function. La dictée et le reste de l'application fonctionnent sans.",
    durationMs: null,
  });

  if (status.error) out.push({ key: "sourcing", label: "Sourcing", state: "error", detail: status.error, durationMs: status.ms });
  else {
    const items = status.value?.items ?? [];
    const active = items.find((i) => i.key === "sources_active")?.value ?? items.find((i) => /active/.test(i.key))?.value ?? null;
    out.push({ key: "sourcing", label: "Sourcing", state: active ? "ok" : "warning", detail: items.map((i) => `${i.label} : ${i.value}`).join(" · ") || "Aucune donnée.", durationMs: status.ms });
  }

  if (integrations.error) out.push({ key: "ebay", label: "eBay", state: "error", detail: integrations.error, durationMs: integrations.ms });
  else {
    const i = integrations.value!;
    const conn = i.connections.find((c) => c.provider === "ebay" && c.status !== "disconnected");
    out.push({
      key: "ebay",
      label: "eBay",
      state: !i.ebay.configured ? "warning" : !conn ? "warning" : conn.status === "connected" && !conn.lastError ? "ok" : "error",
      detail: !i.ebay.configured
        ? "Clés d'application eBay non configurées sur le serveur."
        : !conn
          ? "Aucun compte connecté (Réglages → Intégrations → eBay)."
          : `${conn.externalUsername ?? "Compte"} · ${conn.status} · dernière synchronisation réussie : ${fmt(conn.lastSuccessfulSyncAt)}${conn.lastError ? ` · erreur : ${conn.lastError}` : ""}`,
      durationMs: integrations.ms,
    });
  }
  return out;
}
