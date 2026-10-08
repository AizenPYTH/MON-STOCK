/**
 * ProductNormalizer — transforme un texte libre (titre d'offre, requête, colonne
 * de flux) en identité produit structurée et déterministe.
 *
 * Règles : accents / casse / espaces neutralisés, stockages unifiés (128 Go → 128GB),
 * couleurs FR/EN → canonique, grades (Grade A, Gr. A, A Grade, A), états
 * (neuf / reconditionné / occasion). Rien n'est inventé : un champ non reconnu
 * reste null, et toute déduction est listée dans `inferred`.
 */
import { BRANDS, COLORS, CONDITION_WORDS, MODEL_PATTERNS, MPN_STOPWORDS, NOISE_TOKENS, STORAGE_SIZES_GB, VARIANT_TOKENS } from "@/domain/sourcing/dictionaries";

export type ProductCondition = "new" | "refurbished" | "used" | "unknown";

export interface ProductHints {
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  color?: string | null;
  grade?: string | null;
  condition?: string | null;
  ean?: string | null;
  mpn?: string | null;
}

export type InferredField = "condition" | "model";

export interface NormalizedProduct {
  brand: string | null;
  brandDisplay: string | null;
  model: string | null;
  modelDisplay: string | null;
  storage: string | null;
  color: string | null;
  colorDisplay: string | null;
  condition: ProductCondition;
  grade: string | null;
  variant: string | null;
  ean: string | null;
  eanValid: boolean | null;
  mpn: string | null;
  normalizedKey: string;
  displayTitle: string;
  remainingText: string;
  inferred: InferredField[];
  /** confiance dans l'identification du produit (0–1) */
  confidence: number;
}

const UNKNOWN = "-";

/** Accents, casse, ponctuation et espaces neutralisés. Conserve + / . , entre chiffres. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, " ")
    .replace(/[^a-z0-9+/.,\s]/g, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidGtin(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const check = nums.pop()!;
  let sum = 0;
  // Pondération 3/1 en partant de la droite (hors chiffre de contrôle).
  for (let i = nums.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += nums[i]! * w;
  return (10 - (sum % 10)) % 10 === check;
}

export function extractEan(text: string): { ean: string; valid: boolean } | null {
  const m = text.match(/(?<!\d)(\d{8}|\d{12,14})(?!\d)/);
  if (!m || !m[1]) return null;
  return { ean: m[1], valid: isValidGtin(m[1]) };
}

const STORAGE_TOKEN = /^\d{1,4}(gb|go|g|tb|to)$/i;

/** Détecte un token ressemblant à une référence fabricant (MPN) : lettres + chiffres, ≥ 5 caractères. */
export function looksLikeMpn(token: string): boolean {
  const t = token.trim();
  if (t.length < 5 || t.length > 32) return false;
  if (!/^[A-Z0-9][A-Z0-9\-/]*$/i.test(t)) return false;
  if ((t.match(/[A-Z]/gi) ?? []).length < 2) return false;
  if (!/\d/.test(t)) return false;
  if (STORAGE_TOKEN.test(t)) return false;
  if (/^\d/.test(t)) return false;
  const prefix = t.match(/^([A-Z]+)/i)?.[1]?.toLowerCase() ?? "";
  if (prefix && MPN_STOPWORDS.has(prefix)) return false;
  return true;
}

export function extractMpn(text: string): string | null {
  for (const tok of text.split(/\s+/)) {
    const clean = tok.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9/]+$/g, "");
    if (looksLikeMpn(clean)) return clean.toUpperCase();
  }
  return null;
}

export function normalizeStorage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = normalizeText(raw);
  const m = t.match(/(\d{1,4})\s?(tb|to|gb|go|g)?(?![a-z])/);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "tb" || unit === "to") return `${n}TB`;
  if (unit) return `${n}GB`;
  if (STORAGE_SIZES_GB.has(n)) return `${n}GB`;
  return null;
}

function cutMatch(work: string, m: RegExpMatchArray): string {
  const idx = m.index ?? work.indexOf(m[0]);
  return `${work.slice(0, idx)} ${work.slice(idx + m[0].length)}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const COLOR_ALIASES = COLORS.flatMap((c) => c.aliases.map((a) => ({ key: c.key, display: c.display, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
const CONDITION_ALIASES = CONDITION_WORDS.flatMap((c) => c.aliases.map((a) => ({ condition: c.condition, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
const BRAND_ALIASES = BRANDS.flatMap((b) => b.aliases.filter((a) => a.length > 2).map((a) => ({ key: b.key, display: b.display, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);
const VARIANT_ALIASES = VARIANT_TOKENS.flatMap((v) => v.aliases.map((a) => ({ key: v.key, alias: normalizeText(a) }))).sort((a, b) => b.alias.length - a.alias.length);

function wordRegex(alias: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9])`);
}

export function normalizeColor(raw: string | null | undefined): { key: string; display: string } | null {
  if (!raw) return null;
  const t = normalizeText(raw);
  for (const c of COLOR_ALIASES) {
    if (wordRegex(c.alias).test(t)) return { key: c.key, display: c.display };
  }
  return null;
}

export function normalizeGrade(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = normalizeText(raw);
  const m = t.match(/(?<![a-z0-9])(?:grade|gr)?\s?([abc]\+?(?:\s?\/\s?[abc]\+?)?)(?:\s?grade)?(?![a-z0-9+])/);
  if (!m || !m[1]) return null;
  return m[1].replace(/\s+/g, "").toUpperCase();
}

export function normalizeCondition(raw: string | null | undefined): ProductCondition {
  if (!raw) return "unknown";
  const t = normalizeText(raw);
  if (t === "new" || t === "refurbished" || t === "used") return t;
  for (const c of CONDITION_ALIASES) {
    if (wordRegex(c.alias).test(t)) return c.condition;
  }
  return "unknown";
}

export function normalizeBrand(raw: string | null | undefined): { key: string; display: string } | null {
  if (!raw) return null;
  const t = normalizeText(raw);
  if (!t) return null;
  for (const b of BRANDS) {
    if (b.key === t || b.aliases.some((a) => normalizeText(a) === t)) return { key: b.key, display: b.display };
  }
  return { key: t, display: raw.trim() };
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function buildNormalizedKey(p: Pick<NormalizedProduct, "brand" | "model" | "storage" | "color" | "condition" | "grade">): string {
  return [p.brand ?? UNKNOWN, p.model ?? UNKNOWN, p.storage?.toLowerCase() ?? UNKNOWN, p.color ?? UNKNOWN, p.condition, p.grade?.toLowerCase() ?? UNKNOWN].join("|");
}

export function normalizeProduct(text: string | null | undefined, hints: ProductHints = {}): NormalizedProduct {
  const original = (text ?? "").trim();
  let work = ` ${normalizeText(original)} `;
  const inferred: InferredField[] = [];

  // --- Identifiants
  const eanFound = extractEan(original);
  let ean: string | null = eanFound?.ean ?? null;
  let eanValid: boolean | null = eanFound ? eanFound.valid : null;
  if (ean) work = work.replace(wordRegex(ean), " ");
  let mpn = extractMpn(original);
  if (mpn) work = work.replace(wordRegex(normalizeText(mpn)), " ");

  // --- Modèle (le motif impose la marque) — avant le retrait des mots de marque,
  // car certains motifs (Dyson, Huawei, Oppo…) s'appuient sur le mot de marque.
  let brand: string | null = null;
  let brandDisplay: string | null = null;
  let model: string | null = null;
  let modelDisplay: string | null = null;
  for (const p of MODEL_PATTERNS) {
    const m = work.match(p.regex);
    if (!m) continue;
    const built = p.build(m);
    if (!built) continue;
    model = built.model;
    modelDisplay = built.display;
    const entry = BRANDS.find((b) => b.key === p.brand);
    brand = p.brand;
    brandDisplay = entry?.display ?? p.brand;
    work = cutMatch(work, m);
    break;
  }

  // --- Marque explicite (retirée du texte ; ne contredit pas la marque déduite du modèle)
  for (const b of BRAND_ALIASES) {
    const re = wordRegex(b.alias);
    if (re.test(work)) {
      if (!brand) {
        brand = b.key;
        brandDisplay = b.display;
      }
      work = work.replace(re, " ");
      break;
    }
  }

  // --- Stockage (avec unité, puis nombre isolé appartenant aux tailles connues)
  const storages: Array<{ value: string; gb: number }> = [];
  work = work.replace(/(?<![a-z0-9])(\d{1,4})\s?(tb|to|gb|go|g)(?![a-z0-9])/g, (full, n: string, unit: string) => {
    const num = Number(n);
    if (unit === "g" && !STORAGE_SIZES_GB.has(num)) return full;
    const isTb = unit === "tb" || unit === "to";
    storages.push({ value: isTb ? `${num}TB` : `${num}GB`, gb: isTb ? num * 1024 : num });
    return " ";
  });
  if (storages.length === 0) {
    work = work.replace(/(?<![a-z0-9.,])(\d{2,4})(?![a-z0-9.,])/g, (full, n: string) => {
      const num = Number(n);
      if (storages.length === 0 && STORAGE_SIZES_GB.has(num)) {
        storages.push({ value: `${num}GB`, gb: num });
        return " ";
      }
      return full;
    });
  }
  storages.sort((a, b) => b.gb - a.gb);
  let storage: string | null = storages[0]?.value ?? null;
  const variantParts: string[] = storages.slice(1).map((s) => `${s.value.toLowerCase()} ram`);

  // --- Grade explicite (Grade A, Gr. A, A Grade)
  let grade: string | null = null;
  const gradePatterns = [/(?<![a-z0-9])grade\s?([abc]\+?(?:\s?\/\s?[abc]\+?)?)(?![a-z0-9+])/, /(?<![a-z0-9])gr\s?([abc]\+?)(?![a-z0-9+])/, /(?<![a-z0-9])([abc]\+?)\s?grade(?![a-z0-9])/];
  for (const re of gradePatterns) {
    const m = work.match(re);
    if (m && m[1]) {
      grade = m[1].replace(/\s+/g, "").toUpperCase();
      work = cutMatch(work, m);
      break;
    }
  }

  // --- État
  let condition: ProductCondition = "unknown";
  for (const c of CONDITION_ALIASES) {
    const re = wordRegex(c.alias);
    if (re.test(work)) {
      condition = c.condition;
      work = work.replace(re, " ");
      break;
    }
  }

  // --- Couleur
  let color: string | null = null;
  let colorDisplay: string | null = null;
  for (const c of COLOR_ALIASES) {
    const re = wordRegex(c.alias);
    if (re.test(work)) {
      color = c.key;
      colorDisplay = c.display;
      work = work.replace(re, " ");
      break;
    }
  }

  // --- Grade isolé (« iphone 13 128 a ») : uniquement pour un modèle reconnu,
  // afin de ne pas prendre « USB-C » ou un article pour un grade.
  if (!grade && model) {
    const m = work.match(/(?<![a-z0-9+])([abc]\+?)(?![a-z0-9+])/);
    if (m && m[1]) {
      grade = m[1].toUpperCase();
      work = cutMatch(work, m);
    }
  }

  // --- Variante (connectivité)
  for (const v of VARIANT_ALIASES) {
    const re = wordRegex(v.alias);
    if (re.test(work)) {
      if (!variantParts.includes(v.key)) variantParts.push(v.key);
      work = work.replace(re, " ");
    }
  }

  // --- Indices structurés (colonnes de flux) : prioritaires sur le texte
  if (hints.brand) {
    const b = normalizeBrand(hints.brand);
    if (b) {
      brand = b.key;
      brandDisplay = b.display;
    }
  }
  if (hints.model) {
    const parsed = normalizeProduct(hints.model);
    if (parsed.model && !parsed.inferred.includes("model")) {
      model = parsed.model;
      modelDisplay = parsed.modelDisplay;
      if (!hints.brand && parsed.brand) {
        brand = parsed.brand;
        brandDisplay = parsed.brandDisplay;
      }
    } else {
      const m = normalizeText(hints.model);
      if (m) {
        model = m;
        modelDisplay = hints.model.trim();
      }
    }
  }
  if (hints.storage) storage = normalizeStorage(hints.storage) ?? storage;
  if (hints.color) {
    const c = normalizeColor(hints.color);
    if (c) {
      color = c.key;
      colorDisplay = c.display;
    } else {
      const raw = normalizeText(hints.color);
      if (raw) {
        color = raw;
        colorDisplay = titleCase(raw);
      }
    }
  }
  if (hints.grade) grade = normalizeGrade(hints.grade) ?? grade;
  if (hints.condition) {
    const c = normalizeCondition(hints.condition);
    if (c !== "unknown") condition = c;
  }
  if (hints.ean) {
    const e = hints.ean.replace(/\D/g, "");
    if (e.length >= 8) {
      ean = e;
      eanValid = isValidGtin(e);
    }
  }
  if (hints.mpn && hints.mpn.trim()) mpn = hints.mpn.trim().toUpperCase();

  // --- Déduction documentée : un grade sans état explicite implique un produit non neuf
  if (condition === "unknown" && grade) {
    condition = "refurbished";
    inferred.push("condition");
  }

  // --- Reste
  const remainingTokens = work
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t) && !/^[+/.,]+$/.test(t));
  const remainingText = remainingTokens.join(" ");

  if (!model && remainingTokens.length > 0) {
    model = remainingTokens.slice(0, 4).join(" ");
    modelDisplay = null;
    inferred.push("model");
  }

  const variant = variantParts.length > 0 ? variantParts.join(" ") : null;

  const displayParts = [brandDisplay, modelDisplay ?? (model && inferred.includes("model") ? titleCase(model) : null), storage, colorDisplay, grade ? `Grade ${grade}` : null].filter((x): x is string => Boolean(x));
  const displayTitle = modelDisplay || brandDisplay ? displayParts.join(" ") : original || displayParts.join(" ");

  let confidence = 0.2;
  if (brand) confidence += 0.2;
  if (model && !inferred.includes("model")) confidence += 0.5;
  if (storage) confidence += 0.05;
  if (color) confidence += 0.03;
  if (ean && eanValid) confidence = Math.max(confidence, 0.99);
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100);

  const result: NormalizedProduct = {
    brand,
    brandDisplay,
    model,
    modelDisplay,
    storage,
    color,
    colorDisplay,
    condition,
    grade,
    variant,
    ean,
    eanValid,
    mpn,
    normalizedKey: "",
    displayTitle,
    remainingText,
    inferred,
    confidence,
  };
  result.normalizedKey = buildNormalizedKey(result);
  return result;
}

export const CONDITION_LABEL_FR: Record<ProductCondition, string> = {
  new: "Neuf",
  refurbished: "Reconditionné",
  used: "Occasion",
  unknown: "Non communiqué",
};
