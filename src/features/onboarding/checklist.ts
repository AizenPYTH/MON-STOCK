/**
 * Entrée du tableau de bord (handoff v2 §D « Tableau de bord ») : checklist des premiers pas.
 * Organisation ✓ (on est sur le tableau de bord d'une organisation), eBay, import, premier produit.
 * Chaque état vient d'une lecture réelle ; une lecture en échec donne « unknown » (affiché « — »,
 * jamais coché ni décoché par supposition).
 */
export type ChecklistState = "done" | "todo" | "unknown";

export interface ChecklistItem {
  key: "organization" | "ebay" | "import" | "product";
  state: ChecklistState;
  title: string;
  detail: string;
  href: string | null;
  cta: string | null;
}

export interface FirstStepsFacts {
  organizationName: string;
  /** Connexion eBay au statut « connecté » ; null si la lecture a échoué. */
  ebayConnected: boolean | null;
  /** Au moins un import de catalogue terminé (complet ou partiel) ; null si inconnu. */
  catalogImported: boolean | null;
  /** Au moins une référence (SKU) en stock. */
  hasProducts: boolean;
}

function st(v: boolean | null): ChecklistState {
  return v === null ? "unknown" : v ? "done" : "todo";
}

export function firstStepsChecklist(f: FirstStepsFacts): ChecklistItem[] {
  return [
    { key: "organization", state: "done", title: "Organisation créée", detail: f.organizationName, href: null, cta: null },
    { key: "ebay", state: st(f.ebayConnected), title: "Connecter eBay", detail: "Annonces et commandes reliées au stock central", href: "/onboarding/plateforme", cta: "Connecter" },
    { key: "import", state: st(f.catalogImported), title: "Importer un catalogue fournisseur", detail: "Fichier CSV, XLSX, XML ou JSON : prix et quantités comparés", href: "/sourcing/imports/new", cta: "Importer" },
    { key: "product", state: f.hasProducts ? "done" : "todo", title: "Ajouter votre premier produit", detail: "Un produit, ses variantes, un SKU : une barre du code-barres", href: "/stock/new", cta: "Ajouter" },
  ];
}

/** Avancement : seules les étapes connues comptent (une étape inconnue n'est ni faite ni à faire). */
export function checklistProgress(items: readonly ChecklistItem[]): { done: number; known: number } {
  const known = items.filter((i) => i.state !== "unknown");
  return { done: known.filter((i) => i.state === "done").length, known: known.length };
}
