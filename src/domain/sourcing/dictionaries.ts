/**
 * Dictionnaires du ProductNormalizer : marques, modèles, couleurs, grades, états.
 * Extensibles : ajouter une entrée suffit, aucune logique n'est codée en dur ailleurs.
 * Toutes les clés sont en minuscules sans accent (voir normalizeText).
 */

export interface BrandEntry {
  key: string;
  display: string;
  aliases: string[];
}

export const BRANDS: BrandEntry[] = [
  { key: "apple", display: "Apple", aliases: ["apple"] },
  { key: "samsung", display: "Samsung", aliases: ["samsung"] },
  { key: "google", display: "Google", aliases: ["google"] },
  { key: "xiaomi", display: "Xiaomi", aliases: ["xiaomi", "mi"] },
  { key: "huawei", display: "Huawei", aliases: ["huawei"] },
  { key: "honor", display: "Honor", aliases: ["honor"] },
  { key: "oneplus", display: "OnePlus", aliases: ["oneplus", "one plus"] },
  { key: "oppo", display: "Oppo", aliases: ["oppo"] },
  { key: "realme", display: "Realme", aliases: ["realme"] },
  { key: "sony", display: "Sony", aliases: ["sony"] },
  { key: "nintendo", display: "Nintendo", aliases: ["nintendo"] },
  { key: "microsoft", display: "Microsoft", aliases: ["microsoft"] },
  { key: "dyson", display: "Dyson", aliases: ["dyson"] },
  { key: "lenovo", display: "Lenovo", aliases: ["lenovo"] },
  { key: "dell", display: "Dell", aliases: ["dell"] },
  { key: "hp", display: "HP", aliases: ["hp", "hewlett packard"] },
  { key: "asus", display: "Asus", aliases: ["asus"] },
  { key: "acer", display: "Acer", aliases: ["acer"] },
  { key: "motorola", display: "Motorola", aliases: ["motorola", "moto"] },
  { key: "nokia", display: "Nokia", aliases: ["nokia"] },
  { key: "jbl", display: "JBL", aliases: ["jbl"] },
  { key: "bose", display: "Bose", aliases: ["bose"] },
  { key: "garmin", display: "Garmin", aliases: ["garmin"] },
  { key: "gopro", display: "GoPro", aliases: ["gopro", "go pro"] },
  { key: "dji", display: "DJI", aliases: ["dji"] },
  { key: "logitech", display: "Logitech", aliases: ["logitech"] },
  { key: "philips", display: "Philips", aliases: ["philips"] },
  { key: "bosch", display: "Bosch", aliases: ["bosch"] },
  { key: "lg", display: "LG", aliases: ["lg"] },
];

/**
 * Motif de modèle : appliqué sur le texte normalisé. `build` reçoit les groupes
 * capturés et retourne le modèle canonique (minuscule) et son affichage.
 */
export interface ModelPattern {
  brand: string;
  regex: RegExp;
  build: (m: RegExpMatchArray) => { model: string; display: string } | null;
}

function variantWord(v: string | undefined): string {
  if (!v) return "";
  const x = v.replace(/\s+/g, " ").trim();
  if (x === "promax" || x === "pro max") return "pro max";
  if (x === "+" || x === "plus") return "plus";
  return x;
}

function cap(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

export const MODEL_PATTERNS: ModelPattern[] = [
  // ---- Apple ----
  {
    brand: "apple",
    regex: /\biphone\s?(xs\s?max|xs|xr|x)\b/,
    build: (m) => {
      const v = (m[1] ?? "").replace(/\s+/g, " ");
      return { model: `iphone ${v}`, display: `iPhone ${v.toUpperCase()}` };
    },
  },
  {
    brand: "apple",
    regex: /\biphone\s?se\b\s?(?:\(?\s?(20(?:16|20|22))\s?\)?|(2|3)(?:nd|rd|e|eme|ème)?(?:\s?gen(?:eration)?)?)?/,
    build: (m) => {
      const year = m[1] ?? (m[2] === "2" ? "2020" : m[2] === "3" ? "2022" : undefined);
      return { model: year ? `iphone se ${year}` : "iphone se", display: year ? `iPhone SE (${year})` : "iPhone SE" };
    },
  },
  {
    brand: "apple",
    regex: /\biphone\s?(\d{1,2})\s?(pro\s?max|promax|pro|plus|mini|max)?\b/,
    build: (m) => {
      const n = Number(m[1]);
      if (n < 3 || n > 30) return null;
      const v = variantWord(m[2]);
      return { model: `iphone ${n}${v ? ` ${v}` : ""}`, display: `iPhone ${n}${v ? ` ${cap(v)}` : ""}` };
    },
  },
  {
    brand: "apple",
    // taille (décimale, ou 11 / 12 / 13 pouces), génération (1–10, « 9e gén. », « 9th generation »), année.
    // Chaque nombre est borné (?![a-z0-9]) : « iPad Air 2022 » ne donne jamais « ipad air 20 ».
    regex: /\bipad\s?(pro|air|mini)?(?:\s?(\d{1,2}[.,]\d|1[1-3])(?![a-z0-9])(?:\s?(?:pouces?|inch))?)?(?:\s?(\d{1,2})(?:\s?(?:e|eme|th|nd|rd|st))?(?:\s?gen(?:eration)?)?(?![a-z0-9]))?(?:\s?(20[12]\d)(?![a-z0-9]))?/,
    build: (m) => {
      const v = m[1] ?? "";
      const size = m[2]?.replace(",", ".") ?? "";
      const gen = m[3] && Number(m[3]) >= 1 && Number(m[3]) <= 10 ? String(Number(m[3])) : "";
      if (m[3] && !gen) return null;
      const year = m[4] ?? "";
      const model = ["ipad", v, size, gen, year].filter(Boolean).join(" ");
      const display = ["iPad", v ? cap(v) : "", size ? `${size}"` : "", gen, year].filter(Boolean).join(" ");
      return { model, display };
    },
  },
  {
    brand: "apple",
    // puce Apple Silicon (M1–M4, Pro / Max / Ultra) conservée dans le modèle : « MacBook Air M2 » ≠ « MacBook Air M1 ».
    // L'année n'entre dans le modèle qu'en l'absence de puce (générations Intel).
    regex: /\bmacbook\s?(air|pro)?(?:\s?(1[3-6](?:[.,]\d)?)(?![a-z0-9])(?:\s?(?:pouces?|inch))?)?(?:\s?(m[1-4](?:\s?(?:pro|max|ultra))?)(?![a-z0-9]))?(?:\s?(20[012]\d)(?![a-z0-9]))?(?![a-z0-9])/,
    build: (m) => {
      const v = m[1] ?? "";
      const size = m[2]?.replace(",", ".") ?? "";
      const chip = m[3]?.replace(/\s+/g, " ") ?? "";
      const year = !chip && m[4] ? m[4] : "";
      return {
        model: ["macbook", v, size, chip, year].filter(Boolean).join(" "),
        display: ["MacBook", v ? cap(v) : "", size ? `${size}"` : "", chip ? chip.toUpperCase().replace(/ (PRO|MAX|ULTRA)$/, (x) => cap(x.toLowerCase())) : "", year].filter(Boolean).join(" "),
      };
    },
  },
  {
    brand: "apple",
    regex: /\bairpods\s?(pro|max)?\s?(\d)?\b/,
    build: (m) => {
      const v = m[1] ?? "";
      const gen = m[2] ?? "";
      return { model: ["airpods", v, gen].filter(Boolean).join(" "), display: ["AirPods", v ? cap(v) : "", gen].filter(Boolean).join(" ") };
    },
  },
  {
    brand: "apple",
    regex: /\b(?:apple\s?)?watch\s?(ultra|se|series)?\s?(\d{1,2})?\b/,
    build: (m) => {
      if (!m[1] && !m[2]) return null;
      const v = m[1] ?? "series";
      const n = m[2] ?? "";
      return { model: ["apple watch", v, n].filter(Boolean).join(" "), display: ["Apple Watch", cap(v), n].filter(Boolean).join(" ") };
    },
  },
  { brand: "apple", regex: /\bmac\s?mini\b/, build: () => ({ model: "mac mini", display: "Mac mini" }) },
  { brand: "apple", regex: /\bimac\b/, build: () => ({ model: "imac", display: "iMac" }) },
  // ---- Samsung ----
  {
    brand: "samsung",
    regex: /\bgalaxy\s?s(\d{2})\s?(ultra|plus|\+|fe|edge)?(?![a-z0-9])/,
    build: (m) => {
      const v = variantWord(m[2]);
      return { model: `galaxy s${m[1]}${v ? ` ${v}` : ""}`, display: `Galaxy S${m[1]}${v ? ` ${v === "fe" ? "FE" : cap(v)}` : ""}` };
    },
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?note\s?(\d{1,2})\s?(ultra|plus|\+)?(?![a-z0-9])/,
    build: (m) => {
      const v = variantWord(m[2]);
      return { model: `galaxy note ${m[1]}${v ? ` ${v}` : ""}`, display: `Galaxy Note ${m[1]}${v ? ` ${cap(v)}` : ""}` };
    },
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?z\s?(fold|flip)\s?(\d)?\b/,
    build: (m) => ({ model: ["galaxy z", m[1], m[2]].filter(Boolean).join(" "), display: ["Galaxy Z", cap(m[1] ?? ""), m[2]].filter(Boolean).join(" ") }),
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?tab\s?(s|a)\s?(\d{1,2})\s?(ultra|plus|\+|fe|lite)?(?![a-z0-9])/,
    build: (m) => {
      const v = variantWord(m[3]);
      return { model: `galaxy tab ${m[1]}${m[2]}${v ? ` ${v}` : ""}`, display: `Galaxy Tab ${(m[1] ?? "").toUpperCase()}${m[2]}${v ? ` ${v === "fe" ? "FE" : cap(v)}` : ""}` };
    },
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?a(\d{2})\s?(s|e)?\b/,
    build: (m) => ({ model: `galaxy a${m[1]}${m[2] ?? ""}`, display: `Galaxy A${m[1]}${m[2] ?? ""}` }),
  },
  { brand: "samsung", regex: /\bgalaxy\s?m(\d{2})\b/, build: (m) => ({ model: `galaxy m${m[1]}`, display: `Galaxy M${m[1]}` }) },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?xcover\s?(\d)?\s?(pro)?\b/,
    build: (m) => ({ model: ["galaxy xcover", m[1], m[2]].filter(Boolean).join(" "), display: ["Galaxy XCover", m[1], m[2] ? "Pro" : ""].filter(Boolean).join(" ") }),
  },
  {
    brand: "samsung",
    regex: /\bgalaxy\s?(buds|watch)\s?(\d)?\s?(pro|ultra|fe|classic|live)?\b/,
    build: (m) => ({
      model: ["galaxy", m[1], m[2], m[3]].filter(Boolean).join(" "),
      display: ["Galaxy", cap(m[1] ?? ""), m[2], m[3] ? (m[3] === "fe" ? "FE" : cap(m[3])) : ""].filter(Boolean).join(" "),
    }),
  },
  // ---- Google ----
  {
    brand: "google",
    regex: /\bpixel\s?(\d{1,2})\s?(a|pro\s?xl|pro|xl|fold)?\b/,
    build: (m) => {
      const v = (m[2] ?? "").replace(/\s+/g, " ");
      if (v === "a") return { model: `pixel ${m[1]}a`, display: `Pixel ${m[1]}a` };
      return { model: `pixel ${m[1]}${v ? ` ${v}` : ""}`, display: `Pixel ${m[1]}${v ? ` ${v === "xl" ? "XL" : v === "pro xl" ? "Pro XL" : cap(v)}` : ""}` };
    },
  },
  // ---- Xiaomi ----
  {
    brand: "xiaomi",
    regex: /\bredmi\s?(note)?\s?(\d{1,2})\s?(pro\s?\+|pro\s?plus|pro|s|t|c|lite|ultra)?(?![a-z0-9])/,
    build: (m) => {
      const v = (m[3] ?? "").replace(/\s+/g, " ").replace("pro +", "pro plus");
      return { model: ["redmi", m[1], m[2], v].filter(Boolean).join(" "), display: ["Redmi", m[1] ? "Note" : "", m[2], v ? cap(v) : ""].filter(Boolean).join(" ") };
    },
  },
  {
    brand: "xiaomi",
    regex: /\bpoco\s?([xfmc]\d{1,2})\s?(pro|gt)?\b/,
    build: (m) => ({ model: ["poco", m[1], m[2]].filter(Boolean).join(" "), display: ["Poco", (m[1] ?? "").toUpperCase(), m[2] ? cap(m[2]) : ""].filter(Boolean).join(" ") }),
  },
  {
    brand: "xiaomi",
    regex: /\b(?:xiaomi|mi)\s?(\d{1,2})\s?(t\s?pro|t|pro|ultra|lite)?\b/,
    build: (m) => {
      const v = (m[2] ?? "").replace(/\s+/g, " ");
      return { model: [m[1], v].filter(Boolean).join(" "), display: [m[1], v ? v.toUpperCase().replace("PRO", "Pro").replace("ULTRA", "Ultra").replace("LITE", "Lite") : ""].filter(Boolean).join(" ") };
    },
  },
  // ---- Huawei / Honor ----
  {
    brand: "huawei",
    regex: /\bhuawei\s+(p|mate|nova)\s?(\d{1,2})\s?(pro\s?\+|pro|lite)?(?![a-z0-9])/,
    build: (m) => ({ model: [`${m[1]}${m[2]}`, m[3]?.replace(/\s+/g, "")].filter(Boolean).join(" "), display: [`${(m[1] ?? "").toUpperCase()}${m[2]}`, m[3] ? cap(m[3]) : ""].filter(Boolean).join(" ") }),
  },
  {
    brand: "honor",
    regex: /\bhonor\s+(magic|x)?\s?(\d{1,2})\s?(pro|lite)?\b/,
    build: (m) => ({ model: [m[1], m[2], m[3]].filter(Boolean).join(" "), display: [m[1] ? cap(m[1]) : "", m[2], m[3] ? cap(m[3]) : ""].filter(Boolean).join(" ") }),
  },
  // ---- OnePlus / Oppo ----
  {
    brand: "oneplus",
    regex: /\boneplus\s?(nord\s?(?:ce\s?)?\d?|\d{1,2}[rt]?)\s?(pro)?\b/,
    build: (m) => ({ model: [(m[1] ?? "").replace(/\s+/g, " ").trim(), m[2]].filter(Boolean).join(" "), display: [cap((m[1] ?? "").trim()), m[2] ? "Pro" : ""].filter(Boolean).join(" ") }),
  },
  {
    brand: "oppo",
    regex: /\boppo\s+(reno|find|a)\s?(\d{1,2}|x\d?)\s?(pro|lite|neo)?\b/,
    build: (m) => ({ model: [m[1], m[2], m[3]].filter(Boolean).join(" "), display: [cap(m[1] ?? ""), (m[2] ?? "").toUpperCase(), m[3] ? cap(m[3]) : ""].filter(Boolean).join(" ") }),
  },
  // ---- Consoles ----
  {
    brand: "sony",
    regex: /\b(?:playstation|ps)\s?(4|5)\s?(pro|slim|digital(?:\s?edition)?)?\b/,
    build: (m) => ({ model: ["playstation", m[1], m[2]?.replace(/\s+/g, " ")].filter(Boolean).join(" "), display: ["PlayStation", m[1], m[2] ? cap(m[2]) : ""].filter(Boolean).join(" ") }),
  },
  {
    brand: "nintendo",
    regex: /\b(?:nintendo\s?)?switch\s?(oled|lite|2)?\b/,
    build: (m) => ({ model: ["nintendo switch", m[1]].filter(Boolean).join(" "), display: ["Nintendo Switch", m[1] === "oled" ? "OLED" : m[1] ? cap(m[1]) : ""].filter(Boolean).join(" ") }),
  },
  {
    brand: "microsoft",
    regex: /\bxbox\s?(series\s?[xs]|one\s?[xs]?)\b/,
    build: (m) => ({ model: `xbox ${(m[1] ?? "").replace(/\s+/g, " ")}`, display: `Xbox ${cap((m[1] ?? "").replace(/\s+/g, " ")).replace(/\b(X|S)$/, (c) => c.toUpperCase())}` }),
  },
  {
    brand: "microsoft",
    regex: /\bsurface\s?(pro|laptop|go|book)\s?(\d{1,2})?\b/,
    build: (m) => ({ model: ["surface", m[1], m[2]].filter(Boolean).join(" "), display: ["Surface", cap(m[1] ?? ""), m[2]].filter(Boolean).join(" ") }),
  },
  // ---- Dyson ----
  {
    brand: "dyson",
    regex: /\bdyson\s+(v\d{1,2}|airwrap|supersonic|gen\s?5)\s?(absolute|animal|detect|origin|complete|motorhead|fluffy)?\b/,
    build: (m) => ({ model: [(m[1] ?? "").replace(/\s+/g, ""), m[2]].filter(Boolean).join(" "), display: [(m[1] ?? "").toUpperCase().replace("GEN", "Gen"), m[2] ? cap(m[2]) : ""].filter(Boolean).join(" ") }),
  },
];

/** Couleurs : [canonique, synonymes]. Les synonymes multi-mots sont testés en premier. */
export const COLORS: Array<{ key: string; display: string; aliases: string[] }> = [
  { key: "gray", display: "Gray", aliases: ["space gray", "space grey", "gris sideral", "gris sidéral", "graphite", "graphit", "gris", "gray", "grey", "grau", "titanium gray", "gris titane"] },
  { key: "black", display: "Black", aliases: ["jet black", "noir de jais", "noir", "black", "schwarz", "nero", "negro", "black titanium", "titane noir"] },
  { key: "white", display: "White", aliases: ["blanc", "white", "weiss", "bianco", "blanco", "white titanium", "titane blanc"] },
  { key: "midnight", display: "Midnight", aliases: ["midnight", "minuit"] },
  { key: "starlight", display: "Starlight", aliases: ["starlight", "lumiere stellaire", "lumière stellaire"] },
  { key: "blue", display: "Blue", aliases: ["sierra blue", "bleu alpin", "alpine blue", "pacific blue", "bleu pacifique", "bleu nuit", "deep blue", "bleu", "blue", "blau", "azul", "blue titanium", "titane bleu"] },
  { key: "red", display: "Red", aliases: ["product red", "rouge", "red", "rot", "rosso", "rojo"] },
  { key: "green", display: "Green", aliases: ["alpine green", "vert alpin", "midnight green", "vert nuit", "vert", "green", "grun", "verde"] },
  { key: "silver", display: "Silver", aliases: ["argent", "silver", "silber", "argento", "plata"] },
  { key: "gold", display: "Gold", aliases: ["rose gold", "or rose", "dore", "doré", "gold", "golden", "or"] },
  { key: "purple", display: "Purple", aliases: ["deep purple", "violet intense", "violet", "purple", "mauve", "lilas", "lilac", "lavande", "lavender"] },
  { key: "pink", display: "Pink", aliases: ["rose", "pink", "rosa"] },
  { key: "yellow", display: "Yellow", aliases: ["jaune", "yellow", "gelb"] },
  { key: "orange", display: "Orange", aliases: ["orange", "corail", "coral"] },
  { key: "titanium", display: "Titanium", aliases: ["natural titanium", "titane naturel", "titane", "titanium", "desert titanium", "titane desert"] },
  { key: "brown", display: "Brown", aliases: ["marron", "brown", "bronze", "cuivre", "copper"] },
  { key: "beige", display: "Beige", aliases: ["beige", "sable", "sand"] },
];

export const CONDITION_WORDS: Array<{ condition: "new" | "refurbished" | "used"; aliases: string[] }> = [
  { condition: "new", aliases: ["brand new", "neuf", "neuve", "neufs", "new", "sealed", "scelle", "scellé", "blister", "nuevo", "nuovo", "neu"] },
  { condition: "refurbished", aliases: ["remis a neuf", "remis à neuf", "reconditionne", "reconditionné", "reconditionnee", "reconditionnée", "reconditionnes", "refurbished", "refurb", "recond", "renewed", "ricondizionato", "generaluberholt"] },
  { condition: "used", aliases: ["second hand", "seconde main", "pre owned", "preowned", "d occasion", "occasion", "used", "usado", "usato", "gebraucht"] },
];

/** Tokens sans valeur d'identification produit (retirés avant le calcul de la clé). */
export const NOISE_TOKENS = new Set([
  "smartphone", "smartphones", "telephone", "téléphone", "phone", "mobile", "portable", "tablette", "tablet", "ordinateur", "laptop",
  "unlocked", "debloque", "débloqué", "desimlocke", "désimlocké", "simfree", "sim", "free", "dual", "esim", "5g", "4g", "lte", "3g",
  "garantie", "warranty", "mois", "months", "month", "ans", "an", "year", "years",
  "lot", "pcs", "pieces", "pièces", "units", "unites", "unités", "pack", "bundle", "x",
  "original", "originale", "genuine", "authentique", "officiel", "official", "oem",
  "de", "du", "des", "le", "la", "les", "et", "avec", "sans", "pour", "the", "with", "and", "for", "of",
  "go", "gb", "tb", "to",
]);

/** Tokens de connectivité conservés dans `variant` (utiles pour iPad / montres). */
export const VARIANT_TOKENS: Array<{ key: string; aliases: string[] }> = [
  { key: "wifi", aliases: ["wifi", "wi fi", "wlan"] },
  { key: "cellular", aliases: ["cellular", "cellulaire", "4g cellular", "5g cellular", "lte cellular"] },
  { key: "dual sim", aliases: ["dual sim", "dual sims", "double sim", "ds"] },
];

/** Préfixes de références fabricant à ignorer (mots de modèle qui ressemblent à des MPN). */
export const MPN_STOPWORDS = new Set(["note", "tab", "mate", "nova", "poco", "ipad", "se", "s", "a", "m", "x", "z", "v", "ps", "mi", "pro", "max", "gen", "iphone", "pixel", "redmi", "galaxy", "watch", "xbox"]);

/** Codes devises ISO 4217 les plus courants (liste blanche pour la validation). */
export const ISO_4217 = new Set([
  "EUR", "USD", "GBP", "CHF", "JPY", "CNY", "HKD", "SGD", "AUD", "CAD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "HRK",
  "TRY", "ILS", "AED", "SAR", "QAR", "KWD", "INR", "PKR", "BDT", "LKR", "THB", "VND", "IDR", "MYR", "PHP", "KRW", "TWD", "ZAR", "NGN", "EGP",
  "MAD", "TND", "DZD", "KES", "BRL", "MXN", "ARS", "CLP", "COP", "PEN", "RUB", "UAH", "KZT", "ISK", "GEL", "RSD", "MKD", "BAM", "ALL", "MDL",
]);

export const STORAGE_SIZES_GB = new Set([8, 16, 32, 64, 128, 256, 512, 1024, 2048]);
