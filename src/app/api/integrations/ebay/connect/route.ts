import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext, isAdmin } from "@/features/auth/dal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { ebayWebConnect, isCanonicalOrigin, publicRequestOrigin } from "@/features/integrations/ebay-web";
import { buildOAuthState, isCrossSiteRequest, OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PATH, OAUTH_STATE_TTL_SECONDS, type OAuthErrorCode } from "@/features/integrations/oauth-flow";
import { DEFAULT_OAUTH_RETURN, OAUTH_RETURN_COOKIE, OAUTH_RETURN_FIELD, oauthErrorTarget, resolveOAuthReturn, stateRedirectFor, type OAuthReturnPath } from "@/features/integrations/oauth-return";

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
 * Champ facultatif `return_to` : page de retour (liste blanche exacte, voir oauth-return.ts), par
 * exemple `/onboarding/plateforme` pour le parcours d'inscription. Toute autre valeur est ignorée.
 */
async function readConnectForm(request: NextRequest): Promise<{ extended: boolean; returnTo: OAuthReturnPath }> {
  try {
    const form = await request.formData();
    return { extended: form.get("extended") === "1", returnTo: resolveOAuthReturn(form.get(OAUTH_RETURN_FIELD)) };
  } catch {
    // pas de corps de formulaire : connexion standard, retour vers les intégrations
    return { extended: false, returnTo: DEFAULT_OAUTH_RETURN };
  }
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const origin = publicEnv().NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const { extended, returnTo } = await readConnectForm(request);
  // 303 : le navigateur suit la redirection en GET (jamais un nouveau POST). Toujours vers l'origine
  // canonique et un chemin de la liste blanche.
  const back = (code: OAuthErrorCode) => NextResponse.redirect(`${origin}${oauthErrorTarget(returnTo, code)}`, { status: 303 });

  const requestOrigin = publicRequestOrigin(request.headers, request.nextUrl);
  if (isCrossSiteRequest(request.headers, [origin, request.nextUrl.origin, requestOrigin])) {
    log.warn("démarrage OAuth refusé : requête inter-sites", { origin: request.headers.get("origin"), site: request.headers.get("sec-fetch-site") });
    return back("cross_site");
  }

  // Le retour eBay arrive sur le domaine canonique : un flux lancé ailleurs perdrait son cookie d'état.
  if (!isCanonicalOrigin(requestOrigin, origin)) {
    log.warn("démarrage OAuth refusé : domaine non canonique", { origin: requestOrigin });
    return back("wrong_host");
  }

  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(returnTo)}`, { status: 303 });
  }
  if (!isAdmin(ctx.role)) return back("not_admin");

  const web = ebayWebConnect();
  if (web.status !== "ready") return back(web.status);
  const connector = web.connector;

  const state = buildOAuthState(randomToken(32), extended);
  const admin = createAdminSupabaseClient();
  // Ménage opportuniste des états expirés (jamais consommés).
  await admin.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("oauth_states").insert({
    state,
    organization_id: ctx.organization.id,
    provider: "ebay",
    created_by: ctx.user.id,
    // Page de retour retenue CÔTÉ SERVEUR (source de vérité du callback après consommation de l'état).
    redirect_to: stateRedirectFor(returnTo),
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) {
    log.error("impossible d'enregistrer l'état OAuth", { orgId: ctx.organization.id, error: error.message });
    return back("state_failed");
  }

  log.info("redirection vers eBay", { orgId: ctx.organization.id, userId: ctx.user.id, environment: connector.config()?.environment, extended, returnTo });
  const response = NextResponse.redirect(connector.getAuthorizeUrl(state, { extended }), { status: 303 });
  // L'état est aussi lié au navigateur qui a démarré le flux (cookie httpOnly, 15 min) : le callback
  // exige la correspondance cookie ↔ state, ce qu'un tiers ne peut pas forger.
  response.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: OAUTH_STATE_COOKIE_PATH, maxAge: OAUTH_STATE_TTL_SECONDS });
  // Page de retour des échecs survenus avant la lecture de l'état (refus chez eBay…) : posée hors du
  // retour par défaut, effacée sinon (un flux précédent ne doit pas déteindre), revalidée au callback.
  response.cookies.set(OAUTH_RETURN_COOKIE, returnTo === DEFAULT_OAUTH_RETURN ? "" : returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: returnTo === DEFAULT_OAUTH_RETURN ? 0 : OAUTH_STATE_TTL_SECONDS,
  });
  return response;
}

/** Démarrage uniquement par POST (formulaire) : un simple lien ou une image ne peut pas déclencher le flux (CSRF). */
export async function POST(request: NextRequest) {
  return handle(request);
}
