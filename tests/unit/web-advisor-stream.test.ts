import { describe, expect, it } from "vitest";
import type { AdvisorReplyDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";
import { AdvisorStreamError, nonStreamErrorOf, parseNdjson, readAdvisorStream } from "@/features/advisor/stream";

const reply: AdvisorReplyDTO = { conversationId: "c1", messageId: "m1", answer: "Bonjour", cards: [], sources: ["Bilan"], interrupted: false, model: "m" };

/** Réponse NDJSON découpée en morceaux arbitraires (coupures au milieu des lignes). */
function ndjsonResponse(chunks: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" }, ...init });
}

describe("parseNdjson", () => {
  it("renvoie les lignes complètes et garde le reste", () => {
    const { events, rest } = parseNdjson('{"type":"text","delta":"a"}\n{"type":"te');
    expect(events).toEqual([{ type: "text", delta: "a" }]);
    expect(rest).toBe('{"type":"te');
  });
  it("ignore les lignes illisibles ou de type inconnu", () => {
    const { events } = parseNdjson('pas du json\n{"type":"hack"}\n\n{"type":"status","label":"Bilan"}\n');
    expect(events).toEqual([{ type: "status", label: "Bilan" }]);
  });
});

describe("readAdvisorStream", () => {
  it("relaie chaque événement dès réception et renvoie la réponse finale", async () => {
    const seen: AdvisorStreamEvent[] = [];
    const lines = [
      { type: "conversation", conversationId: "c1" },
      { type: "text", delta: "Bon" },
      { type: "text", delta: "jour" },
      { type: "done", reply },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n");
    const res = ndjsonResponse([lines.slice(0, 17), lines.slice(17, 50), `${lines.slice(50)}\n`]);
    const out = await readAdvisorStream(res, (e) => seen.push(e));
    expect(out).toEqual(reply);
    expect(seen.map((e) => e.type)).toEqual(["conversation", "text", "text", "done"]);
  });

  it("dernière ligne sans saut de ligne : prise en compte", async () => {
    const out = await readAdvisorStream(ndjsonResponse([JSON.stringify({ type: "done", reply })]), () => {});
    expect(out.answer).toBe("Bonjour");
  });

  it("événement d'erreur : message du serveur", async () => {
    const res = ndjsonResponse([`${JSON.stringify({ type: "error", code: "RATE_LIMITED", message: "Limite atteinte : 40 demandes à l'IA par heure." })}\n`]);
    await expect(readAdvisorStream(res, () => {})).rejects.toMatchObject({ code: "RATE_LIMITED", message: "Limite atteinte : 40 demandes à l'IA par heure." });
  });

  it("flux coupé avant « done » : réponse interrompue", async () => {
    const res = ndjsonResponse([`${JSON.stringify({ type: "text", delta: "Bon" })}\n`]);
    await expect(readAdvisorStream(res, () => {})).rejects.toMatchObject({ code: "INTERRUPTED" });
  });

  it("réponse JSON d'erreur (IA non configurée) : message relayé", async () => {
    const res = new Response(JSON.stringify({ ok: false, error: { code: "NOT_CONFIGURED", message: "L'assistant IA n'est pas encore activé sur le serveur." } }), { status: 500, headers: { "Content-Type": "application/json" } });
    const err = await readAdvisorStream(res, () => {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdvisorStreamError);
    expect(err).toMatchObject({ code: "NOT_CONFIGURED", message: "L'assistant IA n'est pas encore activé sur le serveur." });
  });
});

describe("nonStreamErrorOf", () => {
  it("redirection vers /login (session absente) : session expirée", async () => {
    const res = new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } });
    Object.defineProperty(res, "redirected", { value: true });
    Object.defineProperty(res, "url", { value: "https://app.example/login?next=%2Fapi%2Fadvisor%2Fchat" });
    expect(await nonStreamErrorOf(res)).toMatchObject({ code: "AUTH_REQUIRED" });
  });
  it("corps illisible en 5xx : indisponibilité", async () => {
    expect(await nonStreamErrorOf(new Response("oops", { status: 502 }))).toMatchObject({ code: "SERVER", message: "Le serveur MON STOCK est momentanément indisponible. Réessayez." });
  });
});
