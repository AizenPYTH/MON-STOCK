/**
 * Garde-fou des scripts dangereux (D-03 / Q-02) : seed de démonstration, synchronisation manuelle,
 * recherches de test… refusent de tourner contre la base de PRODUCTION identifiée, sauf dérogation
 * explicite et nommée.
 *
 *   MONSTOCK_ALLOW_PRODUCTION=<ref>   dérogation : la valeur doit être EXACTEMENT la référence du
 *                                     projet visé (ex. ccywsegdowikeirbsfae), pas « 1 » ni « true ».
 *   MONSTOCK_PRODUCTION_REFS=a,b      références de production supplémentaires (en plus de la liste fixe).
 *
 * Seuls les NOMS des variables et la référence du projet (publique) sont affichés : jamais les valeurs.
 * Ce garde-fou protège contre les erreurs de bonne foi (mauvais .env.local) ; ce n'est pas une
 * frontière de sécurité (la vraie frontière : une base de préproduction distincte).
 */

/** Projet Supabase de production connu (lecture : docs/OPERATIONS.md, apps/mobile/eas.json). */
export const KNOWN_PRODUCTION_REFS: readonly string[] = ["ccywsegdowikeirbsfae"];

export const PRODUCTION_OVERRIDE_VAR = "MONSTOCK_ALLOW_PRODUCTION";
export const EXTRA_PRODUCTION_REFS_VAR = "MONSTOCK_PRODUCTION_REFS";

/** Variables qui désignent la base ou le projet visé par un script. */
export const TARGET_VARIABLES: readonly string[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_URL",
  "PGHOST",
];

type Env = Record<string, string | undefined>;

export interface ProductionTarget {
  variable: string;
  ref: string;
}

export class ProductionTargetError extends Error {
  readonly targets: ProductionTarget[];
  constructor(message: string, targets: ProductionTarget[]) {
    super(message);
    this.name = "ProductionTargetError";
    this.targets = targets;
  }
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function productionRefs(env: Env = process.env): string[] {
  return [...new Set([...KNOWN_PRODUCTION_REFS.map((r) => r.toLowerCase()), ...splitList(env[EXTRA_PRODUCTION_REFS_VAR])])];
}

/** Variables de `env` qui pointent vers un projet de production (URL HTTP, chaîne Postgres directe ou pooler). */
export function findProductionTargets(env: Env = process.env, variables: readonly string[] = TARGET_VARIABLES): ProductionTarget[] {
  const refs = productionRefs(env);
  const found: ProductionTarget[] = [];
  for (const variable of variables) {
    const value = env[variable]?.toLowerCase();
    if (!value) continue;
    // db.<ref>.supabase.co, https://<ref>.supabase.co, postgres.<ref>@…pooler.supabase.com
    for (const ref of refs) if (value.includes(ref)) found.push({ variable, ref });
  }
  return found;
}

/**
 * Lève `ProductionTargetError` si une variable cible la production et que la dérogation ne nomme pas
 * exactement chacune des références détectées. Renvoie les cibles autorisées par dérogation (vide sinon).
 */
export function assertNotProductionTarget(scriptName: string, env: Env = process.env, variables: readonly string[] = TARGET_VARIABLES): ProductionTarget[] {
  const targets = findProductionTargets(env, variables);
  if (targets.length === 0) return [];
  const allowed = new Set(splitList(env[PRODUCTION_OVERRIDE_VAR]));
  const refused = targets.filter((t) => !allowed.has(t.ref));
  if (refused.length === 0) return targets;
  const refs = [...new Set(refused.map((t) => t.ref))];
  const vars = [...new Set(refused.map((t) => t.variable))];
  throw new ProductionTargetError(
    `[${scriptName}] refusé : ${vars.join(", ")} pointe vers le projet de PRODUCTION ${refs.join(", ")}.\n` +
      `Utilisez une base locale ou de préproduction. Dérogation volontaire uniquement : ${PRODUCTION_OVERRIDE_VAR}=${refs.join(",")}`,
    refused,
  );
}

/** Variante pour les points d'entrée CLI : message sur stderr et code de sortie 3. */
export function exitIfProductionTarget(scriptName: string, env: Env = process.env): void {
  try {
    const overridden = assertNotProductionTarget(scriptName, env);
    if (overridden.length > 0) {
      console.warn(`[${scriptName}] ATTENTION : exécution contre la PRODUCTION (${[...new Set(overridden.map((t) => t.ref))].join(", ")}) autorisée par ${PRODUCTION_OVERRIDE_VAR}.`);
    }
  } catch (e) {
    if (e instanceof ProductionTargetError) {
      console.error(e.message);
      process.exit(3);
    }
    throw e;
  }
}
