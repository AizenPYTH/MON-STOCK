import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { toUserMessage } from "@/lib/errors";
import { getEbayConnector } from "@/integrations/core/registry";
import { ebayScopeList } from "@/integrations/ebay/config";
import { upsertOAuthConnection } from "@/services/channels/connection-store";

const log = createLogger("EBAY_OAUTH");

/**
 * Retour d'eBay après autorisation (« Your auth accepted URL » du RuName).
 * 1. valide l'état anti-CSRF (existe, non expiré, supprimé après usage) ;
 * 2. échange le code contre les tokens (jamais exposés) ;
 * 3. lit le compte vendeur (Identity API) ;
 * 4. enregistre la connexion (tokens chiffrés) et redirige vers l'assistant de configuration.
 */
export async function GET(request: NextRequest) {
  const origin = publicEnv().NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const fail = (message: string) => NextResponse.redirect(`${origin}/settings/integrations?error=${encodeURIComponent(message)}`);
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const ebayError = params.get("error");

  if (ebayError) {
    const description = params.get("error_description");
    log.warn("autorisation eBay refusée", { error: ebayError, description });
    return fail(ebayError === "access_denied" ? "Vous avez refusé l'autorisation sur eBay : aucune connexion n'a été créée." : `eBay a renvoyé une erreur (${ebayError}${description ? ` : ${description}` : ""}).`);
  }
  if (!code || !state) return fail("Retour eBay incomplet (code ou état manquant). Relancez la connexion.");

  const admin = createAdminSupabaseClient();
  const { data: stateRow, error: stateError } = await admin.from("oauth_states").select("*").eq("state", state).eq("provider", "ebay").maybeSingle();
  if (stateError) {
    log.error("lecture de l'état OAuth impossible", { error: stateError.message });
    return fail("Impossible de vérifier l'état de la connexion. Réessayez.");
  }
  if (!stateRow) return fail("État de connexion inconnu ou déjà utilisé. Relancez la connexion eBay.");
  await admin.from("oauth_states").delete().eq("state", state);
  if (new Date(stateRow.expires_at).getTime() < Date.now()) return fail("La demande de connexion a expiré (15 min). Relancez la connexion eBay.");

  const connector = getEbayConnector();
  const config = connector.config();
  if (!config) return fail("Intégration eBay non configurée sur ce serveur.");

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
    return NextResponse.redirect(`${origin}${target}`);
  } catch (e) {
    log.error("échec de la connexion eBay", { orgId: stateRow.organization_id, message: toUserMessage(e) });
    return fail(`Connexion eBay impossible : ${toUserMessage(e)}`);
  }
}
