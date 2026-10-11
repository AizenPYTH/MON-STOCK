import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { aiError, collectStream, openAILlm, toOpenAIMessages, toOpenAITools, type OpenAIChatLike } from "@/services/ai/llm";

/**
 * Adaptateur OpenAI (Chat Completions, flux). Le SDK est simulé : on vérifie la requête envoyée
 * (modèle, plafond, effort, sortie structurée stricte, outils, pas de stockage) et l'assemblage
 * du flux (texte, appels d'outils fragmentés, refus, coupure). Aucun appel réseau.
 */

type Chunk = OpenAI.Chat.Completions.ChatCompletionChunk;
const chunk = (delta: Record<string, unknown>, finish: string | null = null): Chunk => ({ id: "c", object: "chat.completion.chunk", created: 0, model: "gpt-5.4-mini-2026-03-17", choices: [{ index: 0, delta, finish_reason: finish, logprobs: null }] }) as unknown as Chunk;
async function* stream(chunks: Chunk[]) {
  for (const c of chunks) yield c;
}

describe("conversion des messages et des outils", () => {
  it("invite système en tête (developer), appels d'outils et résultats liés par identifiant", () => {
    const out = toOpenAIMessages("RÈGLES", [
      { role: "user", content: "CA ?" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "business_report", input: { period: "30d" } }] },
      { role: "tool", toolCallId: "call_1", content: '{"revenue":"10 €"}' },
    ]);
    expect(out[0]).toEqual({ role: "developer", content: "RÈGLES" });
    expect(out[2]).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "business_report", arguments: '{"period":"30d"}' } }] });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"revenue":"10 €"}' });
    expect(toOpenAITools([{ name: "t", description: "d", input_schema: { type: "object", properties: {} } }])).toEqual([{ type: "function", function: { name: "t", description: "d", parameters: { type: "object", properties: {} } } }]);
  });
});

describe("assemblage du flux", () => {
  it("texte diffusé morceau par morceau", async () => {
    const seen: string[] = [];
    const r = await collectStream(stream([chunk({ content: "Bon" }), chunk({ content: "jour" }), chunk({}, "stop")]), (d) => seen.push(d));
    expect(seen).toEqual(["Bon", "jour"]);
    expect(r).toEqual({ text: "Bonjour", toolCalls: [], finish: "stop", model: "gpt-5.4-mini-2026-03-17" });
  });

  it("appels d'outils fragmentés (plusieurs en parallèle) recomposés ; JSON illisible → entrée absente", async () => {
    const r = await collectStream(
      stream([
        chunk({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "stock_risks", arguments: '{"li' } }] }),
        chunk({ tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "order_lookup", arguments: "{oops" } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: 'mit":5}' } }] }),
        chunk({}, "tool_calls"),
      ]),
    );
    expect(r.finish).toBe("tool_calls");
    expect(r.toolCalls).toEqual([
      { id: "call_a", name: "stock_risks", input: { limit: 5 } },
      { id: "call_b", name: "order_lookup", input: undefined },
    ]);
  });

  it("refus et filtre de contenu → « refusal » ; coupure → « length »", async () => {
    expect((await collectStream(stream([chunk({ refusal: "Je ne peux pas." }), chunk({}, "stop")]))).finish).toBe("refusal");
    expect((await collectStream(stream([chunk({}, "content_filter")]))).finish).toBe("refusal");
    const cut = await collectStream(stream([chunk({ content: "Début" }), chunk({}, "length")]));
    expect(cut).toMatchObject({ text: "Début", finish: "length" });
  });
});

describe("requête envoyée à OpenAI", () => {
  function fakeSdk(chunks: Chunk[]) {
    const create = vi.fn(async () => stream(chunks));
    return { sdk: { chat: { completions: { create } } } as unknown as OpenAIChatLike, create };
  }

  it("outils + flux : modèle, plafond, effort, cache, aucun stockage côté OpenAI, annulation transmise", async () => {
    const { sdk, create } = fakeSdk([chunk({ content: "ok" }), chunk({}, "stop")]);
    const signal = new AbortController().signal;
    const r = await openAILlm(sdk, "gpt-5.4-mini").complete(
      { system: "S", messages: [{ role: "user", content: "Q" }], tools: [{ name: "t", description: "d", input_schema: { type: "object" } }], maxTokens: 2500, effort: "medium", cacheKey: "mon-stock-advisor" },
      { signal },
    );
    expect(r.text).toBe("ok");
    const [body, opts] = create.mock.calls[0]! as unknown as [Record<string, unknown>, { signal: AbortSignal }];
    expect(body).toMatchObject({ model: "gpt-5.4-mini", max_completion_tokens: 2500, reasoning_effort: "medium", stream: true, store: false, prompt_cache_key: "mon-stock-advisor", parallel_tool_calls: true });
    expect(body.tools).toHaveLength(1);
    expect(body).not.toHaveProperty("response_format");
    expect(opts.signal).toBe(signal);
  });

  it("sortie structurée : schéma JSON strict, sans outils", async () => {
    const { sdk, create } = fakeSdk([chunk({ content: "{}" }), chunk({}, "stop")]);
    await openAILlm(sdk, "gpt-5.4-mini").complete({ system: "S", messages: [{ role: "user", content: "Q" }], maxTokens: 4096, json: { name: "product_draft", schema: { type: "object" } } });
    const body = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "product_draft", strict: true, schema: { type: "object" } } });
    expect(body).not.toHaveProperty("tools");
    expect(body.reasoning_effort).toBe("low");
  });
});

describe("erreurs OpenAI → messages utilisateur (aucun détail technique)", () => {
  const h = new Headers();
  it.each([
    [new OpenAI.AuthenticationError(401, undefined, "bad key", h), "NOT_CONFIGURED", /refusée/],
    [new OpenAI.RateLimitError(429, undefined, "quota", h), "RATE_LIMITED", /crédit|sollicité/],
    [new OpenAI.NotFoundError(404, undefined, "model", h), "NOT_CONFIGURED", /OPENAI_MODEL/],
    [new OpenAI.BadRequestError(400, undefined, "bad", h), "EXTERNAL_API", /refusée/],
    [new OpenAI.APIConnectionError({ message: "down" }), "EXTERNAL_API", /injoignable/],
    [new Error("boom"), "INTERNAL", /inattendue/],
  ])("%s", (e, code, msg) => {
    const err = aiError(e);
    expect(err.code).toBe(code);
    expect(err.message).toMatch(msg);
    expect(err.message).not.toMatch(/bad key|quota/);
  });
});
