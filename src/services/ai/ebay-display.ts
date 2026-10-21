/**
 * Affichage lisible des données de compte eBay dans les cartes du conseiller (module pur).
 * Les valeurs brutes (codes de service, durées « 2 DAY ») restent dans le résultat transmis au
 * modèle ; seules les cartes sont traduites. Un code inconnu est nettoyé, jamais remplacé par un
 * nom inventé.
 */

const QTY = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Quantité au format français (10 000 000) ; « — » si inconnue. */
export function frQuantity(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : QTY.format(n);
}

const UNITS: Record<string, [string, string]> = {
  DAY: ["jour", "jours"],
  BUSINESS_DAY: ["jour ouvré", "jours ouvrés"],
  CALENDAR_DAY: ["jour", "jours"],
  HOUR: ["heure", "heures"],
  WEEK: ["semaine", "semaines"],
  MONTH: ["mois", "mois"],
  YEAR: ["an", "ans"],
};

/** Durée eBay (« 14 DAY », « 2 BUSINESS_DAY ») → « 14 jours », « 2 jours ouvrés ». */
export function frDuration(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /^(\d+)\s+([A-Z_]+)$/.exec(text.trim());
  if (!m) return text.trim();
  const n = Number(m[1]);
  const unit = UNITS[m[2]!];
  if (!unit) return text.trim();
  return `${n} ${n <= 1 ? unit[0] : unit[1]}`;
}

/** Délai de préparation : « le jour même » pour 0. */
export function frHandlingTime(text: string | null | undefined): string | null {
  const d = frDuration(text);
  return d && /^0 /.test(d) ? "le jour même" : d;
}

const SERVICES: Record<string, string> = {
  PostOfficeLetterFollowed: "Lettre suivie",
  PostOfficeLetterRecommended: "Lettre recommandée",
  PostOfficeLetter: "Lettre",
  LaPosteLetterFollowed: "Lettre suivie",
  ColiposteColissimo: "Colissimo",
  ColiposteColissimoRecommended: "Colissimo recommandé",
  Colissimo: "Colissimo",
  Chronopost: "Chronopost",
  MondialRelay: "Mondial Relay",
  RelaisColis: "Relais Colis",
  Ecopli: "Ecopli",
};

/** Code de service eBay (« FR_ColiposteColissimo ») → nom lisible, ou code nettoyé si inconnu. */
export function ebayServiceName(code: string | null | undefined): string | null {
  if (!code) return null;
  const bare = code.trim().replace(/^[A-Z]{2}_/, "");
  if (SERVICES[bare]) return SERVICES[bare];
  const spaced = bare
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced || null;
}

/** Retire les lignes en double (même libellé, valeur et précision). */
export function dedupeRows<T extends { label: string; value: string; sub?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.label}\u0000${r.value}\u0000${r.sub ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
