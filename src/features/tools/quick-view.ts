import { formatDec, type Dec } from "@/domain/tools/decimal";
import { readEntry, toEntry, type QuickResult } from "@/domain/tools/quick-calc";

/**
 * Logique d'affichage des calculateurs « version simple » (module pur) : mêmes règles que
 * l'écran calculatrice de l'application. La chaîne saisie reste la source du calcul ; en mode
 * bidirectionnel seule la case active est lue, les autres affichent la valeur calculée.
 */

export interface CalcField {
  key: string;
  label: string;
  unit?: string;
  /** case résultat (non saisissable) */
  result?: boolean;
}

export interface QuickState {
  active: string;
  entries: Record<string, string>;
}

export interface QuickView {
  /** valeur par case (null = « — ») */
  valueOf: (key: string) => Dec | null;
  out: QuickResult;
  /** au moins un résultat affichable (bouton « Copier ») */
  anyResult: boolean;
}

export function evaluateQuick(fields: CalcField[], state: QuickState, bidir: boolean, compute: (values: Record<string, Dec | null>, active: string) => QuickResult): QuickView {
  const inputs = fields.filter((f) => !f.result);
  const read: Record<string, Dec | null> = {};
  for (const f of inputs) read[f.key] = bidir ? (f.key === state.active ? readEntry(state.entries[f.key]) : null) : readEntry(state.entries[f.key]);
  const out = compute(read, state.active);
  const valueOf = (key: string): Dec | null => (key in out.values ? (out.values[key] ?? null) : (read[key] ?? null));
  const anyResult = fields.some((f) => (f.result || bidir) && valueOf(f.key) !== null) && !(bidir && read[state.active] === null);
  return { valueOf, out, anyResult };
}

/** Toucher une autre case : en bidirectionnel, elle reprend la valeur calculée comme saisie. */
export function focusField(state: QuickState, key: string, bidir: boolean, view: QuickView): QuickState {
  if (key === state.active) return state;
  return { active: key, entries: bidir ? { [key]: toEntry(view.valueOf(key)) } : state.entries };
}

export const fmtQuick = (v: Dec | null) => (v ? formatDec(v) : "—");

/** Texte copié (mêmes lignes que l'application, mention « estimation »). */
export function quickCopyText(title: string, fields: CalcField[], view: QuickView): string {
  const lines = fields.map((f) => `${f.label} : ${fmtQuick(view.valueOf(f.key))}${f.unit ? ` ${f.unit}` : ""}${f.result && view.out.sub ? ` (${view.out.sub})` : ""}`);
  return `${title}\n${lines.join("\n")}\n(estimation)`;
}
