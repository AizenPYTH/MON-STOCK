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

/**
 * Contrôle serveur en LECTURE SEULE des nouvelles routes sur le schéma réel (radar, annuaire,
 * suggestions de rapprochement, pré-remplissage d'annonce eBay) : seuls succès / erreur /
 * tailles sont renvoyés, jamais les données.
 */
export async function checkReadOnlyRoutes(organizationId?: string): Promise<{ organization: string | null; checks: { name: string; ok: boolean; error: string | null; summary: Record<string, number | string | boolean | null> }[] }> {
  const admin = createAdminSupabaseClient();
  const { data: org } = organizationId
    ? await admin.from("organizations").select("*").eq("id", organizationId).maybeSingle()
    : await admin.from("organizations").select("*").order("created_at").limit(1).maybeSingle();
  if (!org) return { organization: null, checks: [] };
  const ctx = { supabase: admin, organization: org, user: { id: "00000000-0000-0000-0000-000000000000" }, role: "viewer", profile: null, memberships: [] } as unknown as import("@/features/auth/dal").OrgContext;
  const checks: { name: string; ok: boolean; error: string | null; summary: Record<string, number | string | boolean | null> }[] = [];
  const run = async (name: string, fn: () => Promise<Record<string, number | string | boolean | null>>) => {
    try {
      checks.push({ name, ok: true, error: null, summary: await fn() });
    } catch (e) {
      checks.push({ name, ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e), summary: {} });
    }
  };
  const { buildRadar } = await import("@/services/radar/radar");
  const { directoryForOrg } = await import("@/services/sourcing/supplier-directory");
  const { listMatchSuggestions } = await import("@/services/sourcing/offer-linking");
  const { prefillListing, checkListing } = await import("@/services/channels/ebay-listing-service");
  await run("radar", async () => {
    const r = await buildRadar(ctx);
    return { items: r.items.length, restock: r.restock.length, skus: r.counts.skus, unlinkedOffers: r.counts.unlinkedOffers, missingSettings: r.missingSettings.length };
  });
  await run("directory", async () => {
    const d = await directoryForOrg(ctx);
    return { entries: d.entries.length, verified: d.entries.filter((e) => e.stages.includes("verified")).length, publicAccess: d.entries.filter((e) => e.stages.includes("public_access")).length, importTested: d.entries.filter((e) => e.stages.includes("import_tested")).length };
  });
  await run("match-suggestions", async () => ({ suggestions: (await listMatchSuggestions(ctx)).length }));
  const { data: sku } = await admin.from("skus").select("id").eq("organization_id", org.id).limit(1).maybeSingle();
  if (sku) {
    await run("ebay-prefill", async () => {
      const p = await prefillListing(ctx, sku.id);
      const c = await checkListing(ctx, { draft: p.draft, confirm: false });
      return { titleLength: p.draft.title.length, aspects: Object.keys(p.draft.aspects).length, checkOk: c.ok, errors: c.errors.length, publicationAllowed: c.publication.allowed };
    });
  }
  return { organization: org.id, checks };
}
