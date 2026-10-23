/**
 * Accueil public v2 (docs/design/HANDOFF-v2-site-parcours.md) : composants partagés du site
 * (`src/components/marketing`) et vérité des contenus (G, J) — eBay seul canal disponible, statuts
 * exacts, aucun lien /signup ou /login préchargé, chiffres d'exemple cohérents, règles de perf (I).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children: ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

const { BarcodeField, barcodeFieldLayout, barcodeFieldCenter } = await import("@/components/marketing/barcode-field");
const { ChannelStatus, CHANNEL_STATUS_LABEL } = await import("@/components/marketing/channel-status");
const { PortRow } = await import("@/components/marketing/port-row");
const { Accent } = await import("@/components/marketing/serif-accent");
const { ExampleTag } = await import("@/components/marketing/example-tag");
const { CtaLink } = await import("@/components/marketing/cta-link");
const { Integrations } = await import("@/components/public/home/integrations");
const { SiteFooter } = await import("@/components/public/home/site-footer");
const { MintCta } = await import("@/components/public/home/mint-cta");
const { AFTER, BEFORE, DAYS, DAY_MAX, SALE, STEP_AT, RESET_AT, RESTART_AFTER, AUTOSTART_AFTER } = await import("@/components/public/home/sale-data");

const ROOT = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
const HOME_FILES = [...walk(path.join(ROOT, "src/components/marketing")), ...walk(path.join(ROOT, "src/components/public/home")), path.join(ROOT, "src/app/(public)/page.tsx")];

describe("BarcodeField", () => {
  const props = { n: 96, seed: 20261, litRange: [58, 62] as [number, number], amber: [24, 81] };

  it("géométrie déterministe : même graine → même champ, barres ordonnées dans 0–100 %", () => {
    const a = barcodeFieldLayout(props);
    expect(a).toEqual(barcodeFieldLayout(props));
    expect(a).toHaveLength(96);
    for (let i = 1; i < a.length; i++) expect(a[i]!.left).toBeGreaterThan(a[i - 1]!.left + a[i - 1]!.width - 1e-9);
    const last = a.at(-1)!;
    expect(last.left + last.width).toBeCloseTo(100, 6);
    expect(a.every((b) => b.height > 0 && b.height <= 100)).toBe(true);
  });

  it("5 barres menthe (58–62, eBay), barres ambre 24 et 81", () => {
    const a = barcodeFieldLayout(props);
    expect(a.filter((b) => b.kind === "lit").map((b) => b.i)).toEqual([58, 59, 60, 61, 62]);
    expect(a.filter((b) => b.kind === "amber").map((b) => b.i)).toEqual([24, 81]);
    const c = barcodeFieldCenter(props, 58, 62);
    expect(c).toBeGreaterThan(a[58]!.left);
    expect(c).toBeLessThan(a[62]!.left + a[62]!.width);
  });

  it("enveloppe : bas sous le lead (gauche), haut à droite", () => {
    const a = barcodeFieldLayout({ ...props, envelope: [0.1, 0.1, 1] });
    expect(Math.max(...a.slice(0, 30).map((b) => b.height))).toBeLessThanOrEqual(15);
    expect(Math.max(...a.slice(80).map((b) => b.height))).toBeGreaterThan(50);
  });

  it("rendu serveur : décoratif, n barres, retard selon la distance à growFrom, hauteurs bureau / mobile", () => {
    const html = renderToStaticMarkup(<BarcodeField {...props} height={460} mobileHeight={300} growFrom={60} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/mk-field-bar/g)).toHaveLength(96);
    expect(html).toContain("--mk-fh:460px");
    expect(html).toContain("--mk-fh-m:300px");
    expect(html).toContain("--mk-dist:60"); // barre 0
    expect(html).toContain("--mk-dist:0"); // barre 60
    expect(html.match(/bg-mint/g)).toHaveLength(5);
    expect(html).not.toContain("will-change"); // pas de parallaxe demandée
  });

  it("ton encre (CTA menthe) : barres à l'encre", () => {
    const html = renderToStaticMarkup(<BarcodeField n={72} seed={7240} height={240} mobileHeight={170} tone="ink" />);
    expect(html.match(/mk-field-bar/g)).toHaveLength(72);
    expect(html).toContain("bg-night/85");
  });
});

describe("ChannelStatus", () => {
  it("libellés exacts du handoff, mono, jamais la couleur seule", () => {
    expect(CHANNEL_STATUS_LABEL).toEqual({
      available: "DISPONIBLE",
      soon: "PROCHAINEMENT",
      planned: "PRÉVU · PAS DE DATE",
      running: "EN COURS",
      connected: "CONNECTÉ",
      error: "ERREUR",
      not_connected: "NON CONNECTÉ",
    });
    for (const state of Object.keys(CHANNEL_STATUS_LABEL) as (keyof typeof CHANNEL_STATUS_LABEL)[]) {
      const html = renderToStaticMarkup(<ChannelStatus state={state} />);
      expect(html).toContain(CHANNEL_STATUS_LABEL[state]);
      expect(html).toContain("font-mono");
      expect(html).toMatch(/text-\[(9|10\.5)px\]/);
    }
  });
});

describe("PortRow, Accent, ExampleTag, CtaLink", () => {
  it("port allumé : câble plein et point voyageur ; port ouvert : NON CONNECTÉ", () => {
    const lit = renderToStaticMarkup(<PortRow name="eBay" state="lit" size="lg" />);
    expect(lit).toContain('data-port="lit"');
    expect(lit).toContain("mk-cable-dot");
    expect(lit).not.toContain("NON CONNECTÉ");
    const open = renderToStaticMarkup(<PortRow name="Amazon" state="open" size="md" />);
    expect(open).toContain('data-port="open"');
    expect(open).toContain("NON CONNECTÉ");
    expect(open).toContain(">Amazon<");
  });

  it("logoSrc : image avec le nom en texte alternatif (asset officiel, le jour où il est fourni)", () => {
    const html = renderToStaticMarkup(<PortRow name="eBay" state="lit" logoSrc="/logos/ebay.svg" />);
    expect(html).toMatch(/<img[^>]+alt="eBay"/);
  });

  it("Accent : Instrument Serif italique (font-serif)", () => {
    expect(renderToStaticMarkup(<Accent>canaux.</Accent>)).toMatch(/<em class="font-serif[^"]*italic/);
  });

  it("ExampleTag : EXEMPLE", () => {
    expect(renderToStaticMarkup(<ExampleTag />)).toContain(">EXEMPLE<");
  });

  it("CtaLink : /signup et /login sans préchargement ; ancres en <a> simple", () => {
    expect(renderToStaticMarkup(<CtaLink href="/signup">Créer un compte</CtaLink>)).toContain('data-prefetch="false"');
    expect(renderToStaticMarkup(<CtaLink href="/login">Se connecter</CtaLink>)).toContain('data-prefetch="false"');
    expect(renderToStaticMarkup(<CtaLink href="#integrations">Voir</CtaLink>)).not.toContain("data-prefetch");
  });
});

describe("Intégrations : vérité des statuts (G, J)", () => {
  const html = renderToStaticMarkup(<Integrations />);

  it("une seule ligne allumée (eBay), sept câbles ouverts", () => {
    expect(html.match(/data-port="lit"/g)).toHaveLength(1);
    expect(html.match(/data-port="open"/g)).toHaveLength(7);
    expect(html).toMatch(/data-port="lit"[\s\S]*?>eBay</);
  });

  it("eBay seul DISPONIBLE ; Amazon, Shopify, WooCommerce PROCHAINEMENT ; aucune date", () => {
    expect(html.match(/data-channel-status="available"/g)).toHaveLength(1);
    expect(html.match(/data-channel-status="soon"/g)).toHaveLength(3);
    for (const n of ["Amazon", "Shopify", "WooCommerce"]) expect(html).toContain(`>${n}<`);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\b20\d\d\b|\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|trimestre|semestre)\b|\bT[1-4]\b/i);
  });

  it("BigBuy, Ingram Micro, Sendcloud, Boxtal : présentés pour ce qu'ils sont, pas comme des canaux « sans date »", () => {
    expect(html).not.toContain("PAS DE DATE");
    expect(html.match(/Prix fournisseur/g)).toHaveLength(2);
    expect(html.match(/Devis d(&#x27;|')expédition/g)).toHaveLength(2);
    expect(html).toContain("ne modifient pas le stock");
  });

  it("aucun bouton de connexion sur la page publique", () => {
    expect(html).not.toMatch(/<button|<form|\/api\/integrations/);
  });
});

describe("Pied et CTA final", () => {
  it("liens de compte vers /signup et /login, sans préchargement", () => {
    for (const html of [renderToStaticMarkup(<SiteFooter />), renderToStaticMarkup(<MintCta />)]) {
      const links = [...html.matchAll(/<a href="(\/signup|\/login)"[^>]*>/g)];
      expect(links.length).toBeGreaterThan(0);
      for (const l of links) expect(l[0]).toContain('data-prefetch="false"');
    }
  });

  it("le pied mentionne les marques sans suggérer de partenariat", () => {
    expect(renderToStaticMarkup(<SiteFooter />)).toContain("aucun partenariat");
  });
});

describe("Vente d'exemple : une seule vente, mêmes montants partout (C0)", () => {
  it("CA 1 486 + 479 = 1 965 ; stock 2 → 1 ; ventes 6 → 7 ; à expédier 2 → 3", () => {
    expect(BEFORE.revenue + SALE.amount).toBe(AFTER.revenue);
    expect([BEFORE.stock, AFTER.stock, BEFORE.sales, AFTER.sales, BEFORE.toShip, AFTER.toShip]).toEqual([2, 1, 6, 7, 2, 3]);
    expect(SALE.price).toBe("479,00 €");
  });

  it("14ᵉ barre : 49 % → 65 % du maximum des 14 jours", () => {
    expect(Math.round((BEFORE.revenue / DAY_MAX) * 100)).toBe(BEFORE.dayPct);
    expect(Math.round((AFTER.revenue / DAY_MAX) * 100)).toBe(AFTER.dayPct);
    expect(Math.max(...DAYS)).toBe(DAY_MAX);
  });

  it("chronologie du handoff", () => {
    expect(STEP_AT).toEqual([500, 1600, 2400, 3100, 4000]);
    expect([RESET_AT, RESTART_AFTER, AUTOSTART_AFTER]).toEqual([9400, 1500, 1800]);
  });
});

describe("Règles techniques de l'accueil (F, I)", () => {
  const sources = HOME_FILES.map((f) => [path.relative(ROOT, f), readFileSync(f, "utf8")] as const);

  it("aucun backdrop-filter, aucune bibliothèque d'animation, aucune image bitmap", () => {
    for (const [rel, src] of sources) {
      expect(src, rel).not.toMatch(/backdrop-(filter|blur)/);
      expect(src, rel).not.toMatch(/from "(framer-motion|motion|gsap|lottie[^"]*|react-spring)"/);
      expect(src, rel).not.toMatch(/\.(png|jpe?g|webp|gif|avif)\b/);
    }
  });

  it("chaque lien <Link> vers /signup ou /login porte prefetch={false}", () => {
    for (const [rel, src] of sources) {
      for (const m of src.matchAll(/<Link\b[^>]*href="\/(signup|login)"[^>]*>/g)) expect(m[0], rel).toContain("prefetch={false}");
    }
  });

  it("un seul écouteur de défilement : addEventListener(\"scroll\") n'apparaît que dans motion.ts", () => {
    const withScroll = sources.filter(([, src]) => /addEventListener\(\s*"scroll"/.test(src)).map(([rel]) => rel);
    expect(withScroll).toEqual(["src/components/marketing/motion.ts"]);
  });

  it("aucun setState dans les abonnements au défilement", () => {
    let found = 0;
    for (const [rel, src] of sources) {
      for (const m of src.matchAll(/subscribeScroll\(([\s\S]*?)\n\s*\}\);/g)) {
        found++;
        expect(m[1], rel).not.toMatch(/\bset[A-Z]\w*\(/);
      }
    }
    expect(found).toBeGreaterThanOrEqual(3); // parallaxe, hero, scènes
  });

  it("Instrument Serif auto-hébergée par next/font (aucun lien Google Fonts dans les sources)", () => {
    const layout = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/Instrument_Serif\(\{[\s\S]*style: "italic"[\s\S]*subsets: \["latin"\][\s\S]*variable: "--font-instrument-serif"/);
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    expect(css).toContain("--font-serif: var(--font-instrument-serif)");
    expect(css).toContain("--paper-marketing: #f3f2ee");
    for (const [rel, src] of sources) expect(src, rel).not.toContain("fonts.googleapis.com");
  });
});
