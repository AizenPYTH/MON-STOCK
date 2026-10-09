import { parseConfig } from "~/lib/config";

describe("configuration publique", () => {
  it("accepte l'URL et la clé publiable", () => {
    const r = parseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.appEnv).toBe("TEST");
      expect(r.config.apiUrl).toBeUndefined();
    }
  });

  it("préfère la clé publiable à l'ancienne clé anon", () => {
    const r = parseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx", EXPO_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-key-xxxxxxxxxxxx" });
    expect(r.ok && r.config.supabaseAnonKey).toBe("sb_publishable_xxxxxxxxxxxxxxxxxxxx");
  });

  it("refuse une configuration absente ou en http", () => {
    expect(parseConfig({}).ok).toBe(false);
    const http = parseConfig({ EXPO_PUBLIC_SUPABASE_URL: "http://abc.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx" });
    expect(http.ok).toBe(false);
  });

  it("refuse une URL d'API non https", () => {
    const r = parseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx", EXPO_PUBLIC_API_URL: "http://monstock.example" });
    expect(r.ok).toBe(false);
  });
});
