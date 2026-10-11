/**
 * Préparation d'un texte à lire à voix haute (partagé serveur / application) : sans balises,
 * listes, symboles ni URL ; montants et pourcentages prononçables ; coupé à la fin d'une phrase.
 * Module pur (aucune dépendance).
 */
/** Longueur lue au maximum : au-delà, la suite reste à l'écran (réponses trop longues). */
export const MAX_SPOKEN_CHARS = 700;

/** Ligne de tableau Markdown → cellules séparées par des virgules ; ligne de séparation → vide. */
function tableLine(line: string): string {
  if (/^\s*\|?\s*:?-{2,}/.test(line) && /^[\s|:-]+$/.test(line)) return "";
  return line
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Texte → phrase lisible à voix haute, conversationnelle : sans Markdown (titres, gras, code,
 * liens, tableaux, listes), sans URL, émojis ni noms techniques (snake_case) ; montants, unités et
 * pourcentages prononçables ; une pause (point) à chaque fin de ligne ; coupé à la fin d'une phrase.
 */
export function speakableText(raw: string, max = MAX_SPOKEN_CHARS): string {
  const lines = raw
    .replace(/\(réponse interrompue[^)]*\)/gi, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .split(/\r?\n/)
    .map((l) => (l.includes("|") ? tableLine(l) : l))
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*(?:[–•*+-]|\d+[.)])\s+/, "")
        .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
        .replace(/`([^`]*)`/g, "$1")
        .trim(),
    )
    .filter(Boolean)
    .map((l) => (/[.!?:;,]$/.test(l) ? l : `${l}.`));
  let t = (lines.length > 1 ? lines.join(" ") : (lines[0] ?? "").replace(/\.$/, ""))
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g, (m) => m.replace(/_/g, " "))
    .replace(/[*_`#>|]/g, "")
    .replace(/[≈~]\s?/g, "environ ")
    .replace(/(\d)\s?k€/g, "$1 mille euros")
    .replace(/(\d)\s?%/g, "$1 pour cent")
    .replace(/(\d)\s?€/g, "$1 euros")
    .replace(/\bn°\s?/gi, "numéro ")
    .replace(/\bvs\.?\s/gi, "par rapport à ")
    .replace(/(\d)\s?j\b/g, "$1 jours")
    .replace(/\s*→\s*/g, " puis ")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/\bu\.\s/g, "unités ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/([.!?])\.+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    t = `${(end > max * 0.4 ? cut.slice(0, end + 1) : cut).trim()} La suite est affichée à l'écran.`;
  }
  return t;
}

/** Découpe en phrases (lecture progressive, arrêt rapide entre deux phrases). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

