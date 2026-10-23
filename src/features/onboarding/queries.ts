import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { isAdmin } from "@/features/auth/dal";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { isWebPreview } from "@/lib/supabase/preview";
import { createLogger } from "@/lib/logger";
import { getIntegrationsOverview } from "@/features/integrations/queries";
import { ONBOARDING_PLATFORM_PATH, SETTINGS_STATE_REDIRECT } from "@/features/integrations/oauth-return";
import type { PlatformInputs } from "@/features/onboarding/platform-state";

const log = createLogger("ONBOARDING");

/**
 * Dernière demande d'autorisation eBay WEB lancée par cet utilisateur pour cette organisation, encore
 * valable et pas encore consommée par le callback (`oauth_states`). La table n'est lisible que par le
 * service_role (aucun droit pour `authenticated`) : lecture serveur restreinte à l'organisation
 * résolue par la DAL et à l'utilisateur connecté, une seule colonne (date). En cas d'échec : null
 * (rien n'est affirmé, l'état « en cours » n'est simplement pas affiché).
 */
async function readPendingOAuth(ctx: OrgContext, now: Date): Promise<string | null> {
  try {
    // Aperçu visuel (jamais en production) : la base en mémoire tient lieu de service_role.
    const client: AdminSupabaseClient = isWebPreview() ? (ctx.supabase as unknown as AdminSupabaseClient) : createAdminSupabaseClient();
    const { data, error } = await client
      .from("oauth_states")
      .select("created_at")
      .eq("organization_id", ctx.organization.id)
      .eq("provider", "ebay")
      .eq("created_by", ctx.user.id)
      .in("redirect_to", [ONBOARDING_PLATFORM_PATH, SETTINGS_STATE_REDIRECT])
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0]?.created_at ?? null;
  } catch (e) {
    log.warn("demande d'autorisation eBay en attente non lue", { orgId: ctx.organization.id, error: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e) });
    return null;
  }
}

/** Faits réels de l'étape « plateforme » : connexion eBay (même source que /settings/integrations), attente OAuth, configuration, rôle. */
export async function getPlatformFacts(ctx: OrgContext): Promise<Omit<PlatformInputs, "params">> {
  const now = new Date();
  const [overview, pendingSince] = await Promise.all([getIntegrationsOverview(ctx), readPendingOAuth(ctx, now)]);
  return {
    webConnect: overview.ebay.webConnect,
    admin: isAdmin(ctx.role),
    connections: overview.connections
      .filter((v) => v.connection.provider === "ebay")
      .map(({ connection: c }) => ({
        id: c.id,
        status: c.status,
        username: c.external_username,
        environment: c.environment,
        connectedAt: c.connected_at,
        lastSuccessfulSyncAt: c.last_successful_sync_at,
      })),
    connectionsReadFailed: overview.queryError !== null,
    pendingSince,
  };
}
