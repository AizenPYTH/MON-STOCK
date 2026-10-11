import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { speakableText } from "@/domain/ai/speakable";
import { checkSpeechRate, resetSpeechRate, synthesizeAdvisorMessage, synthesizeVoiceSample, TTS_INSTRUCTIONS, TTS_RATE, TTS_SAMPLE_TEXT, ttsModel, ttsVoice } from "@/services/ai/speech";
import { fakeSupabase } from "./helpers/fake-supabase";

/**
 * Voix du conseiller (synthèse OpenAI) : seule une réponse du conseiller de l'utilisateur est lue
 * (relue sous sa session), texte nettoyé pour l'oral et borné, voix marin / cedar, consignes de
 * voix naturelle, limite de débit, erreurs journalisées. SDK simulé : AUCUN audio réel n'est
 * généré ni écouté par ces tests.
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

beforeEach(() => resetSpeechRate());

describe("synthèse d'une réponse du conseiller", () => {
  it("relue sous la session de l'utilisateur, mp3, voix marin par défaut, consignes de voix naturelle", async () => {
    const { c, queries } = ctx({ data: { role: "assistant", content: "– CA : 1 234,50 € (+12 %) → **bon**" } });
    const { sdk: s, create } = sdk();
    const audio = await synthesizeAdvisorMessage(c, MSG, { sdk: s, env: {} });
    expect(new Uint8Array(audio)).toEqual(new Uint8Array([1, 2, 3]));
    expect(bodyOf(create)).toEqual({ model: "gpt-4o-mini-tts", voice: "marin", input: "CA : 1 234,50 euros (+12 pour cent) puis bon", instructions: TTS_INSTRUCTIONS, response_format: "mp3" });
    const calls = queries.find((q) => q.target === "advisor_messages")!.calls;
    for (const [k, v] of [["id", MSG], ["organization_id", ORG], ["user_id", USER]]) expect(calls).toContainEqual({ method: "eq", args: [k, v] });
  });

  it("voix choisie par l'utilisateur (cedar) ; voix inconnue ignorée", async () => {
    const { sdk: s, create } = sdk();
    await synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Bonjour." } }).c, MSG, { sdk: s, env: {}, voice: "Cedar" });
    expect(bodyOf(create).voice).toBe("cedar");
    expect(ttsVoice("nova", {})).toBe("marin");
    expect(ttsVoice(null, { OPENAI_TTS_VOICE: "cedar" })).toBe("cedar");
    expect(ttsModel({ OPENAI_TTS_MODEL: "gpt-4o-mini-tts-2025-12-15" })).toBe("gpt-4o-mini-tts-2025-12-15");
    expect(ttsModel({ OPENAI_TTS_MODEL: "x y" })).toBe("gpt-4o-mini-tts");
  });

  it("message de l'utilisateur ou introuvable : rien n'est synthétisé", async () => {
    const { sdk: s, create } = sdk();
    await expect(synthesizeAdvisorMessage(ctx({ data: { role: "user", content: "texte arbitraire" } }).c, MSG, { sdk: s })).rejects.toThrow(/introuvable/);
    await expect(synthesizeAdvisorMessage(ctx({ data: null }).c, MSG, { sdk: s })).rejects.toThrow(/introuvable/);
    expect(create).not.toHaveBeenCalled();
  });

  it("texte long borné à la fin d'une phrase (≈ 1 minute)", async () => {
    const { sdk: s, create } = sdk();
    await synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Phrase de test assez longue pour remplir. ".repeat(60) } }).c, MSG, { sdk: s, env: {} });
    const input = bodyOf(create).input as string;
    expect(input.length).toBeLessThan(1000);
    expect(input).toMatch(/La suite est affichée à l'écran\.$/);
  });

  it("limite de débit par utilisateur", () => {
    const t = Date.now();
    for (let i = 0; i < TTS_RATE.perUserPerHour; i++) checkSpeechRate("u", t + i);
    expect(() => checkSpeechRate("u", t + 100)).toThrow(/Trop de lectures/);
    expect(() => checkSpeechRate("autre", t + 100)).not.toThrow();
    expect(() => checkSpeechRate("u", t + 3_700_000)).not.toThrow();
  });

  it("erreur OpenAI : message utilisateur sans détail, journalisée côté serveur", async () => {
    const create = vi.fn().mockRejectedValue(new OpenAI.AuthenticationError(401, undefined, "Incorrect API key", new Headers()));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(synthesizeAdvisorMessage(ctx({ data: { role: "assistant", content: "Bonjour." } }).c, MSG, { sdk: { audio: { speech: { create } } }, env: {} })).rejects.toThrow(/refusée/);
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
