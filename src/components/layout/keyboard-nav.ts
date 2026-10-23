/**
 * W-25 : logique PURE de navigation au clavier de la coquille (testée sans navigateur).
 * - menus (motif WAI-ARIA « menu button ») : ↑ ↓ (en boucle), Début / Fin, saisie de la première
 *   lettre ; Échap referme et rend le focus au bouton ; Tab referme ;
 * - palette ⌘K (motif « combobox » + « listbox ») : ↑ ↓ déplacent l'option active (sans boucle),
 *   ↵ ouvre l'option, Échap referme ; le focus reste dans le champ (`aria-activedescendant`).
 */

/** Index suivant pour une touche de déplacement, ou null si la touche n'en est pas une. `current` = -1 : aucun élément actif. */
export function moveIndex(current: number, count: number, key: string, options: { wrap?: boolean; homeEnd?: boolean } = {}): number | null {
  const wrap = options.wrap ?? true;
  const homeEnd = options.homeEnd ?? true;
  if (count <= 0) return null;
  const last = count - 1;
  switch (key) {
    case "ArrowDown":
      if (current < 0) return 0;
      if (current >= last) return wrap ? 0 : last;
      return current + 1;
    case "ArrowUp":
      if (current < 0) return last;
      if (current <= 0) return wrap ? last : 0;
      return current - 1;
    case "Home":
      return homeEnd ? 0 : null;
    case "End":
      return homeEnd ? last : null;
    default:
      return null;
  }
}

/** Touches qui ouvrent un menu depuis son bouton, et l'élément à activer : premier (↓) ou dernier (↑). */
export function triggerOpenTarget(key: string): "first" | "last" | null {
  if (key === "ArrowDown") return "first";
  if (key === "ArrowUp") return "last";
  return null;
}

const fold = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Saisie d'un caractère dans un menu : élément suivant (après `current`, en boucle) dont le libellé
 * commence par ce caractère (accents ignorés) ; null si aucun ou si ce n'est pas un caractère.
 */
export function typeaheadIndex(labels: readonly string[], current: number, key: string): number | null {
  if (key.length !== 1 || !/\S/.test(key)) return null;
  const k = fold(key);
  const n = labels.length;
  for (let step = 1; step <= n; step++) {
    const i = (((current < 0 ? -1 : current) + step) % n + n) % n;
    if (fold(labels[i] ?? "").startsWith(k)) return i;
  }
  return null;
}

export type PaletteKeyAction = { type: "move"; index: number } | { type: "open"; index: number } | { type: "close" } | null;

/** Touche reçue par le champ de la palette ⌘K. */
export function paletteKeyAction(key: string, index: number, count: number): PaletteKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key === "Enter") return count > 0 && index >= 0 && index < count ? { type: "open", index } : null;
  const next = moveIndex(index, count, key, { wrap: false, homeEnd: false });
  return next === null ? null : { type: "move", index: next };
}

/** Identifiant DOM stable d'une option de la palette (référencé par `aria-activedescendant`). */
export function paletteOptionId(listId: string, index: number): string {
  return `${listId}-opt-${index}`;
}
