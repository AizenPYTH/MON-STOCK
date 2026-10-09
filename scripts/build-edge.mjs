#!/usr/bin/env node
/**
 * Construit l'Edge Function Supabase `api` (supabase/functions/api/bundle.js, importé par index.ts) à partir des
 * services serveur existants (src/), sans dupliquer de logique.
 *
 *  - alias `@/` → src/ ; Next.js / React / @supabase/ssr / server-only → shims (server/edge/shims)
 *  - dépendances npm laissées EXTERNES et importées via des spécificateurs `npm:` (résolus par
 *    Deno côté Supabase) : le bundle ne contient que notre code
 *  - `process.env` (Node) → variables Deno ; NEXT_PUBLIC_SUPABASE_* dérivées de SUPABASE_URL /
 *    SUPABASE_ANON_KEY fournies automatiquement aux Edge Functions
 *
 * Usage : node scripts/build-edge.mjs [--minify]
 */
import { build } from "esbuild";
import { readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const minify = process.argv.includes("--minify");
const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
const versionOf = (name) => {
  const v = lock.packages?.[`node_modules/${name}`]?.version;
  if (!v) throw new Error(`version introuvable dans package-lock.json : ${name}`);
  return v;
};

/** Paquets npm chargés par Deno (`npm:paquet@version/sous-chemin`). */
const NPM = ["@supabase/supabase-js", "zod", "csv-parse", "fast-xml-parser"];
const shims = {
  "server-only": "server/edge/shims/empty.ts",
  "next/server": "server/edge/shims/next-server.ts",
  "next/navigation": "server/edge/shims/next-other.ts",
  "next/headers": "server/edge/shims/next-other.ts",
  "next/cache": "server/edge/shims/next-other.ts",
  react: "server/edge/shims/react.ts",
  "@supabase/ssr": "server/edge/shims/supabase-ssr.ts",
};

const plugin = {
  name: "mon-stock-edge",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (shims[args.path]) return { path: path.join(root, shims[args.path]) };
      if (args.path.startsWith("@/")) return null; // alias tsconfig géré par esbuild
      if (args.path.startsWith("node:")) return { path: args.path, external: true };
      const pkg = NPM.find((p) => args.path === p || args.path.startsWith(`${p}/`));
      if (pkg) return { path: `npm:${pkg}@${versionOf(pkg)}${args.path.slice(pkg.length)}`, external: true };
      return null;
    });
  },
};

const banner = `// GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier à la main.
import { Buffer as __Buffer } from "node:buffer";
const __denoEnv = globalThis.Deno?.env?.toObject?.() ?? {};
const process = { env: { NODE_ENV: "production", ...__denoEnv, NEXT_PUBLIC_SUPABASE_URL: __denoEnv.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: __denoEnv.SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL: __denoEnv.APP_URL ?? __denoEnv.SUPABASE_URL } };
const Buffer = globalThis.Buffer ?? __Buffer;`;

const outfile = path.join(root, "supabase/functions/api/bundle.js");
mkdirSync(path.dirname(outfile), { recursive: true });
const result = await build({
  entryPoints: [path.join(root, "server/edge/main.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  outfile,
  minify,
  legalComments: "none",
  tsconfig: path.join(root, "tsconfig.json"),
  banner: { js: banner },
  plugins: [plugin],
  metafile: true,
  logLevel: "warning",
});
const size = statSync(outfile).size;
writeFileSync(path.join(root, "supabase/functions/api/meta.json"), JSON.stringify({ inputs: Object.keys(result.metafile.inputs).length, bytes: size }, null, 2) + "\n");
console.log(`✓ supabase/functions/api/bundle.js (${(size / 1024).toFixed(1)} Ko, ${Object.keys(result.metafile.inputs).length} modules)`);
