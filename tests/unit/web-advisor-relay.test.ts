import { describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
const { relayAdvisorChat, relayAdvisorSpeech } = await import("@/features/advisor/relay");
const { AppError } = await import("@/lib/errors");

type Ctx = Awaited<ReturnType<Parameters<typeof relayAdvisorChat>[1]["getContext"]>>;
const ctx = {
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } },
  organization: { id: "org-1" },
} as unknown as Ctx;

const ORIGIN = "https://app.example";

function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/advisor/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const deps = (fetchImpl: typeof fetch, getContext: () => Promise<Ctx> = async () => ctx) => ({ getContext, fetchImpl, allowedOrigins: [ORIGIN] });

describe("relayAdvisorChat (web → Edge /advisor/chat)", () => {
  it("relaie le flux NDJSON sans le lire (même corps), avec jeton, organisation et Accept NDJSON", async () => {
    const enc = new TextEncoder();
    let pulls = 0;
    const upstreamBody = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++;
        if (pulls === 1) c.enqueue(enc.encode('{"type":"text","delta":"a"}\n'));
        else c.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(upstreamBody, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } }));
    const res = await relayAdvisorChat(chatRequest({ message: "Bilan du mois ?", conversationId: null }), deps(fetchImpl as unknown as typeof fetch));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toContain("no-store");
    // le relais n'a pas consommé le flux : le premier morceau est lu par le navigateur
    expect(res.body).toBe(upstreamBody);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://project.supabase.co/functions/v1/api/advisor/chat");
    const h = new Headers(init.headers);
    expect(h.get("authorization")).toBe("Bearer jwt");
    expect(h.get("x-organization-id")).toBe("org-1");
    expect(h.get("accept")).toBe("application/x-ndjson");
    expect(JSON.parse(String(init.body))).toEqual({ message: "Bilan du mois ?", conversationId: null });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(await res.text()).toBe('{"type":"text","delta":"a"}\n');
  });

  it("refuse une requête inter-sites sans appeler l'Edge", async () => {
    const fetchImpl = vi.fn();
    const res = await relayAdvisorChat(chatRequest({ message: "x" }, { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" }), deps(fetchImpl as unknown as typeof fetch));
    expect(res.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("session expirée : 401 avec le message de la DAL", async () => {
    const fetchImpl = vi.fn();
    const res = await relayAdvisorChat(
      chatRequest({ message: "x" }),
      deps(fetchImpl as unknown as typeof fetch, async () => {
        throw new AppError("AUTH_REQUIRED", "Votre session a expiré.");
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: { code: "AUTH_REQUIRED", message: "Votre session a expiré." } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("message vide ou corps illisible : 400, rien n'est envoyé", async () => {
    const fetchImpl = vi.fn();
    const r1 = await relayAdvisorChat(chatRequest({ message: "   " }), deps(fetchImpl as unknown as typeof fetch));
    expect(r1.status).toBe(400);
    expect((await r1.json()).error.message).toBe("Posez votre question.");
    const r2 = await relayAdvisorChat(chatRequest("{oops"), deps(fetchImpl as unknown as typeof fetch));
    expect(r2.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("erreur de l'Edge (quota atteint) : message et statut relayés", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Limite atteinte : 40 demandes à l'IA par heure. Réessayez plus tard." } }), { status: 429, headers: { "Content-Type": "application/json" } }));
    const res = await relayAdvisorChat(chatRequest({ message: "x" }), deps(fetchImpl as unknown as typeof fetch));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toEqual({ code: "RATE_LIMITED", message: "Limite atteinte : 40 demandes à l'IA par heure. Réessayez plus tard." });
  });

  it("Edge injoignable : 502 avec un message clair", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const res = await relayAdvisorChat(chatRequest({ message: "x" }), deps(fetchImpl as unknown as typeof fetch));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("UNREACHABLE");
  });
});

describe("relayAdvisorSpeech (web → Edge /advisor/speech)", () => {
  const MSG = "0b5f3c1e-8f7a-4c2b-9d3e-1a2b3c4d5e6f";
  const speechRequest = (q: string) => new Request(`${ORIGIN}/api/advisor/speech?${q}`);

  it("relaie l'audio de l'Edge (même voix que l'iPhone), avec jeton et organisation", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async () => new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg" } }));
    const res = await relayAdvisorSpeech(speechRequest(`messageId=${MSG}&voice=cedar`), { getContext: async () => ctx, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(audio);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://project.supabase.co/functions/v1/api/advisor/speech?messageId=${MSG}&voice=cedar`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer jwt");
    expect(new Headers(init.headers).get("x-organization-id")).toBe("org-1");
  });

  it("identifiant invalide : 400 sans appeler l'Edge ; voix inconnue ignorée", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { "Content-Type": "audio/mpeg" } }));
    const bad = await relayAdvisorSpeech(speechRequest("messageId=../x"), { getContext: async () => ctx, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(bad.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    await relayAdvisorSpeech(speechRequest(`messageId=${MSG}&voice=evil`), { getContext: async () => ctx, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).not.toContain("voice=");
  });

  it("erreur de l'Edge (quota, IA non configurée) : message relayé", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Limite atteinte." } }), { status: 429, headers: { "Content-Type": "application/json" } }));
    const res = await relayAdvisorSpeech(speechRequest(`messageId=${MSG}`), { getContext: async () => ctx, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: { code: "RATE_LIMITED", message: "Limite atteinte." } });
  });
});
