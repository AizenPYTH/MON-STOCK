/**
 * Jetons de couleur de l'app (M-12 + refonte) : contrastes WCAG 2.2 MESURÉS (même formule que
 * tests/unit/design-tokens.test.ts côté web), en clair et dans le thème sombre préparé ; parité
 * des clés ; alignement des valeurs sémantiques sur le design system commun (globals.css).
 */
import { color, colorDark } from "~/theme/tokens";

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`couleur opaque attendue : ${hex}`);
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

type Pal = Record<string, string>;
const TEXT: [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["inkStrong", "surface"],
  ["ink2", "surface"],
  ["ink2", "surface3"],
  ["ink3", "bg"],
  ["ink3", "surface"],
  ["ink3", "surface3"],
  ["ink3", "selection"],
  ["success", "surface"],
  ["success", "successSoft"],
  ["warningInk", "surface"],
  ["warningInk", "warningSoft"],
  ["accentInkOnSoft", "accentSoft"],
  ["dangerInk", "surface"],
  ["dangerInk", "dangerSoft"],
  ["infoInk", "surface"],
  ["infoInk", "infoSoft"],
  ["interactive", "surface"],
  ["onSuccessStrong", "successStrong"],
  ["onDangerStrong", "dangerStrong"],
  ["onWarningStrong", "warningStrong"],
  ["onInverse", "inverse"],
  ["onMint", "mint"],
  ["inkOnDark", "brand"],
  ["inkOnDarkMuted", "brand"],
  ["inkOnDarkSubtle", "brand"],
  ["mint", "brand"],
  ["accent", "brand"],
  ["dangerOnDark", "brand"],
  ["inkOnDark", "nightRaised"],
];
const NON_TEXT: [string, string][] = [
  ["borderControl", "surface"],
  ["borderControl", "bg"],
  ["ring", "surface"],
];

describe.each([
  ["clair", color as unknown as Pal],
  ["sombre", colorDark as unknown as Pal],
])("contrastes AA — thème %s", (_name, pal) => {
  it.each(TEXT)("texte %s sur %s ≥ 4,5:1", (fg, bg) => {
    expect(contrast(pal[fg]!, pal[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(NON_TEXT)("élément %s sur %s ≥ 3:1", (fg, bg) => {
    expect(contrast(pal[fg]!, pal[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe("design system commun", () => {
  it("thème sombre : exactement les mêmes clés que le thème clair", () => {
    expect(Object.keys(colorDark).sort()).toEqual(Object.keys(color).sort());
  });
  it("valeurs sémantiques identiques au web (globals.css)", () => {
    expect(color).toMatchObject({ bg: "#F2F4F7", surface: "#FFFFFF", ink: "#17212F", ink2: "#566272", ink3: "#5F6B7C", borderControl: "#818B9B", success: "#1A7550", warningInk: "#85560F", dangerInk: "#AC3838", infoInk: "#24518F", brand: "#101C2C", mint: "#8BE8BE" });
  });
  it("M-12 : l'ancien gris #778292 (3,53:1 sur papier) n'est plus utilisé pour du texte", () => {
    expect(contrast("#778292", "#F2F4F7")).toBeLessThan(4.5);
    expect(contrast(color.ink3, color.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
