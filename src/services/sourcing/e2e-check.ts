import "server-only";
import type { User } from "@supabase/supabase-js";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sourcingSearch } from "@/features/mobile-api/service";
import type { SourcingSearchDTO } from "@/features/mobile-api/contract";
import { getLibrarySource } from "@/services/sourcing/source-library";

/**
 * Vérification de bout en bout du pipeline de recherche (outil serveur, CRON_SECRET) :
 * organisation TEMPORAIRE → source de la bibliothèque (dernière vérification « ok » requise) →
 * recherche en direct réelle (adaptateur, robots.txt, stockage, classement, DTO mobile) →
 * suppression de l'organisation (cascade). Aucune donnée d'une organisation réelle n'est touchée.
 */
export async function runSearchSelfTest(query: string, libraryKey: string): Promise<{ result: SourcingSearchDTO | null; error: string | null; cleaned: boolean }> {
  const admin = createAdminSupabaseClient();
  const entry = getLibrarySource(libraryKey);
  if (!entry) return { result: null, error: "Source inconnue.", cleaned: true };
  const { data: check } = await admin.from("sourcing_library_checks").select("status, adapter, checked_at").eq("key", libraryKey).maybeSingle();
  if (check?.status !== "ok") return { result: null, error: "La source n'a pas passé la vérification en direct.", cleaned: true };
  // Auteur technique des lignes temporaires : un utilisateur existant (contraintes de clés étrangères).
  const { data: anyMember } = await admin.from("organization_members").select("user_id").limit(1).maybeSingle();
  const slug = `verif-serveur-${Date.now().toString(36)}`;
  const { data: org, error: orgErr } = await admin.from("organizations").insert({ name: "Vérification serveur (temporaire)", slug, default_currency: "EUR", country: "FR" }).select("*").single();
  if (orgErr || !org) return { result: null, error: orgErr?.message ?? "organisation non créée", cleaned: true };
  try {
    const { data: supplier } = await admin.from("suppliers").insert({ organization_id: org.id, name: entry.name, website: entry.website, country: entry.country.length === 2 ? entry.country : null, currency: entry.currency }).select("id").single();
    if (!supplier) throw new Error("fournisseur non créé");
    const { error: srcErr } = await admin.from("supplier_sources").insert({
      organization_id: org.id,
      supplier_id: supplier.id,
      name: entry.name,
      source_type: entry.access === "official_api" ? "API" : "PUBLIC_WEB",
      base_url: entry.baseUrl,
      country: entry.country.length === 2 ? entry.country : null,
      default_currency: entry.currency,
      default_tax_type: entry.taxType,
      access_conditions: "Vérification serveur temporaire (organisation supprimée après le test).",
      automated_access_confirmed: true,
      robots_checked_at: check.checked_at,
      robots_allowed: true,
      status: "active",
      config: { adapter: check.adapter ?? entry.adapter, library_key: entry.key } as unknown as NonNullable<Json>,
    });
    if (srcErr) throw new Error(srcErr.message);
    const ctx = {
      supabase: admin,
      user: { id: anyMember?.user_id ?? "00000000-0000-0000-0000-000000000000" } as User,
      profile: null,
      organization: org,
      role: "viewer",
      memberships: [],
    } as unknown as OrgContext;
    const result = await sourcingSearch(ctx, { q: query, page: 1, live: "1" });
    return { result, error: null, cleaned: await cleanup(org.id) };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e), cleaned: await cleanup(org.id) };
  }

  async function cleanup(orgId: string): Promise<boolean> {
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    return !error;
  }
}

/**
 * Vérification de bout en bout de l'IMPORT DE CATALOGUE sur la vraie base (outil serveur,
 * CRON_SECRET) : organisation TEMPORAIRE, grille de test (2 lignes valides, 1 sans prix),
 * import par le pipeline réel (fournisseur, source, flux, offres, journal), relecture,
 * suppression de l'organisation. Les lignes de test n'existent que le temps du contrôle.
 */
export async function runImportSelfTest(): Promise<{ ok: boolean; result: unknown; offers: number; runStatus: string | null; error: string | null; cleaned: boolean }> {
  const admin = createAdminSupabaseClient();
  const { data: anyMember } = await admin.from("organization_members").select("user_id").limit(1).maybeSingle();
  const slug = `verif-import-${Date.now().toString(36)}`;
  const { data: org, error: orgErr } = await admin.from("organizations").insert({ name: "Vérification import (temporaire)", slug, default_currency: "EUR", country: "FR" }).select("*").single();
  if (orgErr || !org) return { ok: false, result: null, offers: 0, runStatus: null, error: orgErr?.message ?? "organisation non créée", cleaned: true };
  const cleanup = async () => !(await admin.from("organizations").delete().eq("id", org.id)).error;
  try {
    const csv = ["Réf.;Désignation article;Prix HT (€);Qté dispo", "TEST-IMPORT-1;Article de contrôle A (test serveur);10,50;3", "TEST-IMPORT-2;Article de contrôle B (test serveur);1 249,00;1", "TEST-IMPORT-3;Article sans prix (test serveur);;0"].join("\r\n");
    const ctx = {
      supabase: admin,
      user: { id: anyMember?.user_id ?? "00000000-0000-0000-0000-000000000000" } as User,
      profile: null,
      organization: org,
      role: "owner",
      memberships: [],
    } as unknown as OrgContext;
    const file = { fileName: "controle.csv", contentBase64: btoa(String.fromCharCode(...new TextEncoder().encode(csv))) };
    const { previewCatalogFile, importCatalogFile } = await import("@/services/sourcing/catalog-import");
    const preview = previewCatalogFile({ file }, "EUR");
    const r = await importCatalogFile(ctx, { file, mapping: preview.mapping, defaults: { currency: "EUR", taxType: "ht" }, supplierName: "Fournisseur de contrôle (test serveur)" });
    const { count } = await admin.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    const { data: run } = await admin.from("sync_runs").select("status").eq("organization_id", org.id).order("started_at", { ascending: false }).limit(1).maybeSingle();
    return { ok: r.result.stored === 2 && r.result.invalidRows === 1, result: { preview: { validCount: preview.validCount, invalidCount: preview.invalidCount, mapping: preview.mapping }, import: r.result }, offers: count ?? 0, runStatus: run?.status ?? null, error: null, cleaned: await cleanup() };
  } catch (e) {
    return { ok: false, result: null, offers: 0, runStatus: null, error: e instanceof Error ? e.message : String(e), cleaned: await cleanup() };
  }
}
