import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { speakableText } from "@/domain/ai/speakable";
import { audioCacheControl, synthesizeAdvisorMessage, synthesizeVoiceSample, TTS_INSTRUCTIONS, TTS_RATE, TTS_SAMPLE_TEXT, ttsModel, ttsVoice } from "@/services/ai/speech";
import { fakeSupabase } from "./helpers/fake-supabase";

/**
 * Voix du conseiller (synthèse OpenAI) : seule une réponse du conseiller de l'utilisateur est lue
 * (relue sous sa session), texte nettoyé pour l'oral et borné, voix marin / cedar, consignes de
 * voix naturelle, lecture décomptée EN BASE (quota « speech », S-10), erreurs journalisées. SDK simulé :
 * AUCUN audio réel n'est généré ni écouté par ces tests.
 */
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";

function ctx(rows: { data?: unknown; error?: unknown }) {
  const { client, queries } = fakeSupabase({ advisor_messages: rows });
  return { c: { supabase: client, organization: { id: ORG }, user: { id: USER } } as never, queries };
}
function sdk() {
  const create = vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }));
  return { sdk: { audio: { speech: { create } } }, create };
}
const bodyOf = (create: ReturnType<typeof vi.fn>) => (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
/** Quota en base simulé (fonction SQL ai_reserve_usage). */
const quota = (data: unknown = { allowed: true, event_id: "evt" }, error: unknown = null) => fakeSupabase({ "rpc:ai_reserve_usage": { data, error } });
const admin = quota().client;

describe("synthèse d'une réponse du conseiller", () => {
  it("relue sous la session de l'utilisateur, mp3, voix marin par défaut, consignes de voix naturelle", async () => {
    const { c, queries } = ctx({ data: { role: "assistant", content: "– CA : 1 234,50 € (+12 %) → **bon**" } });
    const { sdk: s, create } = sdk();
    const audio = await synthesizeAdvisorMessage(c, MSG, { sdk: s, env: {}, admin });
    expect(new Uint8Array(await new Response(audio).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(bodyOf(create)).toEqual({ model: "gpt-4o-mini-tts", voice: "marin", input: "CA : 1 234,50 euros (+12 pour cent) puis bon", instructions: TTS_INSTRUCTIONS, response_format: "mp3" });
    const calls = queries.find((q) => q.target === "advisor_messages")!.calls;
    for (const [k, v] of [["id", MSG], ["organization_id", ORG], ["user_id", USER]]) expect(calls).toContainEqual({ method: "eq", args: [k, v] });
  });

  it("audio relayé en flux dès les premiers octets (aucune mise en mémoire tampon)", async () => {
    const stream = new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(new Uint8Array([9])), c.close()) });
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const create = vi.fn(async () => ({ body: stream, arrayBuffer }));
    const audio = await synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Bonjour." } }).c, MSG, { sdk: { audio: { speech: { create } } }, env: {}, admin });
    expect(audio).toBe(stream);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("voix choisie par l'utilisateur (cedar) ; voix inconnue ignorée", async () => {
    const { sdk: s, create } = sdk();
    await synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Bonjour." } }).c, MSG, { sdk: s, env: {}, voice: "Cedar", admin });
    expect(bodyOf(create).voice).toBe("cedar");
    expect(ttsVoice("nova", {})).toBe("marin");
    expect(ttsVoice(null, { OPENAI_TTS_VOICE: "cedar" })).toBe("cedar");
    expect(ttsModel({ OPENAI_TTS_MODEL: "gpt-4o-mini-tts-2025-12-15" })).toBe("gpt-4o-mini-tts-2025-12-15");
    expect(ttsModel({ OPENAI_TTS_MODEL: "x y" })).toBe("gpt-4o-mini-tts");
  });

  it("message de l'utilisateur ou introuvable : rien n'est synthétisé", async () => {
    const { sdk: s, create } = sdk();
    await expect(synthesizeAdvisorMessage(ctx({ data: { role: "user", content: "texte arbitraire" } }).c, MSG, { sdk: s, admin })).rejects.toThrow(/introuvable/);
    await expect(synthesizeAdvisorMessage(ctx({ data: null }).c, MSG, { sdk: s, admin })).rejects.toThrow(/introuvable/);
    expect(create).not.toHaveBeenCalled();
  });

  it("texte long borné à la fin d'une phrase (≈ 1 minute)", async () => {
    const { sdk: s, create } = sdk();
    await synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Phrase de test assez longue pour remplir. ".repeat(60) } }).c, MSG, { sdk: s, env: {}, admin });
    const input = bodyOf(create).input as string;
    expect(input.length).toBeLessThan(1000);
    expect(input).toMatch(/La suite est affichée à l'écran\.$/);
  });

  it("chaque lecture est décomptée EN BASE avant l'appel au fournisseur (plus de limite en mémoire d'instance)", async () => {
    const { sdk: s, create } = sdk();
    const q = quota();
    await synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Bonjour." } }).c, MSG, { sdk: s, env: {}, admin: q.client });
    expect(q.queries.map((x) => x.target)).toEqual(["rpc:ai_reserve_usage"]);
    expect(q.queries[0]!.calls[0]!.args[0]).toMatchObject({ p_kind: "speech", p_user_id: USER, p_organization_id: ORG, p_user_limit: TTS_RATE.perUserPerHour, p_org_limit: TTS_RATE.perOrganizationPerDay });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("limite atteinte ou quota invérifiable : rien n'est synthétisé (fail-closed)", async () => {
    const { sdk: s, create } = sdk();
    const c = ctx({ data: { role: "assistant", content: "Bonjour." } }).c;
    await expect(synthesizeAdvisorMessage(c, MSG, { sdk: s, env: {}, admin: quota({ allowed: false, reason: "user_limit" }).client })).rejects.toThrow(/Trop de lectures vocales/);
    await expect(synthesizeAdvisorMessage(c, MSG, { sdk: s, env: {}, admin: quota(null, { code: "57P01", message: "terminating" }).client })).rejects.toMatchObject({ status: 503 });
    expect(create).not.toHaveBeenCalled();
  });

  it("message introuvable : aucun quota consommé", async () => {
    const q = quota();
    await expect(synthesizeAdvisorMessage(ctx({ data: null }).c, MSG, { sdk: sdk().sdk, admin: q.client })).rejects.toThrow(/introuvable/);
    expect(q.queries).toHaveLength(0);
  });

  it("cache HTTP privé de l'audio : borné et configurable", () => {
    expect(audioCacheControl({})).toBe("private, max-age=86400");
    expect(audioCacheControl({ ADVISOR_AUDIO_MAX_AGE_SECONDS: "3600" })).toBe("private, max-age=3600");
    expect(audioCacheControl({ ADVISOR_AUDIO_MAX_AGE_SECONDS: "0" })).toBe("private, no-store");
    expect(audioCacheControl({ ADVISOR_AUDIO_MAX_AGE_SECONDS: "99999999" })).toBe("private, max-age=86400");
  });

  it("erreur OpenAI : message utilisateur sans détail, journalisée côté serveur", async () => {
    const create = vi.fn().mockRejectedValue(new OpenAI.AuthenticationError(401, undefined, "Incorrect API key", new Headers()));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Bonjour." } }).c, MSG, { sdk: { audio: { speech: { create } } }, env: {}, admin })).rejects.toThrow(/refusée/);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/OpenAI|synthèse/);
    warn.mockRestore();
  });
});

describe("échantillon de comparaison des voix", () => {
  it("même texte représentatif pour marin et cedar", async () => {
    const { sdk: s, create } = sdk();
    await synthesizeVoiceSample("marin", { sdk: s, env: {} });
    await synthesizeVoiceSample("cedar", { sdk: s, env: {} });
    const [a, b] = create.mock.calls.map((c) => (c as unknown as [Record<string, unknown>])[0]);
    expect(a!.input).toBe(TTS_SAMPLE_TEXT);
    expect(b!.input).toBe(TTS_SAMPLE_TEXT);
    expect([a!.voice, b!.voice]).toEqual(["marin", "cedar"]);
  });
});

describe("texte préparé pour l'oral", () => {
  it("Markdown, tableaux, listes, noms techniques, unités et émojis", () => {
    expect(speakableText("## Bilan\n- **CA** : 830 € vs 700 €\n- Marge ≈ 23 %\n| Produit | Ventes |\n|---|---|\n| iPhone 13 | 3 |\nUtilise `business_report` 🙂")).toBe(
      "Bilan. CA : 830 euros par rapport à 700 euros. Marge environ 23 pour cent. Produit, Ventes. iPhone 13, 3. Utilise business report.",
    );
    expect(speakableText("Couverture : 41 j, valeur ≈ 38 k€, commande n° 12-345 — expédiée. [Voir](https://x.y)")).toBe("Couverture : 41 jours, valeur environ 38 mille euros, commande numéro 12-345, expédiée. Voir");
  });
});

describe("script de comparaison manuel", () => {
  it("même texte et mêmes consignes que le serveur", async () => {
    // @ts-expect-error module JavaScript sans types
    const script = await import("../../scripts/tts-compare.mjs");
    expect(script.SAMPLE_TEXT).toBe(TTS_SAMPLE_TEXT);
    expect(script.INSTRUCTIONS).toBe(TTS_INSTRUCTIONS);
    expect(script.VOICES).toEqual(["marin", "cedar"]);
  });
});
