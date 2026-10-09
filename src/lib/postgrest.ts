/**
 * Échappement des saisies utilisateur insérées dans des filtres PostgREST.
 * Module UNIQUE (pur, sans dépendance) : toutes les recherches texte passent par ici.
 *
 * Règles PostgREST rappelées :
 * - `ilike` : motif LIKE PostgreSQL (échappement par antislash, `%` et `_` sont des jokers) ;
 *   PostgREST convertit en plus chaque `*` en `%` (impossible à échapper).
 * - `or=(…)` / `and=(…)` : la valeur d'une condition s'arrête à `,` ou `)` ; entre guillemets
 *   doubles, ces caractères sont permis et `\` échappe le caractère suivant (`\"`, `\\`).
 */

/** Échappe les jokers LIKE (`%`, `_` et `\`) : la saisie est cherchée littéralement (filtre `.ilike()` simple). */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Valeur sûre pour une condition `ilike` « contient » d'un filtre `.or()` : renvoie `"%…%"` (guillemets
 * compris) ou `null` si la recherche est vide après nettoyage.
 * - les caractères structurants `,`, `(`, `)`, `"`, `\` sont neutralisés (remplacés par une espace),
 *   ainsi que `*` (joker PostgREST) : la saisie ne peut ni casser la requête ni ajouter de condition ;
 * - la valeur est placée entre guillemets doubles (défense en profondeur : `.`, `:` et espaces y sont sûrs) ;
 * - `%` est cherché littéralement (échappé `\%`, antislash doublé dans la syntaxe entre guillemets) ;
 * - `_` est conservé : joker d'UN caractère qui se reconnaît aussi lui-même (« IPH13_128 » trouve « IPH13_128 »).
 */
export function orFilterTerm(raw: string, options: { maxLength?: number } = {}): string | null {
  const term = raw
    .replace(/[,()"\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, options.maxLength ?? 200)
    .trim();
  if (!term) return null;
  // `%` → `\%` pour LIKE, puis `\` → `\\` pour la syntaxe entre guillemets de PostgREST.
  const like = term.replace(/%/g, "\\\\%");
  return `"%${like}%"`;
}

/** Filtre `.or()` « une des colonnes contient la recherche » ; `null` si la recherche est vide. */
export function orIlikeAny(columns: readonly string[], raw: string, options: { maxLength?: number } = {}): string | null {
  const value = orFilterTerm(raw, options);
  if (!value || columns.length === 0) return null;
  return columns.map((c) => `${c}.ilike.${value}`).join(",");
}
