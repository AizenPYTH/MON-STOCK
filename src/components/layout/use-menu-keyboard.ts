import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { moveIndex, triggerOpenTarget, typeaheadIndex } from "@/components/layout/keyboard-nav";

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/**
 * W-25 : motif WAI-ARIA « menu button » pour les menus de la coquille (organisation, Ajouter,
 * Alertes), sans rien changer à leur apparence :
 * - à l'ouverture (clic, ↵, Espace, ↓, raccourci N…), le focus va sur le premier élément (↑ : le dernier) ;
 * - ↑ ↓ Début Fin et première lettre déplacent le focus entre les éléments (`role="menuitem"`) ;
 * - Échap referme et rend le focus au bouton ; Tab referme (le focus suit l'ordre de la page) ;
 * - un clic à l'extérieur referme sans déplacer le focus.
 * La logique de déplacement est pure (`keyboard-nav.ts`, testée).
 */
export function useMenuKeyboard(open: boolean, setOpen: (v: boolean) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = useRef<"first" | "last">("first");
  const menuId = useId();

  const items = useCallback(() => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []), []);

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  // Focus initial à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const list = items();
    (initial.current === "last" ? list[list.length - 1] : list[0])?.focus();
    initial.current = "first";
  }, [open, items]);

  // Clic extérieur ; Échap reçu hors du menu (focus resté ailleurs).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, close]);

  const onTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      const target = triggerOpenTarget(e.key);
      if (!target) return;
      e.preventDefault();
      initial.current = target;
      if (open) {
        const list = items();
        (target === "last" ? list[list.length - 1] : list[0])?.focus();
        initial.current = "first";
      } else setOpen(true);
    },
    [open, items, setOpen],
  );

  const onMenuKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const list = items();
      const current = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        // Ne remonte pas jusqu'aux écouteurs globaux (tiroir mobile) : seul le menu se referme.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      }
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      const next = moveIndex(current, list.length, e.key) ?? (e.ctrlKey || e.metaKey || e.altKey ? null : typeaheadIndex(list.map((el) => el.textContent ?? ""), current, e.key));
      if (next === null) return;
      e.preventDefault();
      list[next]?.focus();
    },
    [items, close, setOpen],
  );

  return {
    rootRef,
    triggerProps: { ref: triggerRef, onKeyDown: onTriggerKeyDown, "aria-controls": open ? menuId : undefined },
    menuProps: { ref: menuRef, id: menuId, onKeyDown: onMenuKeyDown },
  };
}
