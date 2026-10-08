import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

describe("ButtonLink", () => {
  it("ouvre les liens externes http(s) dans un nouvel onglet sans opener", () => {
    const html = renderToStaticMarkup(h(ButtonLink, { href: "https://fournisseur.example/p/1", children: "Voir" }));
    expect(html).toContain('href="https://fournisseur.example/p/1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "//evil.example/x", "vbscript:x"])("neutralise %j (pas de href rendu)", (href) => {
    const html = renderToStaticMarkup(h(ButtonLink, { href, children: "Voir" }));
    expect(html).not.toContain("href=");
    expect(html).toContain('aria-disabled="true"');
  });
  it("rend les chemins internes comme des liens", () => {
    const html = renderToStaticMarkup(h(ButtonLink, { href: "/stock/new", children: "Créer" }));
    expect(html).toContain('href="/stock/new"');
    expect(html).not.toContain("_blank");
  });
});

describe("Field / contrôles", () => {
  it("marque les champs obligatoires et relie l'erreur au contrôle", () => {
    const html = renderToStaticMarkup(h(Field, { label: "Quantité", htmlFor: "qty", error: "Valeur requise.", children: h(Input, { id: "qty", required: true }) }));
    expect(html).toContain("(obligatoire)");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="qty-error"');
    expect(html).toContain('id="qty-error"');
    expect(html).toContain('role="alert"');
  });
  it("relie l'indice au contrôle sans erreur", () => {
    const html = renderToStaticMarkup(h(Field, { label: "Nom", htmlFor: "n", hint: "Visible par l'équipe", children: h(Input, { id: "n" }) }));
    expect(html).toContain('aria-describedby="n-hint"');
    expect(html).not.toContain('aria-invalid="');
    expect(html).not.toContain("(obligatoire)");
  });
  it("donne un nom accessible aux filtres compacts sans <label>", () => {
    expect(renderToStaticMarkup(h(Input, { name: "q", placeholder: "Rechercher…" }))).toContain('aria-label="Rechercher…"');
    const select = renderToStaticMarkup(h(Select, { name: "brand" }, h("option", { value: "" }, "Marque"), h("option", { value: "x" }, "X")));
    expect(select).toContain('aria-label="Marque"');
  });
  it("ne remplace pas un libellé explicite", () => {
    expect(renderToStaticMarkup(h(Input, { id: "e", placeholder: "ex. a@b.fr" }))).not.toContain("aria-label");
    expect(renderToStaticMarkup(h(Input, { "aria-label": "Courriel", placeholder: "x" }))).toContain('aria-label="Courriel"');
  });
});
