/**
 * Affichage des offres fournisseurs (module PUR, partagé avec l'application mobile) :
 *  - catégorie d'un produit (appareils, écrans, batteries, pièces, protections, accessoires, lots)
 *    à partir du type détecté par l'analyse « bonne affaire » ;
 *  - titre en français : traduction par glossaire des termes courants (ES, EN, IT, CS, PL, DE, NL)
 *    — les noms de modèles, capacités et grades ne sont jamais modifiés ; le titre d'origine reste
 *    disponible ;
 *  - nom de fournisseur court (sans précision entre parenthèses ni sous-titre).
 */
import { detectKind, type ProductKind } from "@/domain/sourcing/deal-analysis";

export type OfferCategory = "devices" | "screens" | "batteries" | "parts" | "protection" | "accessories" | "lots";

export const OFFER_CATEGORY_LABEL: Record<OfferCategory, string> = {
  devices: "Appareils",
  screens: "Écrans",
  batteries: "Batteries",
  parts: "Pièces",
  protection: "Protections",
  accessories: "Accessoires",
  lots: "Lots",
};

/** Ordre d'affichage des catégories. */
export const OFFER_CATEGORIES: OfferCategory[] = ["devices", "screens", "batteries", "parts", "protection", "accessories", "lots"];

const KIND_CATEGORY: Record<ProductKind, OfferCategory> = {
  device: "devices",
  screen: "screens",
  battery: "batteries",
  back_glass: "parts",
  frame: "parts",
  camera: "parts",
  speaker: "parts",
  charging_port: "parts",
  flex: "parts",
  button: "parts",
  adhesive: "parts",
  sim_tray: "parts",
  board: "parts",
  keyboard: "parts",
  other_part: "parts",
  screen_protector: "protection",
  case: "protection",
  charger_cable: "accessories",
  tool: "accessories",
  lot: "lots",
};

export function categoryOf(title: string): OfferCategory {
  return KIND_CATEGORY[detectKind(title)];
}

/** La recherche vise-t-elle un appareil (et non une pièce ou un accessoire) ? */
export function queryTargetsDevice(query: string): boolean {
  return detectKind(query) === "device";
}

/**
 * Glossaire : expressions les plus longues d'abord. Seuls des termes génériques de pièces,
 * d'état et de couleurs sont traduits ; marques et modèles restent intacts.
 */
const GLOSSARY: Array<[string, string]> = [
  // protections
  ["protector de cristal templado", "verre trempé"],
  ["protector de pantalla", "protection d'écran"],
  ["cristal templado", "verre trempé"],
  ["tempered glass screen protector", "verre trempé"],
  ["tempered glass", "verre trempé"],
  ["screen protector", "protection d'écran"],
  ["vetro temperato", "verre trempé"],
  ["ochranné sklo", "verre trempé"],
  ["tvrzené sklo", "verre trempé"],
  ["szkło hartowane", "verre trempé"],
  ["panzerglas", "verre trempé"],
  ["privacy glass", "verre trempé anti-espion"],
  ["funda", "étui"],
  ["custodia", "coque"],
  ["pouzdro", "étui"],
  ["hoesje", "coque"],
  // pièces
  ["tapa trasera", "vitre arrière"],
  ["back glass", "vitre arrière"],
  ["rear glass", "vitre arrière"],
  ["back cover", "vitre arrière"],
  ["battery cover", "cache batterie"],
  ["pantalla completa", "écran complet"],
  ["pantalla", "écran"],
  ["schermo", "écran"],
  ["displej", "écran"],
  ["wyświetlacz", "écran"],
  ["display", "écran"],
  ["screen", "écran"],
  ["lepení pod baterii", "adhésif de batterie"],
  ["battery adhesive", "adhésif de batterie"],
  ["bateria", "batterie"],
  ["batería", "batterie"],
  ["batteria", "batterie"],
  ["baterie", "batterie"],
  ["battery", "batterie"],
  ["akku", "batterie"],
  ["conector de carga", "connecteur de charge"],
  ["charging port", "connecteur de charge"],
  ["flex de carga", "nappe de charge"],
  ["charging flex", "nappe de charge"],
  ["cámara trasera", "caméra arrière"],
  ["camara trasera", "caméra arrière"],
  ["rear camera", "caméra arrière"],
  ["back camera", "caméra arrière"],
  ["cámara frontal", "caméra avant"],
  ["camara frontal", "caméra avant"],
  ["front camera", "caméra avant"],
  ["cámara", "caméra"],
  ["camara", "caméra"],
  ["fotocamera", "caméra"],
  ["camera", "caméra"],
  ["lente de cámara", "lentille de caméra"],
  ["camera lens", "lentille de caméra"],
  ["altavoz", "haut-parleur"],
  ["loudspeaker", "haut-parleur"],
  ["speaker", "haut-parleur"],
  ["auricular", "écouteur interne"],
  ["earpiece", "écouteur interne"],
  ["carcasa", "châssis"],
  ["housing", "châssis"],
  ["middle frame", "châssis"],
  ["marco", "châssis"],
  ["frame", "châssis"],
  ["bandeja sim", "tiroir SIM"],
  ["sim tray", "tiroir SIM"],
  ["botón", "bouton"],
  ["boton", "bouton"],
  ["button", "bouton"],
  ["adhesivo", "adhésif"],
  ["adhesive", "adhésif"],
  ["placa base", "carte mère"],
  ["motherboard", "carte mère"],
  ["cargador", "chargeur"],
  ["charger", "chargeur"],
  ["cable", "câble"],
  ["herramienta", "outil"],
  ["destornillador", "tournevis"],
  ["screwdriver", "tournevis"],
  ["lote", "lot"],
  // état
  ["reacondicionado", "reconditionné"],
  ["refurbished", "reconditionné"],
  ["ricondizionato", "reconditionné"],
  ["usado", "occasion"],
  ["used", "occasion"],
  ["nuevo", "neuf"],
  ["brand new", "neuf"],
  ["replacement", "de remplacement"],
  ["compatible with", "compatible avec"],
  ["completo", "complet"],
  ["completa", "complète"],
  ["complete", "complet"],
  ["con marco", "avec châssis"],
  ["with frame", "avec châssis"],
  ["sin marco", "sans châssis"],
  ["without frame", "sans châssis"],
  ["mixed", "mixte"],
  // couleurs
  ["space gray", "gris sidéral"],
  ["space grey", "gris sidéral"],
  ["gris espacial", "gris sidéral"],
  ["starlight", "lumière stellaire"],
  ["midnight", "minuit"],
  ["negro", "noir"],
  ["black", "noir"],
  ["nero", "noir"],
  ["blanco", "blanc"],
  ["white", "blanc"],
  ["bianco", "blanc"],
  ["azul", "bleu"],
  ["blue", "bleu"],
  ["rojo", "rouge"],
  ["red", "rouge"],
  ["verde", "vert"],
  ["green", "vert"],
  ["dorado", "or"],
  ["gold", "or"],
  ["plata", "argent"],
  ["silver", "argent"],
  ["morado", "violet"],
  ["purple", "violet"],
  ["rosa", "rose"],
  ["pink", "rose"],
  ["amarillo", "jaune"],
  ["yellow", "jaune"],
  ["gray", "gris"],
  ["grey", "gris"],
  // liaisons
  ["para", "pour"],
  ["with", "avec"],
  ["without", "sans"],
  ["for", "pour"],
  ["con", "avec"],
  ["sin", "sans"],
];

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9";
const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULES = [...GLOSSARY]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, to]) => ({ re: new RegExp(`(^|[^${LETTER}])${escapeRe(from)}(?=$|[^${LETTER}])`, "gi"), to }));

const BRAND_CASE: Array<[RegExp, string]> = [
  [/\biphone\b/gi, "iPhone"],
  [/\bipad\b/gi, "iPad"],
  [/\bairpods\b/gi, "AirPods"],
  [/\bmacbook\b/gi, "MacBook"],
  [/\bimac\b/gi, "iMac"],
  [/\bpro max\b/gi, "Pro Max"],
];

/** Titre en français (glossaire) ; identique au titre d'origine s'il n'y a rien à traduire. */
export function frenchTitle(title: string): string {
  let t = title;
  for (const { re, to } of RULES) t = t.replace(re, (_m, pre: string) => `${pre}${to}`);
  for (const [re, to] of BRAND_CASE) t = t.replace(re, to);
  t = t.replace(/\s{2,}/g, " ").trim();
  // majuscule initiale, sauf marques qui commencent par une minuscule (iPhone, iPad, iMac)
  return /^i(Phone|Pad|Mac)/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1);
}

/** Nom de fournisseur court : « Repuestosmovil (ES) — pièces » → « Repuestosmovil ». */
export function shortSupplierName(name: string): string {
  const s = name.split(/\s+[—–-]\s+/)[0]!.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return s || name;
}
