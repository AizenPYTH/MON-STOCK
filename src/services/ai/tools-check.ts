import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ASSISTANT_TOOLS, runAssistantTool } from "./assistant-tools";

/**
 * Vérification serveur (CRON_SECRET) des requêtes de l'assistant sur le schéma RÉEL : chaque
 * outil est exécuté en lecture seule pour une organisation et seul un résumé est renvoyé
 * (succès / erreur / taille), jamais les données elles-mêmes.
 */
export async function checkAssistantTools(organizationId?: string): Promise<{ organization: string | null; tools: { name: string; ok: boolean; bytes: number; error: string | null; keys: string[] }[] }> {
  const admin = createAdminSupabaseClient();
  let orgId = organizationId ?? null;
  let currency = "EUR";
  const { data: org } = orgId
    ? await admin.from("organizations").select("id, default_currency").eq("id", orgId).maybeSingle()
    : await admin.from("organizations").select("id, default_currency").order("created_at").limit(1).maybeSingle();
  if (!org) return { organization: null, tools: [] };
  orgId = org.id;
  currency = org.default_currency;
  const ctx = { supabase: admin, organizationId: orgId, currency };
  const tools = [];
  for (const name of Object.keys(ASSISTANT_TOOLS)) {
    const r = await runAssistantTool(ctx, name, { days: 365 });
    let keys: string[] = [];
    try {
      keys = r.isError ? [] : Object.keys(JSON.parse(r.content) as object);
    } catch {
      keys = [];
    }
    tools.push({ name, ok: !r.isError, bytes: r.content.length, error: r.isError ? r.content.slice(0, 300) : null, keys });
  }
  return { organization: orgId, tools };
}
