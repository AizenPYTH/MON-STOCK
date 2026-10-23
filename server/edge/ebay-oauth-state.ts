import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

const log = createLogger("EDGE_API");

export interface OAuthStateRow {
  state: string;
  organization_id: string;
  created_by: string | null;
  expires_at: string;
}

/**
 * Consomme l'état OAuth eBay de la finalisation mobile (S-24). La suppression (usage unique,
 * DELETE … RETURNING) ne vise QUE l'état créé par CE même utilisateur pour CETTE organisation :
 * un autre administrateur de l'organisation (ou un tiers) qui rejoue l'état reçoit un refus et le
 * flux en cours de son auteur reste intact. Ce n'est qu'en l'absence de ligne correspondante qu'on
 * distingue, sans rien supprimer, « appartient à quelqu'un d'autre » de « inconnu / déjà utilisé ».
 */
export async function consumeEbayOAuthState(admin: AdminSupabaseClient, input: { state: string; userId: string; organizationId: string }): Promise<OAuthStateRow> {
  const { data: row, error } = await admin
    .from("oauth_states")
    .delete()
    .eq("state", input.state)
    .eq("provider", "ebay")
    .eq("created_by", input.userId)
    .eq("organization_id", input.organizationId)
    .select("state, organization_id, created_by, expires_at")
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "Vérification de la demande de connexion impossible. Réessayez.");
  if (row) return row as OAuthStateRow;
  const { data: other, error: lookupError } = await admin.from("oauth_states").select("state").eq("state", input.state).eq("provider", "ebay").maybeSingle();
  if (lookupError) throw new AppError("INTERNAL", "Vérification de la demande de connexion impossible. Réessayez.");
  if (other) {
    log.warn("finalisation eBay refusée : état créé par un autre utilisateur ou une autre organisation (état conservé)", { orgId: input.organizationId });
    throw new AppError("FORBIDDEN", "Cette autorisation eBay n'a pas été demandée depuis votre session : relancez la connexion.");
  }
  throw new AppError("VALIDATION", "Demande de connexion inconnue ou déjà utilisée : relancez la connexion eBay.");
}
