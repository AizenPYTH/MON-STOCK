/**
 * Tests GÉNÉRÉS depuis pg_catalog : ils échouent dès qu'une migration ajoute une table
 * sans RLS, sans policy, une vue qui contourne la RLS, une fonction exposée à anon, etc.
 */
import { describe, expect, it } from "vitest";
import { canConnect, connect } from "./helpers";
import { listFunctions, listRelations, SERVICE_ROLE_ONLY_TABLES } from "./security-fixtures";

const available = await canConnect();
const d = available ? describe : describe.skip;

async function withClient<T>(fn: (c: Awaited<ReturnType<typeof connect>>) => Promise<T>): Promise<T> {
  const c = await connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

d("Catalogue de sécurité (généré depuis pg_catalog)", () => {
  it("chaque table du schéma public a la RLS activée", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ relname: string }>(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`);
      expect(rows.map((r) => r.relname), "tables sans RLS").toEqual([]);
    });
  });

  it("chaque table a au moins une policy, sauf les tables service_role documentées (qui n'ont aucun privilège client)", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ relname: string; npol: number }>(`
        select c.relname, (select count(*)::int from pg_policy p where p.polrelid = c.oid) as npol
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
      const serviceOnly = new Set<string>(SERVICE_ROLE_ONLY_TABLES);
      const withoutPolicy = rows.filter((r) => r.npol === 0).map((r) => r.relname);
      expect(withoutPolicy.sort(), "tables sans policy non documentées").toEqual([...serviceOnly].sort());
      for (const t of serviceOnly) {
        for (const role of ["anon", "authenticated"]) {
          const { rows: priv } = await c.query<{ any: boolean }>(
            `select has_table_privilege($1, $2, 'SELECT') or has_table_privilege($1, $2, 'INSERT') or has_table_privilege($1, $2, 'UPDATE') or has_table_privilege($1, $2, 'DELETE') as any`,
            [role, `public.${t}`],
          );
          expect(priv[0]!.any, `${role} a un privilège sur ${t}`).toBe(false);
        }
      }
    });
  });

  it("aucune policy n'est accordée à PUBLIC ou anon (toutes ciblent authenticated)", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ tablename: string; policyname: string; roles: string[] }>(`
        select tablename, policyname, roles::text[] as roles from pg_policies where schemaname = 'public'
        and not (roles = array['authenticated']::name[]) order by 1, 2`);
      expect(rows, "policies ouvertes à d'autres rôles que authenticated").toEqual([]);
    });
  });

  it("chaque vue est security_invoker (la RLS des tables sous-jacentes s'applique) et aucune vue matérialisée n'est exposée", async () => {
    await withClient(async (c) => {
      const rels = await listRelations(c);
      const views = rels.filter((r) => r.kind === "view").map((r) => r.name);
      expect(views.length).toBeGreaterThan(0);
      const { rows } = await c.query<{ relname: string }>(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'
          and not coalesce(c.reloptions @> array['security_invoker=true'], false) order by 1`);
      expect(rows.map((r) => r.relname), "vues sans security_invoker").toEqual([]);
      const mat = rels.filter((r) => r.kind === "matview").map((r) => r.name);
      for (const m of mat) {
        const { rows: p } = await c.query<{ v: boolean }>("select has_table_privilege('authenticated', $1, 'SELECT') or has_table_privilege('anon', $1, 'SELECT') as v", [`public.${m}`]);
        expect(p[0]!.v, `vue matérialisée ${m} lisible sans RLS`).toBe(false);
      }
    });
  });

  it("anon n'a aucun privilège sur les tables et vues", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ relname: string; privs: string }>(`
        select c.relname,
          concat_ws(',',
            case when has_table_privilege('anon', c.oid, 'SELECT') then 'select' end,
            case when has_table_privilege('anon', c.oid, 'INSERT') then 'insert' end,
            case when has_table_privilege('anon', c.oid, 'UPDATE') then 'update' end,
            case when has_table_privilege('anon', c.oid, 'DELETE') then 'delete' end,
            case when has_table_privilege('anon', c.oid, 'TRUNCATE') then 'truncate' end) as privs
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1`);
      expect(rows.filter((r) => r.privs !== ""), "privilèges anon").toEqual([]);
    });
  });

  it("authenticated n'a jamais TRUNCATE (qui contourne la RLS)", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ relname: string }>(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'TRUNCATE') order by 1`);
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  it("tables écrites uniquement par le serveur : aucun privilège d'écriture client", async () => {
    await withClient(async (c) => {
      for (const t of ["fx_rates", "webhook_events", "sync_runs", "sync_errors"]) {
        const { rows } = await c.query<{ w: boolean }>(
          "select has_table_privilege('authenticated', $1, 'INSERT') or has_table_privilege('authenticated', $1, 'UPDATE') or has_table_privilege('authenticated', $1, 'DELETE') as w",
          [`public.${t}`],
        );
        expect(rows[0]!.w, t).toBe(false);
      }
    });
  });

  it("anon ne peut exécuter aucune fonction du schéma public", async () => {
    await withClient(async (c) => {
      const fns = await listFunctions(c);
      expect(fns.length).toBeGreaterThan(0);
      const exposed: string[] = [];
      for (const f of fns) {
        const { rows } = await c.query<{ x: boolean }>("select has_function_privilege('anon', $1::oid, 'EXECUTE') as x", [f.oid]);
        if (rows[0]!.x) exposed.push(f.signature);
      }
      expect(exposed, "fonctions exécutables par anon").toEqual([]);
    });
  });

  it("chaque fonction SECURITY DEFINER fixe son search_path", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ sig: string }>(`
        select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%') order by 1`);
      expect(rows.map((r) => r.sig), "SECURITY DEFINER sans search_path").toEqual([]);
    });
  });

  it("chaque table portant organization_id a le garde-fou « même organisation » couvrant toutes ses clés étrangères métier", async () => {
    await withClient(async (c) => {
      const { rows } = await c.query<{ table: string; expected: string[]; def: string | null }>(`
        with org_tables as (
          select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p')
            and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
        )
        select t.relname as table,
          coalesce(array_agg(a.attname::text order by a.attname) filter (where a.attname is not null), '{}') as expected,
          (select pg_get_triggerdef(tg.oid) from pg_trigger tg where tg.tgrelid = t.oid and tg.tgname = 'zz_same_org_guard') as def
        from org_tables t
        left join pg_constraint k on k.conrelid = t.oid and k.contype = 'f' and array_length(k.conkey, 1) = 1
          and k.confrelid <> 'public.organizations'::regclass
          and k.confrelid in (select oid from org_tables)
        left join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
        group by t.oid, t.relname
        order by 1`);
      expect(rows.length).toBeGreaterThan(20);
      const problems: string[] = [];
      for (const r of rows) {
        if (r.def === null || !/BEFORE INSERT OR UPDATE/.test(r.def)) {
          problems.push(`${r.table}: aucun trigger → select public.install_same_org_guards('public.${r.table}'::regclass);`);
          continue;
        }
        const argList = r.def.slice(r.def.indexOf("enforce_same_org_references(") + "enforce_same_org_references(".length, r.def.lastIndexOf(")"));
        const args = [...argList.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
        const cols = args.filter((_, i) => i % 2 === 0).sort();
        if (JSON.stringify(cols) !== JSON.stringify([...r.expected].sort())) {
          problems.push(`${r.table}: attendu [${r.expected.join(", ")}], installé [${cols.join(", ")}] → select public.install_same_org_guards('public.${r.table}'::regclass);`);
        }
      }
      expect(problems, "garde-fous manquants").toEqual([]);
    });
  });
});
