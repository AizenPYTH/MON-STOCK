/**
 * M-28 : l'application iPhone lit et écrit une partie des données DIRECTEMENT (PostgREST / RPC sous
 * le jeton de l'utilisateur) — la RLS est alors la barrière principale. Ce garde-fou inventorie
 * chaque table, vue et RPC appelée depuis apps/mobile/src et vérifie sur la base migrée :
 *  - tables : RLS activée ;
 *  - vues : security_invoker (la RLS des tables sous-jacentes s'applique à l'appelant) ;
 *  - RPC : jamais exécutables par anon ; SECURITY DEFINER seulement avec search_path fixé.
 * Toute nouvelle lecture directe ajoutée au mobile est donc contrôlée automatiquement.
 * (Le contenu des politiques est couvert par security-tenant-matrix.test.ts et rls.test.ts.)
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { canConnect, withRollback } from "./helpers";

const available = await canConnect();
const d = available ? describe : describe.skip;
const MOBILE_SRC = path.resolve(__dirname, "../../apps/mobile/src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

function inventory() {
  const tables = new Set<string>();
  const rpcs = new Set<string>();
  for (const f of files(MOBILE_SRC)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\.from\("([a-z_]+)"\)/g)) tables.add(m[1]!);
    for (const m of src.matchAll(/\.rpc\("([a-z_]+)"/g)) rpcs.add(m[1]!);
  }
  return { tables: [...tables].sort(), rpcs: [...rpcs].sort() };
}

d("M-28 : accès directs de l'application mobile", () => {
  it("inventaire non vide (le scanner lit bien le code mobile)", () => {
    const inv = inventory();
    expect(inv.tables).toEqual(expect.arrayContaining(["inventory_movements", "orders", "v_stock_overview"]));
    expect(inv.rpcs).toEqual(expect.arrayContaining(["apply_inventory_movement", "create_draft_purchase_order"]));
  });

  it("chaque table a la RLS, chaque vue est security_invoker, aucune RPC n'est ouverte à anon", async () => {
    const inv = inventory();
    await withRollback(async (c) => {
      const { rows } = await c.query<{ name: string; kind: string; rls: boolean; opts: string[] | null }>(
        "select c.relname as name, c.relkind as kind, c.relrowsecurity as rls, c.reloptions as opts from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any($1)",
        [inv.tables],
      );
      const found = new Map(rows.map((r) => [r.name, r]));
      const problems: string[] = [];
      for (const t of inv.tables) {
        const r = found.get(t);
        if (!r) problems.push(`${t} : introuvable`);
        else if (r.kind === "r" && !r.rls) problems.push(`${t} : RLS désactivée`);
        else if (r.kind === "v" && !(r.opts ?? []).some((o) => /^security_invoker=(true|on)$/i.test(o))) problems.push(`${t} : vue sans security_invoker`);
      }
      const fns = await c.query<{ name: string; anon: boolean; definer: boolean; cfg: string | null }>(
        "select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, p.prosecdef as definer, array_to_string(p.proconfig, ',') as cfg from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)",
        [inv.rpcs],
      );
      for (const name of inv.rpcs) {
        const defs = fns.rows.filter((f) => f.name === name);
        if (defs.length === 0) problems.push(`rpc ${name} : introuvable`);
        for (const f of defs) {
          if (f.anon) problems.push(`rpc ${name} : exécutable par anon`);
          if (f.definer && !/search_path=/.test(f.cfg ?? "")) problems.push(`rpc ${name} : SECURITY DEFINER sans search_path`);
        }
      }
      expect(problems).toEqual([]);
    });
  });
});
