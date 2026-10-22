import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/db/database.types";
import { safeInternalPath } from "@/lib/utils";
import { isWebPreviewEnv, publicSupabaseAnonKey, publicSupabaseUrl } from "@/lib/site";
import { sessionCookieOptions, shouldUseSecureCookies } from "@/lib/supabase/cookie-options";


/**
 * Routes accessibles sans session. Tout le reste (pages de l'application, /onboarding,
 * routes API non listées) exige une session ; la vraie autorisation est faite dans la
 * couche d'accès aux données (DAL) et par la RLS.
 */
export const PUBLIC_PATHS = ["/sitemap.xml", "/robots.txt", "/confidentialite", "/conditions", "/mentions-legales", "/support", "/login", "/signup", "/reset-password", "/update-password", "/auth", "/api/webhooks", "/api/cron", "/api/integrations/ebay/callback", "/invite"] as const;

// Routes machine-à-machine : pas de session à rafraîchir (webhooks signés, cron protégé par secret).
export const MACHINE_PATHS = ["/api/webhooks", "/api/cron"] as const;

/** Vrai si `pathname` est `prefix` ou un de ses sous-chemins (segment complet : `/authx` ≠ `/auth`). */
function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => underPrefix(pathname, p));
}

export function isMachinePath(pathname: string): boolean {
  return MACHINE_PATHS.some((p) => underPrefix(pathname, p));
}

/**
 * Appel de Server Action (POST avec l'en-tête `Next-Action`). Une action s'authentifie
 * elle-même (requireOrgContextForAction) : rediriger sa requête POST vers /login produirait
 * une réponse HTML inexploitable par le client (« An unexpected response was received from
 * the server »). On la laisse donc passer : l'action renvoie un message clair
 * (« Votre session a expiré… »). Les actions restent de toute façon joignables via n'importe
 * quelle route publique : le proxy n'a jamais été une barrière pour elles.
 */
export function isServerActionRequest(request: Pick<NextRequest, "method" | "headers">): boolean {
  return request.method === "POST" && request.headers.has("next-action");
}

/** Destination de connexion : conserve la page demandée (chemin interne uniquement). */
export function loginRedirectUrl(request: Pick<NextRequest, "nextUrl">): URL {
  const { pathname, search } = request.nextUrl;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (pathname !== "/dashboard") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return loginUrl;
}

/**
 * Rafraîchit la session Supabase (cookies) et protège les routes applicatives.
 * Vérification optimiste : la vraie autorisation est faite dans la couche d'accès aux données.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Aperçu visuel (voir src/lib/supabase/preview.ts) : même règle que le client serveur.
  if (isMachinePath(request.nextUrl.pathname) || isWebPreviewEnv()) {
    return response;
  }

  // Valeurs normalisées comme dans les pages (W-08) : guillemets, espaces, schéma manquant.
  const url = publicSupabaseUrl();
  const key = publicSupabaseAnonKey();
  if (!url || !key) {
    // Configuration absente : on laisse passer, les pages afficheront une erreur explicite.
    return response;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookieOptions: sessionCookieOptions(shouldUseSecureCookies(request.nextUrl.protocol)),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // W-11 : getClaims() (auth-js 2.117) VÉRIFIE le JWT — signature contrôlée localement avec les
  // clés publiques du projet (JWKS, mises en cache par processus) si le projet signe en asymétrique
  // (ES256/RS256), sinon repli automatique sur getUser() (appel réseau, comme avant). Jamais une
  // lecture non vérifiée (≠ getSession()). Il rafraîchit aussi la session expirée (cookies réécrits).
  // Différence assumée : une session révoquée reste acceptée ICI jusqu'à l'expiration du jeton
  // d'accès ; le proxy n'est qu'un filtre optimiste — la DAL (getCurrentUser → getUser(), réseau)
  // reste l'autorité pour toute donnée et toute action.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = typeof claimsData?.claims?.sub === "string" && claimsData.claims.sub ? { id: claimsData.claims.sub } : null;

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (isServerActionRequest(request)) return response;
    // 303 pour les soumissions sans JavaScript (POST) : le navigateur suit en GET.
    return NextResponse.redirect(loginRedirectUrl(request), request.method === "GET" || request.method === "HEAD" ? 307 : 303);
  }

  if (user && pathname === "/") {
    // Connecté : l'accueil public laisse place à l'application.
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    // Déjà connecté : on honore `next` s'il désigne une page interne (ex. lien d'invitation).
    return NextResponse.redirect(new URL(safeInternalPath(request.nextUrl.searchParams.get("next"), "/dashboard"), request.nextUrl.origin));
  }

  return response;
}
