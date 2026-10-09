import { describe, expect, it } from "vitest";
import { escapeLike, orFilterTerm, orIlikeAny } from "@/lib/postgrest";
import { escapeLike as offerEscapeLike } from "@/services/sourcing/offer-query";

/**
 * Mini-analyseur fidèle à PostgREST pour une condition d'un filtre `or=(…)` :
 * une valeur entre guillemets accepte tout, `\` échappe le caractère suivant ;
 * sinon la valeur s'arrête au premier `,` ou `)`. Renvoie les conditions décodées.
 */
function parseOr(filter: string): Array<{ column: string; op: string; value: string }> {
  const out: Array<{ column: string; op: string; value: string }> = [];
  let i = 0;
  while (i < filter.length) {
    const m = /^([a-z_]+)\.([a-z]+)\./.exec(filter.slice(i));
    if (!m) throw new Error(`condition illisible à ${i} : ${filter.slice(i)}`);
    i += m[0].length;
    let value = "";
    if (filter[i] === '"') {
      i++;
      while (i < filter.length && filter[i] !== '"') {
        if (filter[i] === "\\") i++;
        value += filter[i];
        i++;
      }
      if (filter[i] !== '"') throw new Error("guillemet non fermé");
      i++;
    } else {
      while (i < filter.length && filter[i] !== "," && filter[i] !== ")") value += filter[i++];
    }
    out.push({ column: m[1]!, op: m[2]!, value });
    if (i < filter.length) {
      if (filter[i] !== ",") throw new Error(`séparateur inattendu « ${filter[i]} » : condition injectée`);
      i++;
    }
  }
  return out;
}

/** Applique un motif LIKE PostgreSQL (échappement par antislash, `*` → `%` comme PostgREST), insensible à la casse. */
function ilike(text: string, pattern: string): boolean {
  let re = "";
  const p = pattern.replace(/\*/g, "%");
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!;
    if (ch === "\\") re += (p[++i] ?? "").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    else if (ch === "%") re += "[\\s\\S]*";
    else if (ch === "_") re += "[\\s\\S]";
    else re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(text);
}

describe("escapeLike (filtre .ilike() simple)", () => {
  it("échappe %, _ et \\ : la saisie est cherchée littéralement", () => {
    expect(escapeLike("100%_x\\y")).toBe("100\\%\\_x\\\\y");
    expect(ilike("100%_x\\y", escapeLike("100%_x\\y"))).toBe(true);
    expect(ilike("100abx\\y", escapeLike("100%_x\\y"))).toBe(false);
    expect(ilike("IPH13-128", escapeLike("iph13-128"))).toBe(true);
  });

  it("le sourcing réutilise la même implémentation", () => {
    expect(offerEscapeLike).toBe(escapeLike);
  });
});

describe("orFilterTerm / orIlikeAny (filtre .or() PostgREST)", () => {
  const columns = ["product_name", "code", "barcode"];

  it("aucune saisie ne peut ajouter de condition ni casser la syntaxe", () => {
    const attacks = ['x),organization_id.neq.0,code.ilike.(', 'a"b', "a\\", 'iphone,organization_id.neq.x),("a\\', "((((", ")", '\\"),id.eq.1', "a.b:c"];
    for (const a of attacks) {
      const f = orIlikeAny(columns, a);
      if (f === null) continue;
      const conds = parseOr(f);
      expect(conds.map((c) => c.column), a).toEqual(columns);
      expect(new Set(conds.map((c) => c.op)), a).toEqual(new Set(["ilike"]));
    }
  });

  it("comportement de l'ancienne recherche du stock : virgules, parenthèses, guillemets et `*` neutralisés", () => {
    const [cond] = parseOr(orIlikeAny(["product_name"], "iPhone 13, Pro (bleu)")!);
    expect(cond!.value).toBe("%iPhone 13 Pro bleu%");
    expect(ilike("Apple iPhone 13 Pro bleu 128 Go", cond!.value)).toBe(true);
    expect(parseOr(orIlikeAny(["code"], 'a"b*c')!)[0]!.value).toBe("%a b c%");
  });

  it("`%` est cherché littéralement, `_` se reconnaît lui-même", () => {
    const [pct] = parseOr(orIlikeAny(["code"], "100%")!);
    expect(pct!.value).toBe("%100\\%%");
    expect(ilike("Remise 100% neuf", pct!.value)).toBe(true);
    expect(ilike("Remise 1000 neuf", pct!.value)).toBe(false);
    const [us] = parseOr(orIlikeAny(["code"], "IPH13_128")!);
    expect(ilike("IPH13_128-BLK", us!.value)).toBe(true);
  });

  it("comportement de l'ancienne recherche d'annonces : valeur entre guillemets, saisie bornée", () => {
    expect(orIlikeAny(["title"], "IPH13_128")).toBe('title.ilike."%IPH13_128%"');
    expect(orFilterTerm("x".repeat(300), { maxLength: 120 })).toBe(`"%${"x".repeat(120)}%"`);
  });

  it("recherche vide après nettoyage : aucun filtre", () => {
    expect(orFilterTerm("  ,()  ")).toBeNull();
    expect(orIlikeAny(columns, '"*"')).toBeNull();
    expect(orIlikeAny([], "abc")).toBeNull();
  });
});
