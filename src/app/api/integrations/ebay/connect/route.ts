import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext, isAdmin } from "@/features/auth/dal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getEbayConnector } from "@/integrations/core/registry";

const log = createLogger("EBAY_OAUTH");

/**
 * Démarre la connexion eBay (OAuth 2.0, authorization code grant).
 * Réservé aux administrateurs de l'organisation. Un état anti-CSRF aléatoire, lié à
 * l'organisation et à l'utilisateur, est enregistré (15 min) puis le vendeur est redirigé
 * vers la page d'autorisation eBay : il saisit ses identifiants CHEZ eBay, jamais ici.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const origin = publicEnv().NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const back = (error: string) => NextResponse.redirect(`${origin}/settings/integrations?error=${encodeURIComponent(error)}`);

  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/settings/integrations")}`);
  }
  if (!isAdmin(ctx.role)) return back("Seuls les administrateurs de l'organisation peuvent connecter eBay.");

  const connector = getEbayConnector();
  if (!connector.isConfigured()) {
    return back(`Intégration eBay non configurée sur ce serveur : ${connector.configurationIssues().join(" ; ")}`);
  }

  const state = randomToken(32);
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("oauth_states").insert({
    state,
    organization_id: ctx.organization.id,
    provider: "ebay",
    created_by: ctx.user.id,
    redirect_to: "/settings/integrations/ebay/setup",
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) {
    log.error("impossible d'enregistrer l'état OAuth", { orgId: ctx.organization.id, error: error.message });
    return back("Impossible de démarrer la connexion eBay (état OAuth non enregistré). Réessayez.");
  }

  log.info("redirection vers eBay", { orgId: ctx.organization.id, userId: ctx.user.id, environment: connector.config()?.environment });
  return NextResponse.redirect(connector.getAuthorizeUrl(state), { status: 303 });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
