import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext, isAdmin } from "@/features/auth/dal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { ebayWebConnect, isCanonicalOrigin } from "@/features/integrations/ebay-web";
import { buildOAuthState, isCrossSiteRequest, OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PATH, OAUTH_STATE_TTL_SECONDS, type OAuthErrorCode } from "@/features/integrations/oauth-flow";

const log = createLogger("EBAY_OAUTH");

/**
 * Démarre la connexion eBay (OAuth 2.0, authorization code grant).
 * Réservé aux administrateurs de l'organisation. Un état anti-CSRF aléatoire, lié à
 * l'organisation et à l'utilisateur, est enregistré (15 min) puis le vendeur est redirigé
 * vers la page d'autorisation eBay : il saisit ses identifiants CHEZ eBay, jamais ici.
 * Champ de formulaire facultatif `extended=1` : « Autoriser l'analyse complète » (autorisations en
 * lecture supplémentaires : finances, trafic, marketing), mémorisé dans l'état OAuth.
 * W-06 : RuName web dédié (EBAY_WEB_RU_NAME) exigé, jamais celui du relais iPhone.
 * W-29 : démarrage refusé hors du domaine canonique (NEXT_PUBLIC_APP_URL), renvoi vers celui-ci.
 */
async function wantsExtended(request: NextRequest): Promise<boolean> {
  try {
    const form = await request.formData();
    return form.get("extended") === "1";
  } catch {
    return false; // pas de corps de formulaire : connexion standard
  }
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const origin = publicEnv().NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  // 303 : le navigateur suit la redirection en GET (jamais un nouveau POST).
  const back = (code: OAuthErrorCode) => NextResponse.redirect(`${origin}/settings/integrations?error=${code}`, { status: 303 });

  if (isCrossSiteRequest(request.headers, [origin, request.nextUrl.origin])) {
    log.warn("démarrage OAuth refusé : requête inter-sites", { origin: request.headers.get("origin"), site: request.headers.get("sec-fetch-site") });
    return back("cross_site");
  }

  // Le retour eBay arrive sur le domaine canonique : un flux lancé ailleurs perdrait son cookie d'état.
  if (!isCanonicalOrigin(request.nextUrl.origin, origin)) {
    log.warn("démarrage OAuth refusé : domaine non canonique", { host: request.nextUrl.host });
    return back("wrong_host");
  }

  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/settings/integrations")}`, { status: 303 });
  }
  if (!isAdmin(ctx.role)) return back("not_admin");

  const web = ebayWebConnect();
  if (web.status !== "ready") return back(web.status);
  const connector = web.connector;

  const extended = await wantsExtended(request);
  const state = buildOAuthState(randomToken(32), extended);
  const admin = createAdminSupabaseClient();
  // Ménage opportuniste des états expirés (jamais consommés).
  await admin.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("oauth_states").insert({
    state,
    organization_id: ctx.organization.id,
    provider: "ebay",
    created_by: ctx.user.id,
    redirect_to: "/settings/integrations/ebay/setup",
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) {
    log.error("impossible d'enregistrer l'état OAuth", { orgId: ctx.organization.id, error: error.message });
    return back("state_failed");
  }

  log.info("redirection vers eBay", { orgId: ctx.organization.id, userId: ctx.user.id, environment: connector.config()?.environment, extended });
  const response = NextResponse.redirect(connector.getAuthorizeUrl(state, { extended }), { status: 303 });
  // L'état est aussi lié au navigateur qui a démarré le flux (cookie httpOnly, 15 min) : le callback
  // exige la correspondance cookie ↔ state, ce qu'un tiers ne peut pas forger.
  response.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: OAUTH_STATE_COOKIE_PATH, maxAge: OAUTH_STATE_TTL_SECONDS });
  return response;
}

/** Démarrage uniquement par POST (formulaire) : un simple lien ou une image ne peut pas déclencher le flux (CSRF). */
export async function POST(request: NextRequest) {
  return handle(request);
}
