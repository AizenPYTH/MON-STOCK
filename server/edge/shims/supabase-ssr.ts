/** `@supabase/ssr` (cookies Next.js) : jamais utilisé par l'API mobile (client par jeton Bearer). */
export function createServerClient(): never {
  throw new Error("@supabase/ssr indisponible dans l'Edge Function");
}
export function createBrowserClient(): never {
  throw new Error("@supabase/ssr indisponible dans l'Edge Function");
}
