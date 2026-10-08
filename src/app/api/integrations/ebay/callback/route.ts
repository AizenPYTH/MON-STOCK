import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { toUserMessage } from "@/lib/errors";
import { getEbayConnector } from "@/integrations/core/registry";
import { ebayScopeList } from "@/integrations/ebay/config";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { upsertOAuthConnection } from "@/services/channels/connection-store";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PATH, oauthErrorCodeFor, type OAuthErrorCode } from "@/features/integrations/oauth-flow";

const log = createLogger("EBAY_OAUTH");

/**
 * Retour d'eBay après autorisation (« Your auth accepted URL » du RuName).
 * 1. valide l'état anti-CSRF : consommé atomiquement (DELETE … RETURNING, usage unique),
 *    non expiré, et identique au cookie httpOnly posé par /connect sur CE navigateur ;
 * 2. échange le code contre les tokens (jamais exposés) ;
 * 3. lit le compte vendeur (Identity API) ;
 * 4. enregistre la connexion (tokens chiffrés) et redirige vers l'assistant de configuration.
 * Les redirections sont construites côté serveur (origine de l'application + chemin fixe) :
 * aucun paramètre ne permet de rediriger ailleurs, et seul un CODE d'erreur circule dans l'URL.
 */
export async function GET(request: NextRequest) {
  const origin = publicEnv().NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const clearState = (res: NextResponse) => {
    res.cookies.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: OAUTH_STATE_COOKIE_PATH, maxAge: 0 });
    return res;
  };
  const fail = (code: OAuthErrorCode) => clearState(NextResponse.redirect(`${origin}/settings/integrations?error=${code}`));
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const ebayError = params.get("error");

  if (ebayError) {
    log.warn("autorisation eBay refusée", { error: ebayError.slice(0, 100), description: scrubSecrets(params.get("error_description") ?? "").slice(0, 300) });
    return fail(ebayError === "access_denied" ? "access_denied" : "ebay_error");
  }
  if (!code || !state || state.length > 200) return fail("incomplete");

  // Le navigateur qui termine le flux doit être celui qui l'a démarré (cookie posé par /connect).
  // Vérifié AVANT toute lecture en base : un lien forgé ne consomme rien.
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;
  if (!cookieState || cookieState !== state) {
    log.warn("callback eBay sans cookie d'état correspondant");
    return fail("browser_mismatch");
  }

  const admin = createAdminSupabaseClient();
  // Consommation atomique : deux callbacks simultanés avec le même état ne peuvent pas aboutir tous les deux.
  const { data: stateRow, error: stateError } = await admin.from("oauth_states").delete().eq("state", state).eq("provider", "ebay").select("*").maybeSingle();
  if (stateError) {
    log.error("lecture de l'état OAuth impossible", { error: stateError.message });
    return fail("state_check_failed");
  }
  if (!stateRow) return fail("state_unknown");
  if (new Date(stateRow.expires_at).getTime() < Date.now()) return fail("state_expired");

  const connector = getEbayConnector();
  const config = connector.config();
  if (!config) return fail("not_configured");

  try {
    const tokens = await connector.exchangeCode(code);
    const account = await connector.getAccountInfo({ getAccessToken: async () => tokens.accessToken });
    const { connection, isNew } = await upsertOAuthConnection({
      organizationId: stateRow.organization_id,
      userId: stateRow.created_by,
      provider: "ebay",
      environment: config.environment,
      account,
      tokens,
      scopes: ebayScopeList(),
    });
    log.info("connexion eBay établie", { connectionId: connection.id, orgId: stateRow.organization_id, username: account.username, isNew, environment: config.environment });
    const target = isNew || !connection.last_successful_sync_at ? `/settings/integrations/ebay/setup?connection=${connection.id}` : `/settings/integrations?connected=${connection.id}`;
    return clearState(NextResponse.redirect(`${origin}${target}`));
  } catch (e) {
    log.error("échec de la connexion eBay", { orgId: stateRow.organization_id, message: scrubSecrets(toUserMessage(e)) });
    return fail(oauthErrorCodeFor(e));
  }
}
