import type { AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { parseNdjson, streamAdvisorChat } from "~/data/advisor";
import { speakableText, splitSentences } from "~/lib/tts";

/**
 * Conseiller : lecture du flux NDJSON du serveur (morceaux coupés n'importe où), erreurs réseau et
 * serveur, préparation du texte lu à voix haute. Réseau entièrement simulé.
 */
jest.mock("~/lib/api", () => ({ apiBaseUrl: () => "https://x.supabase.co/functions/v1/api", apiHeaders: async () => ({ Authorization: "Bearer jeton-test" }), callApi: jest.fn() }));

const reply = { conversationId: "c1", messageId: "m2", answer: "Votre CA est de 830,00 € cette semaine.", cards: [], sources: ["Bilan de l'activité"], interrupted: false, model: "claude-opus-5-5" };
const lines = (events: AdvisorStreamEvent[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

function streamResponse(text: string, cut = 7, headers: Record<string, string> = { "content-type": "application/x-ndjson; charset=utf-8" }, status = 200) {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += cut) chunks.push(bytes.slice(i, i + cut));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    body: { getReader: () => ({ read: async () => (chunks.length ? { done: false, value: chunks.shift()! } : { done: true, value: undefined }) }) },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

describe("flux du conseiller", () => {
  it("découpe NDJSON : lignes complètes seulement, ligne illisible ignorée", () => {
    const r = parseNdjson('{"type":"status","label":"Ventes"}\nnimporte quoi\n{"type":"text","delta":"Bon');
    expect(r.events).toEqual([{ type: "status", label: "Ventes" }]);
    expect(r.rest).toBe('{"type":"text","delta":"Bon');
  });

  it("événements dans l'ordre, même coupés au milieu d'un caractère accentué", async () => {
    const events: AdvisorStreamEvent[] = [
      { type: "conversation", conversationId: "c1" },
      { type: "status", label: "Bilan de l'activité" },
      { type: "text", delta: "Votre CA est de " },
      { type: "text", delta: "830,00 € cette semaine." },
      { type: "done", reply },
    ];
    const fetchImpl = jest.fn(async () => streamResponse(lines(events), 5));
    const seen: AdvisorStreamEvent[] = [];
    const r = await streamAdvisorChat("org-1", { message: "CA ?", voice: true }, (e) => seen.push(e), { fetchImpl: fetchImpl as never });
    expect(seen).toEqual(events);
    expect(r).toEqual(reply);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/functions/v1/api/advisor/chat");
    expect(JSON.parse(String(init.body))).toEqual({ message: "CA ?", voice: true });
  });

  it("erreur annoncée par le serveur au milieu du flux : message utilisateur", async () => {
    const fetchImpl = async () => streamResponse(lines([{ type: "conversation", conversationId: "c1" }, { type: "error", code: "RATE_LIMITED", message: "Limite atteinte : 40 demandes à l'IA par heure." }]));
    await expect(streamAdvisorChat("org-1", { message: "?" }, () => undefined, { fetchImpl: fetchImpl as never })).rejects.toThrow(/Limite atteinte/);
  });

  it("flux coupé avant la fin : signalé comme interrompu", async () => {
    const fetchImpl = async () => streamResponse(lines([{ type: "text", delta: "Votre" }]));
    await expect(streamAdvisorChat("org-1", { message: "?" }, () => undefined, { fetchImpl: fetchImpl as never })).rejects.toThrow(/coupée/);
  });

  it("refus avant le flux (JSON d'erreur) : message du serveur", async () => {
    const body = JSON.stringify({ ok: false, error: { code: "NOT_CONFIGURED", message: "L'assistant IA n'est pas encore activé sur le serveur." } });
    const fetchImpl = async () => streamResponse(body, 1000, { "content-type": "application/json" }, 503);
    await expect(streamAdvisorChat("org-1", { message: "?" }, () => undefined, { fetchImpl: fetchImpl as never })).rejects.toThrow(/pas encore activé/);
  });

  it("pas de réseau : message hors ligne", async () => {
    const fetchImpl = async () => {
      throw new TypeError("Network request failed");
    };
    await expect(streamAdvisorChat("org-1", { message: "?" }, () => undefined, { fetchImpl: fetchImpl as never })).rejects.toThrow(/Connexion internet indisponible/);
  });

  it("annulation par l'utilisateur, avant ou pendant la requête", async () => {
    const pending = (_u: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => {
        if (init.signal?.aborted) reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    const early = new AbortController();
    const fetchSpy = jest.fn(pending);
    const p1 = streamAdvisorChat("org-1", { message: "?" }, () => undefined, { fetchImpl: fetchSpy as never, signal: early.signal });
    early.abort();
    await expect(p1).rejects.toThrow(/annulée/);
    expect(fetchSpy).not.toHaveBeenCalled();
    const late = new AbortController();
    const p2 = streamAdvisorChat("org-1", { message: "?" }, () => undefined, { fetchImpl: ((u: string, i: RequestInit) => (setTimeout(() => late.abort(), 0), pending(u, i))) as never, signal: late.signal });
    await expect(p2).rejects.toThrow(/annulée/);
  });
});

describe("texte lu à voix haute", () => {
  it("prononçable : symboles et listes retirés, montants et pourcentages en toutes lettres", () => {
    expect(speakableText("– CA : 1 234,50 € (+12 %) → **bon**")).toBe("CA : 1 234,50 euros (+12 pour cent) puis bon");
    expect(speakableText("≈ 100 €")).toBe("environ 100 euros");
  });
  it("réponse trop longue : coupée à une fin de phrase, suite à l'écran", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Phrase numéro ${i} assez longue pour remplir.`).join(" ");
    const s = speakableText(long, 200);
    expect(s.length).toBeLessThan(260);
    expect(s.endsWith("La suite est affichée à l'écran.")).toBe(true);
    expect(splitSentences("Un. Deux ! Trois ? quatre")).toEqual(["Un.", "Deux !", "Trois ?", "quatre"]);
  });
});
