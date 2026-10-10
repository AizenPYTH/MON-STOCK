/**
 * Arithmétique monétaire exacte pour les outils (module pur, partagé web / mobile).
 *
 * Les montants sont des fractions exactes de deux entiers (BigInt) : 129,90 = 12990 / 100.
 * Additions, multiplications et divisions (ex. TTC ÷ 1,055) restent exactes ; l'arrondi au
 * centime n'a lieu qu'à l'affichage (`toCents`), jamais en cours de calcul.
 */

export interface Dec {
  readonly n: bigint;
  /** toujours > 0 */
  readonly d: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

function make(n: bigint, d: bigint): Dec {
  if (d === 0n) throw new RangeError("Division par zéro.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const ZERO: Dec = { n: 0n, d: 1n };
export const ONE: Dec = { n: 1n, d: 1n };
export const HUNDRED: Dec = { n: 100n, d: 1n };

export const dec = (n: bigint | number, d: bigint | number = 1n): Dec => make(BigInt(n), BigInt(d));
export const add = (a: Dec, b: Dec): Dec => make(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Dec, b: Dec): Dec => make(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Dec, b: Dec): Dec => make(a.n * b.n, a.d * b.d);
export const div = (a: Dec, b: Dec): Dec => make(a.n * b.d, a.d * b.n);
export const neg = (a: Dec): Dec => ({ n: -a.n, d: a.d });
export const isZero = (a: Dec) => a.n === 0n;
export const isNegative = (a: Dec) => a.n < 0n;
export const cmp = (a: Dec, b: Dec): -1 | 0 | 1 => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
export const sum = (values: Dec[]): Dec => values.reduce(add, ZERO);
/** a × p / 100 */
export const percentOf = (a: Dec, p: Dec): Dec => div(mul(a, p), HUNDRED);

/** Arrondi à `places` décimales, demi au-dessus en valeur absolue (arrondi commercial) — renvoie l'entier mis à l'échelle. */
export function roundScaled(a: Dec, places = 2): bigint {
  const scale = 10n ** BigInt(places);
  const num = abs(a.n) * scale;
  let q = num / a.d;
  if ((num % a.d) * 2n >= a.d) q += 1n;
  return a.n < 0n ? -q : q;
}

/** Montant arrondi au centime, en centimes (entier). */
export const toCents = (a: Dec): bigint => roundScaled(a, 2);

/** Valeur approchée (affichage secondaire, graphiques) — ne pas réutiliser pour calculer. */
export const toNumber = (a: Dec, places = 6): number => Number(roundScaled(a, places)) / 10 ** places;

/** Depuis un nombre JS « propre » (taux, réglage enregistré) via sa représentation décimale courte. */
export function fromNumber(x: number): Dec {
  if (!Number.isFinite(x)) throw new RangeError("Nombre invalide.");
  const parsed = parseDecimal(String(x).includes("e") ? x.toFixed(12) : String(x));
  if (!parsed.ok) throw new RangeError("Nombre invalide.");
  return parsed.value;
}

export type ParseError = "empty" | "invalid" | "negative" | "too_large";

export type ParseResult = { ok: true; value: Dec } | { ok: false; error: ParseError };

export const PARSE_ERROR_LABEL: Record<ParseError, string> = {
  empty: "Saisissez un montant.",
  invalid: "Montant invalide : utilisez des chiffres et une virgule (ex. 129,90).",
  negative: "Le montant ne peut pas être négatif.",
  too_large: "Montant trop élevé.",
};

/**
 * Lecture d'un nombre saisi « à la française » : `129,90`, `1 299,90`, `1.299,90`, `129.90`,
 * `€ 12`, `12 €`. Les espaces (y compris insécables) servent de séparateur de milliers.
 * Ambiguïté `1.299` : un seul point suivi de 3 chiffres sans virgule est lu comme décimal
 * (1,299) — la saisie mobile utilise la virgule, la plus fréquente en français.
 */
export function parseDecimal(input: string | null | undefined, opts: { allowNegative?: boolean; maxIntegerDigits?: number } = {}): ParseResult {
  let s = (input ?? "").replace(/[\s  ]/g, "").replace(/[€$£]|EUR/gi, "");
  if (s === "") return { ok: false, error: "empty" };
  let negative = false;
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s === "") return { ok: false, error: "invalid" };
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas > 1) return { ok: false, error: "invalid" };
  if (commas === 1 && dots > 0) {
    // 1.299,90 : points = milliers, virgule = décimales (le point doit précéder la virgule)
    if (s.lastIndexOf(".") > s.indexOf(",")) return { ok: false, error: "invalid" };
    if (!/^\d{1,3}(\.\d{3})+,\d*$/.test(s)) return { ok: false, error: "invalid" };
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (commas === 1) s = s.replace(",", ".");
  else if (dots > 1) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return { ok: false, error: "invalid" };
    s = s.replace(/\./g, "");
  }
  if (!/^\d*\.?\d*$/.test(s) || s === "." ) return { ok: false, error: "invalid" };
  const [intPart = "", fracPart = ""] = s.split(".");
  if ((intPart.replace(/^0+/, "").length || 0) > (opts.maxIntegerDigits ?? 12)) return { ok: false, error: "too_large" };
  if (fracPart.length > 12) return { ok: false, error: "invalid" };
  const value = make(BigInt((intPart || "0") + fracPart), 10n ** BigInt(fracPart.length));
  if (negative && !isZero(value)) {
    if (!opts.allowNegative) return { ok: false, error: "negative" };
    return { ok: true, value: neg(value) };
  }
  return { ok: true, value };
}

/** Saisie en cours : garde uniquement chiffres, une virgule / un point et un signe (pour `onChangeText`). */
export function sanitizeAmountInput(raw: string, allowNegative = false): string {
  let s = raw.replace(/[^\d,.\-−\s  ]/g, "");
  if (!allowNegative) s = s.replace(/[-−]/g, "");
  return s.slice(0, 24);
}

/** « 1 234,56 » (espace fine insécable, virgule, 2 décimales) sans Intl (absent de Hermes pour certaines API). */
export function formatDec(a: Dec, places = 2): string {
  const scaled = roundScaled(a, places);
  const negative = scaled < 0n;
  const digits = abs(scaled).toString().padStart(places + 1, "0");
  const intPart = digits.slice(0, digits.length - places);
  const frac = places > 0 ? digits.slice(digits.length - places) : "";
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "−" : ""}${grouped}${places > 0 ? "," + frac : ""}`;
}

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", PLN: "zł", CNY: "¥", JPY: "¥" };

/** Montant formaté avec sa devise (€ par défaut ; toute devise ISO acceptée). */
export function formatMoneyDec(a: Dec, currency = "EUR", places = 2): string {
  const sym = SYMBOL[currency.toUpperCase()] ?? currency.toUpperCase();
  return `${formatDec(a, places)} ${sym}`;
}

/** Pourcentage « 5,5 % » (jusqu'à 2 décimales, zéros inutiles retirés). */
export function formatPercent(a: Dec, places = 2): string {
  let s = formatDec(a, places);
  if (s.includes(",")) s = s.replace(/0+$/, "").replace(/,$/, "");
  return `${s} %`;
}

/** Représentation canonique « 1299.9 » (point décimal, sans séparateur, zéros inutiles retirés). */
export function toPlainDecimal(a: Dec, maxPlaces = 6): string {
  const scaled = roundScaled(a, maxPlaces);
  const negative = scaled < 0n;
  const digits = abs(scaled).toString().padStart(maxPlaces + 1, "0");
  const intPart = digits.slice(0, digits.length - maxPlaces);
  const frac = digits.slice(digits.length - maxPlaces).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${frac ? `.${frac}` : ""}`;
}
