import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isWebPreview } = await import("@/lib/supabase/preview");

/** L'aperçu visuel (base de démonstration) ne peut jamais s'activer sur un vrai projet Supabase. */
describe("aperçu visuel du site", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("exige le drapeau ET l'URL fictive preview.invalid", () => {
    process.env.MONSTOCK_WEB_PREVIEW = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ccywsegdowikeirbsfae.supabase.co";
    expect(isWebPreview()).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://preview.invalid";
    expect(isWebPreview()).toBe(true);
    delete process.env.MONSTOCK_WEB_PREVIEW;
    expect(isWebPreview()).toBe(false);
  });

  it("URL absente ou invalide : désactivé", () => {
    process.env.MONSTOCK_WEB_PREVIEW = "1";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(isWebPreview()).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "pas une url";
    expect(isWebPreview()).toBe(false);
  });
});
