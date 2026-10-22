import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody } from "@/features/mobile-api/http";

/**
 * S-21 : corps de requête lu EN FLUX et borné en octets, même sans Content-Length (envoi
 * « chunked ») — jamais lu en entier avant le contrôle de taille.
 */
const schema = z.object({ text: z.string() });

/** Flux sans fin connue : compte les octets réellement tirés par le lecteur. */
function streamingRequest(chunk: Uint8Array, chunks: number): { request: Request; pulled: () => number } {
  let sent = 0;
  let bytes = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) {
        controller.close();
        return;
      }
      sent++;
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "content-type": "application/json" } };
  const request = new Request("https://edge.example/api/sourcing/import/preview", init);
  return { request, pulled: () => bytes };
}

describe("parseBody — lecture bornée en flux (S-21)", () => {
  it("sans Content-Length : arrête la lecture dès la limite dépassée (le reste du flux n'est pas lu)", async () => {
    const { request, pulled } = streamingRequest(new Uint8Array(1024).fill(0x20), 10_000); // 10 Mo annoncés nulle part
    expect(request.headers.get("content-length")).toBeNull();
    await expect(parseBody(request, schema, 4096)).rejects.toMatchObject({ code: "VALIDATION", message: "Requête trop volumineuse." });
    expect(pulled()).toBeLessThanOrEqual(4096 + 2 * 1024);
  });

  it("compte des OCTETS et non des caractères (texte multi-octets)", async () => {
    const json = JSON.stringify({ text: "é".repeat(600) }); // ≈ 612 caractères, ≈ 1 212 octets
    const { request } = streamingRequest(new TextEncoder().encode(json), 1);
    await expect(parseBody(request, schema, 1000)).rejects.toMatchObject({ message: "Requête trop volumineuse." });
  });

  it("Content-Length annoncé trop grand : refus avant lecture ; Content-Length invalide refusé", async () => {
    const big = new Request("https://edge.example/x", { method: "POST", body: "{}", headers: { "content-length": "999999999" } });
    await expect(parseBody(big, schema, 64_000)).rejects.toMatchObject({ message: "Requête trop volumineuse." });
    const bad = new Request("https://edge.example/x", { method: "POST", body: "{}", headers: { "content-length": "abc" } });
    await expect(parseBody(bad, schema, 64_000)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("corps valide sous la limite (avec ou sans Content-Length) ; corps vide → objet vide", async () => {
    const json = JSON.stringify({ text: "Écran OLED – 12 €" });
    const { request } = streamingRequest(new TextEncoder().encode(json), 1);
    await expect(parseBody(request, schema, 1000)).resolves.toEqual({ text: "Écran OLED – 12 €" });
    const withLength = new Request("https://edge.example/x", { method: "POST", body: json });
    await expect(parseBody(withLength, schema, 1000)).resolves.toEqual({ text: "Écran OLED – 12 €" });
    const empty = new Request("https://edge.example/x", { method: "POST" });
    await expect(parseBody(empty, z.object({}), 1000)).resolves.toEqual({});
    const notJson = new Request("https://edge.example/x", { method: "POST", body: "{pas du json" });
    await expect(parseBody(notJson, schema, 1000)).rejects.toMatchObject({ message: "Corps de requête JSON invalide." });
  });
});
