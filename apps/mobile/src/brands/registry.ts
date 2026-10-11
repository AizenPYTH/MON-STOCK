import type { ImageSourcePropType } from "react-native";

/**
 * Registre centralisé des marques tierces affichées dans MON STOCK (plateformes de vente,
 * transporteurs, plateformes d'expédition, services de suivi).
 *
 * Règle : un logo n'est affiché QUE si son usage est autorisé (`usage.status === "authorized"`)
 * ET qu'un fichier officiel est présent dans `assets/brands/` (référencé ci-dessous). Sinon, le
 * nom est présenté dans une typographie neutre (police de l'application, couleurs neutres) avec
 * une icône générique : aucune imitation de logo, aucune couleur de marque, aucune mention
 * laissant croire à un partenariat ou à une approbation.
 *
 * État vérifié le 11 octobre 2026 (voir docs/BRANDS.md pour les sources et les démarches) :
 * AUCUNE autorisation écrite n'est détenue → aucun logo n'est embarqué pour l'instant.
 */

export type BrandKind = "marketplace" | "carrier" | "shipping_platform" | "tracking";

export type BrandUsageStatus =
  /** autorisation écrite obtenue et fichier officiel ajouté → logo affiché */
  | "authorized"
  /** la marque exige une licence ou une autorisation écrite (non obtenue) */
  | "permission_required"
  /** un kit officiel existe, mais ses conditions pour un éditeur de logiciel ne sont pas confirmées */
  | "official_kit_unverified"
  /** aucune condition publique d'utilisation trouvée → autorisation à demander */
  | "no_public_terms";

export interface BrandLogo {
  source: ImageSourcePropType;
  /** dimensions du fichier d'origine : le ratio est toujours respecté */
  width: number;
  height: number;
  /** « light » : à poser sur un fond clair (plaque blanche en thème sombre) */
  background: "light" | "any";
  /** version officielle pour fond sombre, si la marque en fournit une */
  dark?: ImageSourcePropType;
}

export interface BrandEntry {
  id: BrandId;
  /** orthographe officielle (ex. « eBay », jamais « Ebay ») */
  name: string;
  kind: BrandKind;
  /** variantes rencontrées dans les données (devis, grilles saisies, transporteurs détectés) */
  aliases: string[];
  logo: BrandLogo | null;
  usage: {
    status: BrandUsageStatus;
    /** page officielle des règles ou du kit, si identifiée */
    officialSource: string | null;
    checkedAt: string;
    note: string;
  };
}

const CHECKED = "2026-10-11";

const entries = {
  ebay: {
    name: "eBay",
    kind: "marketplace",
    aliases: ["ebay"],
    usage: {
      status: "permission_required",
      officialSource: "https://brandpermission.ebay.com/guidelines",
      note: "Logo : licence écrite d'eBay obligatoire (demande via l'Intellectual Property Permission Center, ippermissions@ebay.com). Le nom « eBay » en texte simple est autorisé sans permission. Le badge « eBay Compatible Application » est réservé aux applications approuvées par le Developers Program.",
    },
  },
  laposte: {
    name: "La Poste",
    kind: "carrier",
    aliases: ["la poste", "laposte", "lettre suivie"],
    usage: {
      status: "official_kit_unverified",
      officialSource: "https://www.lebrandcenter.lapostegroupe.com",
      note: "Brand center du groupe La Poste : règles d'usage (fonds, taille minimale, zone de protection, aucune altération). Accès et autorisation pour un éditeur tiers non confirmés.",
    },
  },
  colissimo: {
    name: "Colissimo",
    kind: "carrier",
    aliases: ["colissimo"],
    usage: {
      status: "official_kit_unverified",
      officialSource: "https://www.colissimo.entreprise.laposte.fr/en/tools-and-services/communication-kit",
      note: "Kit de communication officiel (logothèque, version verticale réservée aux sites e-commerce, usages interdits). Destiné aux e-commerçants clients ; usage dans un logiciel tiers non confirmé. Interdit : écrire « Colissimo » dans la typographie du logo, fond nuisant à la lisibilité.",
    },
  },
  chronopost: {
    name: "Chronopost",
    kind: "carrier",
    aliases: ["chronopost", "chrono relais", "chronorelais", "chrono 13", "chrono 18"],
    usage: { status: "no_public_terms", officialSource: null, note: "Aucune charte d'utilisation publique trouvée (seules les CGV sont publiées). Autorisation à demander à Chronopost / groupe La Poste." },
  },
  mondial_relay: {
    name: "Mondial Relay",
    kind: "carrier",
    aliases: ["mondial relay", "mondialrelay", "inpost"],
    usage: { status: "no_public_terms", officialSource: null, note: "Aucun kit presse ni charte publique trouvés (« Points Relais » est une marque déposée). Autorisation à demander (groupe InPost)." },
  },
  ups: { name: "UPS", kind: "carrier", aliases: ["ups"], usage: { status: "no_public_terms", officialSource: null, note: "Programme de certification et règles de nommage (® sur la première mention) ; aucune licence publique de logo pour un logiciel tiers." } },
  dhl: { name: "DHL", kind: "carrier", aliases: ["dhl"], usage: { status: "no_public_terms", officialSource: null, note: "Aucune condition publique trouvée pour un logiciel tiers." } },
  dpd: { name: "DPD", kind: "carrier", aliases: ["dpd"], usage: { status: "no_public_terms", officialSource: null, note: "Aucune condition publique trouvée pour un logiciel tiers." } },
  gls: { name: "GLS", kind: "carrier", aliases: ["gls"], usage: { status: "no_public_terms", officialSource: null, note: "Seule une licence d'emblème « Klima Protect » liée à un contrat est publiée ; rien pour le logo principal." } },
  colis_prive: { name: "Colis Privé", kind: "carrier", aliases: ["colis prive", "colis privé"], usage: { status: "no_public_terms", officialSource: null, note: "Aucune condition publique trouvée." } },
  relais_colis: { name: "Relais Colis", kind: "carrier", aliases: ["relais colis"], usage: { status: "no_public_terms", officialSource: null, note: "Aucune condition publique trouvée." } },
  fedex: { name: "FedEx", kind: "carrier", aliases: ["fedex"], usage: { status: "no_public_terms", officialSource: null, note: "Aucune condition publique trouvée pour un logiciel tiers." } },
  amazon: { name: "Amazon", kind: "marketplace", aliases: ["amazon", "amazon logistics"], usage: { status: "no_public_terms", officialSource: null, note: "Canal non connecté (« prochainement »). Aucune autorisation." } },
  sendcloud: {
    name: "Sendcloud",
    kind: "shipping_platform",
    aliases: ["sendcloud"],
    usage: { status: "no_public_terms", officialSource: null, note: "Aucun kit de marque officiel trouvé (seulement des pages partenaires). Autorisation à demander via le programme partenaires Sendcloud." },
  },
  packlink: {
    name: "Packlink PRO",
    kind: "shipping_platform",
    aliases: ["packlink", "packlink pro"],
    usage: { status: "no_public_terms", officialSource: null, note: "Aucun kit de marque officiel trouvé. Autorisation à demander à Packlink." },
  },
  boxtal: {
    name: "Boxtal",
    kind: "shipping_platform",
    aliases: ["boxtal", "envoimoinscher"],
    usage: { status: "no_public_terms", officialSource: null, note: "Aucun kit de marque officiel trouvé. Autorisation à demander à Boxtal." },
  },
  ship24: {
    name: "Ship24",
    kind: "tracking",
    aliases: ["ship24"],
    usage: { status: "no_public_terms", officialSource: null, note: "Aucun kit de marque officiel trouvé." },
  },
} as const satisfies Record<string, Omit<BrandEntry, "id" | "logo" | "usage"> & { usage: Omit<BrandEntry["usage"], "checkedAt"> }>;

export type BrandId = keyof typeof entries;

/** Fichiers officiels autorisés (vide : aucune autorisation écrite détenue à ce jour). */
const LOGOS: Partial<Record<BrandId, BrandLogo>> = {};

export const BRANDS: Record<BrandId, BrandEntry> = Object.fromEntries(
  (Object.keys(entries) as BrandId[]).map((id) => {
    const e = entries[id];
    return [id, { id, name: e.name, kind: e.kind, aliases: [...e.aliases], logo: LOGOS[id] ?? null, usage: { ...e.usage, checkedAt: CHECKED } }];
  }),
) as Record<BrandId, BrandEntry>;

/** Un logo ne s'affiche que si l'usage est autorisé ET qu'un fichier officiel est fourni. */
export function canShowLogo(b: BrandEntry): b is BrandEntry & { logo: BrandLogo } {
  return b.usage.status === "authorized" && b.logo !== null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Code connu (canal, transporteur, fournisseur d'API) → marque. */
export function brandById(id: string | null | undefined): BrandEntry | null {
  if (!id) return null;
  return (BRANDS as Record<string, BrandEntry>)[id] ?? null;
}

/**
 * Texte libre (« Colissimo Expert », « Chronopost Relais 13 », « UPS Standard ») → marque, par
 * correspondance de mots entiers avec le nom ou un alias ; l'alias le plus long l'emporte.
 */
export function brandFromText(text: string | null | undefined): BrandEntry | null {
  if (!text) return null;
  const t = ` ${norm(text)} `;
  let best: { entry: BrandEntry; len: number } | null = null;
  for (const entry of Object.values(BRANDS)) {
    for (const alias of [entry.name, ...entry.aliases]) {
      const a = norm(alias);
      if (a && t.includes(` ${a} `) && (!best || a.length > best.len)) best = { entry, len: a.length };
    }
  }
  return best?.entry ?? null;
}

/** Mention affichée près des marques : identification seulement, aucune affiliation. */
export const BRAND_DISCLAIMER = "Les noms cités sont des marques de leurs propriétaires respectifs. Ils servent uniquement à identifier les services utilisés ; MON STOCK n'est ni partenaire ni approuvé par ces marques.";
