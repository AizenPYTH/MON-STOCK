/**
 * Catalogue de « Mes outils » : chaque outil est une entrée indépendante (route propre). Ajouter
 * un outil = ajouter une entrée ici et un écran sous `app/(app)/tools/` — la navigation ne change
 * pas. Un outil « à venir » est affiché comme tel et n'est jamais ouvrable.
 */

export type ToolCategory = "pricing" | "tax_currency" | "shipping" | "sourcing";

export const TOOL_CATEGORY_LABEL: Record<ToolCategory, string> = {
  pricing: "Prix et marges",
  tax_currency: "TVA et devises",
  shipping: "Expédition",
  sourcing: "Achats",
};

export type ToolAvailability = "available" | "soon";

/** Icônes de la bibliothèque lucide (nom résolu par l'application). */
export type ToolIcon = "percent" | "calculator" | "tag" | "receipt" | "truck" | "coins" | "badge-percent" | "scale" | "package-search" | "trending-up";

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  icon: ToolIcon;
  category: ToolCategory;
  availability: ToolAvailability;
  /** route de l'écran (outils disponibles) */
  route: string | null;
  /** le résultat dépend d'un service serveur (sinon calcul local et instantané) */
  usesServer: boolean;
}

export const TOOLS: ToolDefinition[] = [
  { id: "vat", title: "Calculateur de TVA", description: "HT → TTC, TTC → HT ou TVA seule, taux au choix.", icon: "percent", category: "tax_currency", availability: "available", route: "/tools/vat", usesServer: false },
  { id: "margin", title: "Calculateur de marge", description: "Prix d'achat, prix de vente et frais → bénéfice et taux de marge.", icon: "calculator", category: "pricing", availability: "available", route: "/tools/margin", usesServer: false },
  { id: "selling-price", title: "Calculateur de prix de vente", description: "Coût, frais et marge souhaitée → prix de vente nécessaire.", icon: "tag", category: "pricing", availability: "available", route: "/tools/selling-price", usesServer: false },
  { id: "ebay-fees", title: "Calculateur de frais eBay", description: "Ce qu'il reste réellement après commissions et frais de vente.", icon: "receipt", category: "pricing", availability: "available", route: "/tools/ebay-fees", usesServer: false },
  { id: "discount", title: "Calculateur de remise", description: "Prix remisé, pourcentage de remise ou prix initial.", icon: "badge-percent", category: "pricing", availability: "available", route: "/tools/discount", usesServer: false },
  { id: "currency", title: "Convertisseur de devises", description: "Taux BCE datés et frais bancaires séparés.", icon: "coins", category: "tax_currency", availability: "available", route: "/tools/currency", usesServer: true },
  { id: "shipping", title: "Comparateur de frais de port", description: "Transporteurs classés par prix ou rapidité selon le colis.", icon: "truck", category: "shipping", availability: "available", route: "/tools/shipping", usesServer: true },
  { id: "tracking", title: "Suivi de colis", description: "Statut, étapes et livraison estimée de vos envois.", icon: "package-search", category: "shipping", availability: "available", route: "/tools/tracking", usesServer: true },
  { id: "supplier-prices", title: "Comparateur de prix fournisseurs", description: "Offres réelles de vos fournisseurs pour un même produit (radar).", icon: "scale", category: "sourcing", availability: "available", route: "/radar", usesServer: true },
  { id: "purchase-profitability", title: "Rentabilité d'un lot", description: "Coût d'un lot réparti par article et revente estimée.", icon: "trending-up", category: "sourcing", availability: "soon", route: null, usesServer: false },
];

export function toolsByCategory(tools: ToolDefinition[] = TOOLS): { category: ToolCategory; label: string; tools: ToolDefinition[] }[] {
  const order: ToolCategory[] = ["pricing", "tax_currency", "shipping", "sourcing"];
  return order.map((category) => ({ category, label: TOOL_CATEGORY_LABEL[category], tools: tools.filter((t) => t.category === category) })).filter((g) => g.tools.length > 0);
}

export function findTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}
