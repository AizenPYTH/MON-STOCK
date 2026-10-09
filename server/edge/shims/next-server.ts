/**
 * Sous-ensemble de `next/server` utilisé par les modules serveur partagés (réponses JSON et
 * redirections), implémenté avec les objets Web standard pour l'Edge Function Supabase.
 */
export class NextResponse<T = unknown> extends Response {
  static override json<T>(body: T, init?: ResponseInit): NextResponse<T> {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse<T>(JSON.stringify(body), { ...init, headers });
  }
  static override redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    return new NextResponse(null, { status, headers: { Location: String(url) } });
  }
}
export type NextRequest = Request;
