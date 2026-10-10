/** États d'objet de la Sell Inventory API (ConditionEnum) — module pur, partagé avec le mobile. */
export const EBAY_CONDITIONS = [
  "NEW",
  "LIKE_NEW",
  "NEW_OTHER",
  "NEW_WITH_DEFECTS",
  "CERTIFIED_REFURBISHED",
  "EXCELLENT_REFURBISHED",
  "VERY_GOOD_REFURBISHED",
  "GOOD_REFURBISHED",
  "SELLER_REFURBISHED",
  "USED_EXCELLENT",
  "USED_VERY_GOOD",
  "USED_GOOD",
  "USED_ACCEPTABLE",
  "FOR_PARTS_OR_NOT_WORKING",
 ] as const;

export type EbayCondition = (typeof EBAY_CONDITIONS)[number];

export const EBAY_CONDITION_LABEL: Record<EbayCondition, string> = {
  NEW: "Neuf",
  LIKE_NEW: "Comme neuf",
  NEW_OTHER: "Neuf autre (sans emballage d'origine)",
  NEW_WITH_DEFECTS: "Neuf avec défauts",
  CERTIFIED_REFURBISHED: "Reconditionné certifié (agrément eBay)",
  EXCELLENT_REFURBISHED: "Reconditionné — excellent état (programme eBay)",
  VERY_GOOD_REFURBISHED: "Reconditionné — très bon état (programme eBay)",
  GOOD_REFURBISHED: "Reconditionné — bon état (programme eBay)",
  SELLER_REFURBISHED: "Reconditionné par le vendeur",
  USED_EXCELLENT: "Occasion — excellent état",
  USED_VERY_GOOD: "Occasion — très bon état",
  USED_GOOD: "Occasion — bon état",
  USED_ACCEPTABLE: "Occasion — état correct",
  FOR_PARTS_OR_NOT_WORKING: "Pour pièces / ne fonctionne pas",
};

