/**
 * TYPE DE PRODUIT d'une offre (module pur, partagé) : appareil, pièce (écran, batterie, vitre
 * arrière…), accessoire ou lot. Utilisé par l'analyse « bonne affaire » (équivalence stricte) et
 * par le rattachement automatique offre → SKU (une pièce ne doit jamais hériter du SKU de
 * l'appareil dont elle cite le modèle).
 *
 * Règles (audit S-13) :
 *   - mots-clés multilingues testés en début de mot, premier groupe qui correspond ;
 *   - « 8GB RAM » est une caractéristique d'appareil, pas un châssis (« rama/ramka » en polonais) ;
 *   - « bundle » / « caja » (boîte) ne font pas d'un téléphone un lot ;
 *   - une capacité (128 Go…) citée AVANT le mot de pièce désigne un appareil (« iPhone 13 128 Go +
 *     coque ») ; une pièce nommée d'abord reste une pièce (« Coque iPhone 13 128 Go ») ;
 *   - « vitre arrière fissurée », « écran cassé » décrivent l'état d'un APPAREIL abîmé, pas une pièce.
 */
import { normalizeText } from "@/domain/sourcing/normalizer";

export type ProductKind =
  | "device"
  | "screen"
  | "battery"
  | "back_glass"
  | "frame"
  | "camera"
  | "speaker"
  | "charging_port"
  | "flex"
  | "button"
  | "adhesive"
  | "screen_protector"
  | "case"
  | "charger_cable"
  | "tool"
  | "sim_tray"
  | "board"
  | "keyboard"
  | "lot"
  | "other_part";

/** Mots-clés par type (FR, EN, ES, IT, PL, CS, NL, DE), testés en début de mot sur le titre normalisé. */
export const KIND_WORDS: Array<{ kind: ProductKind; words: string[] }> = [
  { kind: "lot", words: ["lot de", "lote", "lotes", "palette", "paleta", "palety", "pallet", "job lot", "joblot", "stock lot", "mix lot", "retourenpalette", "retouren paletten"] },
  { kind: "screen_protector", words: ["verre trempe", "tempered glass", "protection ecran", "protector de pantalla", "protector pantalla", "screen protector", "ochranne sklo", "tvrzene sklo", "pellicola", "panzerglas", "privacy glass", "privacy tempered", "cristal templado", "protector de cristal", "vetro temperato", "folie"] },
  { kind: "back_glass", words: ["vitre arriere", "back glass", "rear glass", "back cover", "coque arriere", "tapa trasera", "scocca posteriore", "zadni kryt", "klapka", "achterkant", "backcover", "battery cover", "rear housing"] },
  { kind: "screen", words: ["ecran", "display", "lcd", "oled", "pantalla", "schermo", "wyswietlacz", "displej", "scherm", "bildschirm", "digitizer", "touch screen", "vitre tactile", "vitre simple", "front glass"] },
  { kind: "battery", words: ["batterie", "battery", "bateria", "batteria", "baterie", "akku", "accu", "bateri"] },
  { kind: "frame", words: ["chassis", "frame", "marco", "telaio", "ramka", "rama ", "carcasa", "middle frame", "housing", "behuizing", "topcase", "top case", "bottom case"] },
  { kind: "camera", words: ["camera", "camara", "fotocamera", "kamera", "objectif", "lens", "lentille"] },
  { kind: "speaker", words: ["haut parleur", "haut-parleur", "speaker", "altavoz", "altoparlante", "reproduktor", "buzzer", "glosnik", "luidspreker", "ecouteur interne", "earpiece"] },
  { kind: "charging_port", words: ["connecteur de charge", "port de charge", "charging port", "conector de carga", "dock", "gniazdo", "konektor", "laadpoort", "lightning port"] },
  { kind: "flex", words: ["nappe", "flex", "cable flex", "kabel", "nastro"] },
  { kind: "button", words: ["bouton", "button", "boton", "tasto", "tlacitko", "power button", "volume button"] },
  { kind: "adhesive", words: ["adhesif", "adhesive", "adhesivo", "pegatina", "lepeni", "joint", "sticker", "colle"] },
  { kind: "case", words: ["coque", "etui", "funda", "custodia", "pouzdro", "hoesje", "case "] },
  { kind: "charger_cable", words: ["chargeur", "charger", "cargador", "caricabatterie", "nabijecka", "ladegerat", "cable usb", "cable lightning", "cable usb-c", "adaptateur secteur", "power adapter", "usb-c to", "usb-a to"] },
  { kind: "tool", words: ["tournevis", "screwdriver", "outil", "tool", "tweezer", "pince", "spudger", "destornillador", "kit d'outils", "toolkit", "ventouse"] },
  { kind: "sim_tray", words: ["rack sim", "tiroir sim", "tiroir carte sim", "sim tray", "bandeja sim", "slot sim", "porta sim", "suplik na sim", "suplik sim", "sim card tray", "tiroir nano sim"] },
  { kind: "other_part", words: ["blindaje", "shield", "blindage", "plaque metal", "vis ", "screws", "tornillos", "joint etancheite", "mesh", "grille", "nfc", "antena", "antenna", "antenne", "vibreur", "vibrator", "motor vibr", "taptic", "face id", "touch id", "capteur", "sensor", "micro ", "microphone", "microfono", "ic chip", "puce"] },
  { kind: "board", words: ["carte mere", "motherboard", "logic board", "placa base", "scheda madre", "carte fille", "daughter board", "moederbord"] },
  { kind: "keyboard", words: ["clavier", "keyboard", "teclado", "tastiera", "klavesnice", "toetsenbord", "trackpad"] },
];

export const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** une expression par groupe de mots (compilée une fois) : mot cherché en début de mot */
export const wordsRegex = (words: string[]) => new RegExp(`(^|[^a-z0-9])(${words.map((w) => escapeRe(normalizeText(w) + (/\s$/.test(w) ? " " : ""))).join("|")})`);
const KIND_RES = KIND_WORDS.map(({ kind, words }) => ({ kind, re: wordsRegex(words) }));

/** pièces qui peuvent porter une capacité sans être un appareil */
const PART_WITH_STORAGE = new Set<ProductKind>(["board"]);

/** « (100% battery) », « batterie 90 % » : état de batterie d'un appareil, pas une batterie. */
const BATTERY_HEALTH_RE = /\d{2,3}\s?%?\s?(battery|batterie|bateria|batteria|baterie|akku)( health| sante)?|(battery|batterie|bateria|batteria|baterie|akku)( health| sante)?\s?\d{2,3}(?![0-9])(?!\s?mah)\s?%?/g;
/** « 8GB RAM », « RAM 8 Go », « 12 GB de RAM » : mémoire vive d'un appareil. */
const RAM_SPEC_RE = /\d{1,2}\s?(gb|go|g)\s?(de\s)?ram(?![a-z0-9])|(?:^|[^a-z0-9])ram\s?\d{1,2}\s?(gb|go|g)(?![a-z0-9])/g;
/** capacité de stockage d'un appareil */
const CAPACITY_RE = /(^|[^a-z0-9])\d{2,4}\s?(gb|go|tb|to)(?![a-z0-9])/;
/** pièce citée comme ÉTAT de l'appareil : « vitre arrière fissurée », « cracked screen »… */
const DAMAGED_PART_RE =
  /(^|[^a-z0-9])((vitre arriere|vitre|ecran|back glass|rear glass|screen|display|pantalla|schermo|cristal trasero|tapa trasera)\s(fissure|fissuree|fele|felee|casse|cassee|raye|rayee|cracked|broken|smashed|rota|roto|rotto|rotta|incrinato|incrinata|rajada|agrietada)|(cracked|broken|smashed)\s(back glass|rear glass|screen|display|back))(?![a-z0-9])/;

/** Texte normalisé (espaces de garde) sans les mentions d'état de batterie ni de mémoire vive. */
export function prepareKindText(title: string): string {
  return ` ${normalizeText(title).replace(BATTERY_HEALTH_RE, " ").replace(RAM_SPEC_RE, " ")} `;
}

/**
 * Type d'après un texte déjà préparé (`prepareKindText`). `storage` : capacité déjà extraite (sinon
 * cherchée dans le texte) ; une capacité ne qualifie qu'un appareil ou une carte mère.
 */
export function kindOfText(t: string, storage?: string | null): ProductKind {
  let kind: ProductKind = "device";
  let kwIndex = -1;
  for (const { kind: k, re } of KIND_RES) {
    const m = re.exec(t);
    if (m) {
      kind = k;
      kwIndex = m.index;
      break;
    }
  }
  if (kind === "device" || kind === "lot" || PART_WITH_STORAGE.has(kind)) return kind;
  // « Apple iPhone 14 Pro 128 Go — vitre arrière fissurée » : appareil abîmé, pas une pièce
  if ((kind === "back_glass" || kind === "screen") && DAMAGED_PART_RE.test(t)) return "device";
  // Capacité : « iPhone 13 128 Go + coque » (capacité AVANT le mot de pièce) est un appareil ;
  // « Coque iPhone 13 128 Go » (pièce nommée d'abord) reste un accessoire (I-18).
  const cap = CAPACITY_RE.exec(t);
  if (cap) return cap.index < kwIndex ? "device" : kind;
  // capacité connue par ailleurs (colonne du fichier) : appareil, sauf titre qui commence par la pièce
  if (storage && kwIndex > 1) return "device";
  return kind;
}

export function detectKind(title: string, storage?: string | null): ProductKind {
  return kindOfText(prepareKindText(title), storage);
}

/**
 * Une offre de ce type peut-elle hériter automatiquement du SKU d'un produit normalisé (marque,
 * modèle, capacité) ? Uniquement un APPAREIL : une pièce, un accessoire ou un lot citant
 * « iPhone 13 128 Go » ne doit jamais être rattaché au SKU du téléphone (I-18).
 */
export function kindAllowsSkuInheritance(kind: ProductKind): boolean {
  return kind === "device";
}

/** Suffixe de clé normalisée : vide pour un appareil (clés existantes inchangées), sinon le type. */
export function kindKeySuffix(kind: ProductKind): string {
  return kind === "device" ? "" : `|kind:${kind}`;
}
