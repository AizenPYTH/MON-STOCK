import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("ORG");

/**
 * Fenêtre pendant laquelle une nouvelle création d'organisation du même nom, par le même
 * utilisateur, est considérée comme une répétition (double clic, nouvel essai quand le navigateur
 * a réaffiché l'onboarding alors que la création avait réussi — W-01) et non comme une intention.
 */
export const DUPLICATE_CREATION_WINDOW_MS = 2 * 60_000;

/** Comparaison de noms tolérante (casse, espaces multiples, accents décomposés). */
export function sameOrganizationName(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
  return norm(a) === norm(b);
}

/**
 * Organisation créée par `userId` dans la fenêtre récente et portant le même nom (organisation réelle)
 * ou de démonstration (`isDemo` : une seule à la fois suffit). Lecture sous RLS : l'utilisateur voit
 * les organisations dont il est membre. Une erreur de lecture ne bloque pas la création (journalisée).
 */
export async function findRecentDuplicateOrganization(
  supabase: ServerSupabaseClient,
  input: { userId: string; name: string | null; isDemo: boolean; now?: Date },
): Promise<string | null> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - DUPLICATE_CREATION_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .eq("created_by", input.userId)
    .eq("is_demo", input.isDemo)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    log.warn("duplicate organization check skipped", { userId: input.userId, reason: error.message });
    return null;
  }
  const match = (data ?? []).find((o) => input.isDemo || (input.name !== null && sameOrganizationName(o.name, input.name)));
  return match?.id ?? null;
}

/** Rend active une organisation dont l'utilisateur est membre (le déclencheur en base le revérifie). */
export async function openExistingOrganization(supabase: ServerSupabaseClient, userId: string, orgId: string): Promise<void> {
  const { error } = await supabase.from("user_profiles").update({ current_organization_id: orgId }).eq("user_id", userId);
  if (error) log.warn("existing organization not activated", { userId, orgId, reason: error.message });
}

/**
 * Fin d'une création d'organisation (réelle ou démo). La revalidation AVANT la redirection est
 * indispensable (W-01) : sans elle, la réponse de l'action ne porte pas l'en-tête
 * `x-action-revalidated` (Next 16.4, `action-handler.js` → `addRevalidationHeader` : posé seulement
 * si un tag/chemin est revalidé ou un cookie modifié). Le routeur client garde alors son cache
 * (préchargements `/` → `/dashboard` → `/onboarding` appris quand l'utilisateur n'avait pas
 * d'organisation) et peut réafficher l'onboarding. Avec `revalidatePath("/", "layout")`, le client
 * vide le BFCache et tout le cache de préchargement, puis navigue en `FreshnessPolicy.RefreshAll`
 * (`server-action-reducer.js`).
 */
export function finishOrganizationCreation(): never {
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
