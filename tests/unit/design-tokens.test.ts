import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { StatTile, Stat } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TR } from "@/components/ui/table";
import { Alert, Callout } from "@/components/ui/callout";
import { EmptyState as PageEmptyState, Callout as PageCallout, Skeleton as PageSkeleton } from "@/components/ui/page";
import { themeInitScript } from "@/components/ui/theme-script";

const ROOT = path.resolve(__dirname, "../..");
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

function block(name: string): Record<string, string> {
  const m = css.match(new RegExp(`@tokens:${name}:start \\*/([\\s\\S]*?)/\\* @tokens:${name}:end`));
  if (!m) throw new Error(`bloc de jetons introuvable : ${name}`);
  const out: Record<string, string> = {};
  for (const [, k, v] of m[1]!.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[k!] = v!.trim();
  return out;
}

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const light = block("light");
const darkMedia = block("dark-media");
const darkAttr = block("dark-attr");
const dark = { ...light, ...darkAttr };

const cross = (fgs: string[], bgs: string[], min: number) => fgs.flatMap((f) => bgs.map((b) => [f, b, min] as const));
/** Couples texte / fond (4,5:1, WCAG AA texte normal) et éléments d'interface (3:1, WCAG 1.4.11). */
const PAIRS = [
  ...cross(["foreground", "muted-strong", "muted", "ink-3"], ["background", "surface", "surface-2", "surface-3", "selection"], 4.5),
  ...cross(["interactive"], ["background", "surface", "surface-2"], 4.5),
  ...["success", "warning", "danger", "info"].flatMap((t) => [...cross([t, `${t}-ink`], ["surface", "background", "surface-2", `${t}-soft`], 4.5), [`on-${t}-strong`, `${t}-strong`, 4.5] as const]),
  ["on-inverse", "inverse", 4.5] as const,
  ["on-inverse", "inverse-hover", 4.5] as const,
  ["night", "mint", 4.5] as const,
  ["night", "mint-pressed", 4.5] as const,
  ...cross(["on-night", "on-night-muted", "on-night-subtle", "mint", "amber", "danger-on-night"], ["night", "night-deep"], 4.5),
  ...cross(["on-night", "on-night-muted"], ["night-raised", "night-hover"], 4.5),
  ...cross(["ring"], ["background", "surface", "night"], 3),
  ...cross(["border-control"], ["surface", "background"], 3),
];

describe("jetons de thème (globals.css)", () => {
  it("les deux blocs sombres (prefers-color-scheme et data-theme) sont identiques", () => {
    expect(darkMedia).toEqual(darkAttr);
  });
  it("chaque jeton clair a sa valeur sombre", () => {
    expect(Object.keys(light).filter((k) => !(k in darkAttr))).toEqual([]);
  });
  it("garde les jetons historiques utilisés par les pages", () => {
    for (const k of ["background", "surface", "surface-muted", "border", "border-strong", "foreground", "muted", "muted-strong", "accent", "accent-soft", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "info", "info-soft", "ring", "night", "night-deep", "night-raised", "on-night", "on-night-muted", "night-line", "mint", "mint-pressed", "amber", "red", "ink-3", "ink-4", "on-night-subtle", "night-stroke", "night-hover", "selection", "track", "line-soft", "danger-line", "danger-on-night", "overlay"]) {
      expect(light[k], k).toBeDefined();
      expect(css, `--color-${k}`).toContain(`--color-${k}: var(--${k});`);
    }
  });
  it.each([
    ["clair", light],
    ["sombre", dark],
  ] as const)("contrastes WCAG AA mesurés (thème %s)", (_name, theme) => {
    const failures = PAIRS.map(([f, b, min]) => ({ f, b, min, ratio: contrast(theme[f]!, theme[b]!) })).filter((p) => p.ratio < p.min);
    expect(failures).toEqual([]);
  });
});

describe("aucune couleur littérale dans le kit", () => {
  const dirs = ["src/components/ui", "src/components/instrument"];
  const files = dirs.flatMap((d) => readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".tsx")).map((f) => path.join(ROOT, d, f)));
  it.each(files.map((f) => [path.relative(ROOT, f), f]))("%s", (_rel, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![^"]*\])|rgba?\(|\b(?:bg|text|border|ring)-(?:white|black|red|green|blue|amber|orange|zinc|gray|slate)-\d{2,3}\b/);
  });
});

describe("composants du kit", () => {
  it("StatTile : valeur inconnue → « — », jamais 0 ; 0 connu reste 0", () => {
    const unknown = renderToStaticMarkup(h(StatTile, { label: "Délai", value: null }));
    expect(unknown).toContain("—");
    expect(unknown).toContain('aria-label="inconnu"');
    expect(renderToStaticMarkup(h(StatTile, { label: "Ruptures", value: 0 }))).toMatch(/>0</);
    expect(renderToStaticMarkup(h(Stat, { label: "CA", value: undefined }))).toContain("—");
  });
  it("StatusBadge : icône + texte", () => {
    const html = renderToStaticMarkup(h(StatusBadge, { tone: "danger", children: "Rupture" }));
    expect(html).toContain("<svg");
    expect(html).toContain("Rupture");
  });
  it("Button loading : désactivé, aria-busy, libellé d'attente", () => {
    const html = renderToStaticMarkup(h(Button, { loading: true, loadingText: "Enregistrement…", children: "Enregistrer" }));
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Enregistrement…");
    expect(html).not.toContain(">Enregistrer<");
  });
  it("Table : largeur minimale remplaçable, vue cartes avec intitulés", () => {
    const html = renderToStaticMarkup(h(Table, { className: "min-w-[900px]", stackOnMobile: true, density: "compact" }, h(TBody, null, h(TR, null, h(TD, { label: "Qté", align: "right" }, "3")))));
    expect(html).toContain("min-w-[900px]");
    expect(html).not.toContain("min-w-[640px]");
    expect(html).toContain("ms-table-stack");
    expect(html).toContain('data-density="compact"');
    expect(html).toContain('data-label="Qté"');
  });
  it("Callout / Alert : icône par défaut, rôle annoncé pour Alert", () => {
    expect(renderToStaticMarkup(h(Callout, { tone: "warning", children: "x" }))).toContain("<svg");
    expect(renderToStaticMarkup(h(Alert, { tone: "danger", children: "x" }))).toContain('role="alert"');
    expect(renderToStaticMarkup(h(Alert, { tone: "success", children: "x" }))).toContain('role="status"');
  });
  it("page.tsx réexporte toujours les anciens composants", () => {
    expect(typeof PageEmptyState).toBe("function");
    expect(typeof PageCallout).toBe("function");
    expect(typeof PageSkeleton).toBe("function");
  });
  it("script de thème : lit localStorage puis cookie, protégé par try/catch", () => {
    expect(themeInitScript).toContain("localStorage");
    expect(themeInitScript).toContain("document.cookie");
    expect(themeInitScript).toContain("catch");
    expect(themeInitScript).toContain('setAttribute("data-theme"');
  });
});
