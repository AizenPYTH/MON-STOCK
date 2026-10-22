import { afterEach, describe, expect, it, vi } from "vitest";

/** Démarrage du serveur web : secrets lus dans le Vault Supabase, variables explicites prioritaires. */
describe("instrumentation.register", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("complète les secrets absents depuis le Vault, sans écraser une variable définie", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    delete process.env.SUPABASE_URL;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    process.env.CRON_SECRET = "defini-dans-vercel-0123456789";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ TOKEN_ENCRYPTION_KEY: "k".repeat(44), CRON_SECRET: "vault" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { register } = await import("@/instrumentation");
    await register();
    expect(fetchMock).toHaveBeenCalledWith("https://project.supabase.co/rest/v1/rpc/server_runtime_secrets", expect.objectContaining({ method: "POST" }));
    expect(process.env.TOKEN_ENCRYPTION_KEY).toBe("k".repeat(44));
    expect(process.env.CRON_SECRET).toBe("defini-dans-vercel-0123456789");
  });

  it("W-02 : seuls les secrets utilisés par le web sont injectés (pas OpenAI, transporteurs…)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    delete process.env.SUPABASE_URL;
    for (const n of ["TOKEN_ENCRYPTION_KEY", "OPENAI_API_KEY", "SENDCLOUD_SECRET_KEY", "BOXTAL_V1_PASSWORD", "EBAY_CLIENT_SECRET"]) delete process.env[n];
    const vault = { TOKEN_ENCRYPTION_KEY: "k".repeat(44), OPENAI_API_KEY: "sk-vault", SENDCLOUD_SECRET_KEY: "sc", BOXTAL_V1_PASSWORD: "bx", EBAY_CLIENT_SECRET: "eb" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(vault), { status: 200 })));
    const { register } = await import("@/instrumentation");
    await register();
    expect(process.env.TOKEN_ENCRYPTION_KEY).toBe("k".repeat(44));
    expect(process.env.EBAY_CLIENT_SECRET).toBe("eb");
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(process.env.SENDCLOUD_SECRET_KEY).toBeUndefined();
    expect(process.env.BOXTAL_V1_PASSWORD).toBeUndefined();
  });

  it("W-08 : URL Supabase collée avec guillemets / sans schéma normalisée, délai d'expiration posé", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PUBLIC_SUPABASE_URL = ' "project.supabase.co/" ';
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    delete process.env.SUPABASE_URL;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { register } = await import("@/instrumentation");
    await register();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://project.supabase.co/rest/v1/rpc/server_runtime_secrets");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(process.env.SUPABASE_URL).toBe("https://project.supabase.co");
  });

  it("sans clé de service : rien n'est lu, le serveur démarre quand même", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
