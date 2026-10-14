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

/**
 * Contrôle d'exploitation de l'analyse « bonne affaire » : exécute la recherche Fournisseurs de
 * l'organisation (en direct ou non) au nom d'un de ses membres et résume les niveaux obtenus.
 * Lecture seule hormis l'enregistrement normal des offres trouvées en direct (comme une recherche
 * faite dans l'application).
 */
export async function checkDealAnalysis(input: { organizationId: string; userId: string; query: string; live: boolean }): Promise<Record<string, unknown>> {
  const admin = createAdminSupabaseClient();
  const { data: org } = await admin.from("organizations").select("*").eq("id", input.organizationId).maybeSingle();
  if (!org) return { organization: null };
  const { data: member } = await admin.from("organization_members").select("role").eq("organization_id", org.id).eq("user_id", input.userId).maybeSingle();
  if (!member) return { organization: org.id, error: "utilisateur non membre de l'organisation" };
  const ctx = { supabase: admin, organization: org, user: { id: input.userId }, role: member.role, profile: null, memberships: [] } as unknown as import("@/features/auth/dal").OrgContext;
  const { simpleSupplierSearch } = await import("@/services/sourcing/simple-search");
  const r = await simpleSupplierSearch(ctx, input.query, input.live ? {} : { live: async () => ({ sources: [] }) as never });
  const levels: Record<string, number> = {};
  const basis: Record<string, number> = {};
  for (const o of r.offers) {
    levels[o.deal?.level ?? "none"] = (levels[o.deal?.level ?? "none"] ?? 0) + 1;
    basis[o.deal?.marketBasis ?? "none"] = (basis[o.deal?.marketBasis ?? "none"] ?? 0) + 1;
  }
  const order = { very_good: 0, good: 1, average: 2, not_competitive: 3, insufficient_data: 4 } as const;
  const top = [...r.offers]
    .filter((o) => o.deal && o.deal.level !== "insufficient_data")
    .sort((a, b) => order[a.deal!.level] - order[b.deal!.level] || (b.deal!.score ?? 0) - (a.deal!.score ?? 0))
    .slice(0, 15)
    .map((o) => ({ title: o.title.slice(0, 90), supplier: o.supplierName, level: o.deal!.level, supplierPrice: o.deal!.supplierPrice, marketPrice: o.deal!.marketPrice, marketBasis: o.deal!.marketBasis, marketCount: o.deal!.marketCount, totalCost: o.deal!.totalCost, resalePrice: o.deal!.resalePrice, margin: o.deal!.margin, marginPercent: o.deal!.marginPercent, provisional: o.deal!.provisional, uncertainties: o.deal!.uncertainties.length }));
  return { organization: org.id, query: r.query, total: r.total, offers: r.offers.length, partial: r.partial, durationMs: r.durationMs, checked: r.checked, levels, basis, missingCostSettings: r.missingCostSettings ?? null, top };
}
