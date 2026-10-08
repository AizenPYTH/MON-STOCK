import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";
import { callbackErrorCode } from "@/features/auth/messages";

/**
 * Callback des liens email Supabase (confirmation d'inscription, reset de mot de passe,
 * magic link). Échange le code PKCE contre une session puis redirige.
 * `next` est restreint à un chemin interne (pas d'open redirect) et les erreurs sont
 * transmises sous forme de CODE (le texte `error_description` du lien n'est jamais réaffiché).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    const url = new URL("/login", origin);
    url.searchParams.set("error", callbackErrorCode({ errorCode: error.code ?? "otp_expired", next }));
    return NextResponse.redirect(url);
  }

  const url = new URL("/login", origin);
  url.searchParams.set("error", callbackErrorCode({ errorCode: searchParams.get("error_code"), next }));
  return NextResponse.redirect(url);
}
