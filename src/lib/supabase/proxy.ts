import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/db/database.types";
import { safeInternalPath } from "@/lib/utils";

/**
 * Routes accessibles sans session. Tout le reste (pages de l'application, /onboarding,
 * routes API non listées) exige une session ; la vraie autorisation est faite dans la
 * couche d'accès aux données (DAL) et par la RLS.
 */
export const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/update-password", "/auth", "/api/webhooks", "/api/cron", "/api/integrations/ebay/callback", "/invite"] as const;

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

  if (isMachinePath(request.nextUrl.pathname)) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Configuration absente : on laisse passer, les pages afficheront une erreur explicite.
    return response;
  }

  const supabase = createServerClient<Database>(url, key, {
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

  // IMPORTANT : getUser() valide le JWT auprès de Supabase (pas getSession()) et rafraîchit
  // la session si l'access token a expiré (refresh token encore valide).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (isServerActionRequest(request)) return response;
    // 303 pour les soumissions sans JavaScript (POST) : le navigateur suit en GET.
    return NextResponse.redirect(loginRedirectUrl(request), request.method === "GET" || request.method === "HEAD" ? 307 : 303);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    // Déjà connecté : on honore `next` s'il désigne une page interne (ex. lien d'invitation).
    return NextResponse.redirect(new URL(safeInternalPath(request.nextUrl.searchParams.get("next"), "/dashboard"), request.nextUrl.origin));
  }

  return response;
}
