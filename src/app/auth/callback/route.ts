import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Callback des liens email Supabase (confirmation d'inscription, reset de mot de passe,
 * magic link). Échange le code PKCE contre une session puis redirige.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const url = new URL("/login", origin);
    url.searchParams.set("error", "Le lien est invalide ou a expiré. Demandez un nouveau lien.");
    return NextResponse.redirect(url);
  }

  const errorDescription = searchParams.get("error_description");
  const url = new URL("/login", origin);
  url.searchParams.set("error", errorDescription ?? "Lien d'authentification invalide.");
  return NextResponse.redirect(url);
}
