/**
 * « CONNECTEZ VOS COMPTES » — fournisseurs professionnels à brancher en priorité (module pur,
 * partagé serveur / application).
 *
 * Les meilleurs prix d'achat ne sont pas publics : ils sont derrière un compte revendeur (prix
 * HT, par grade, parfois négociés). MON STOCK met donc d'abord en avant VOS comptes, puis complète
 * avec les sources publiques (catalogues consultables, avec lien vers la fiche du produit).
 *
 * Informations reprises de l'étude du 15/10/2026 (docs/sourcing/external-platforms-report.md) :
 * extraits de recherche des sites officiels, non vérifiés avec un compte réel. Rien ici n'affirme
 * un partenariat avec ces fournisseurs.
 */

export type OfferAccess = "account" | "public" | "marketplace";

/** Prix issu de VOTRE compte (API, flux ou fichier du fournisseur), d'une source publique ou d'une place de marché. */
export function offerAccessOf(sourceType: string | null | undefined, sourceConfig: unknown): OfferAccess {
  const adapter = (sourceConfig as { adapter?: unknown } | null)?.adapter;
  if (adapter === "ebay-browse" || (sourceConfig as { kind?: unknown } | null)?.kind === "marketplace") return "marketplace";
  if (!sourceType || sourceType === "PUBLIC_WEB") return "public";
  return "account";
}

export const OFFER_ACCESS_LABEL: Record<OfferAccess, string> = {
  account: "Vos comptes fournisseurs",
  public: "Sources publiques",
  marketplace: "Places de marché",
};

/** Domaine affichable d'un site (« https://www.foxway.com/en/ » → « foxway.com »). */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Logo d'identification du fournisseur : l'icône publiée par son propre site (favicon), servie
 * par le service public d'icônes de Google. Aucun fichier de logo n'est copié dans l'application ;
 * à défaut d'icône, l'application affiche les initiales.
 */
export function logoUrlFor(domain: string | null | undefined, size = 64): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Initiales de repli (« Foxway » → « FO », « MobileSentrix Europe » → « ME »). */
export function initialsOf(name: string): string {
  const words = name.replace(/\(.*?\)/g, " ").split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export type ProAccountMethod =
  /** connecteur API MON STOCK existant : clé / identifiants du compte, chiffrés côté serveur */
  | "api"
  /** liste de stock Excel / CSV transmise par le fournisseur → « Importer un fichier » */
  | "file"
  /** lien de flux CSV / XML / JSON fourni par le fournisseur → « Ajouter un flux autorisé » */
  | "feed"
  /** consultation sur leur site uniquement (aucun accès automatisé autorisé ou proposé) */
  | "manual";

export interface ProAccountSpec {
  /** clé de la fiche dans l'annuaire des fournisseurs */
  key: string;
  /** ce que le compte apporte (annoncé par le fournisseur) */
  benefit: string;
  /** conditions d'ouverture connues */
  requirements: string;
  /** méthodes possibles, de la meilleure à la plus simple */
  methods: ProAccountMethod[];
  /** connecteur API MON STOCK, s'il existe */
  connectorKey?: "bigbuy" | "ingram-micro";
  /** page d'ouverture de compte */
  signupUrl: string;
  /** remarque importante (restriction, statut) */
  caution?: string;
}

/**
 * Ordre de priorité : appareils reconditionnés gradés, puis pièces, puis neuf / distribution,
 * puis lots. Les conditions viennent de l'étude (extraits des sites officiels) : à confirmer avec
 * le fournisseur lors de l'ouverture du compte.
 */
export const PRO_ACCOUNTS: readonly ProAccountSpec[] = [
  {
    key: "foxway",
    benefit: "iPhone, tablettes et portables reconditionnés, gradés appareil par appareil ; prix HT ; stock en temps réel exportable (Excel) ; enchères hebdomadaires.",
    requirements: "Compte revendeur validé (Kbis, n° de TVA). Commande minimale annoncée ≈ 2 000 €. API « personnalisée » sur demande.",
    methods: ["file", "feed"],
    signupUrl: "https://resellers.foxway.com/",
  },
  {
    key: "callisto-alchemy",
    benefit: "Place de marché B2B multi-vendeurs : téléphones, portables et tablettes d'occasion aux grades standard (A, B, C…, lots W), paiement sous séquestre.",
    requirements: "Inscription acheteur gratuite après contrôle (n° d'entreprise, n° fiscal et n° de TVA). Commission : à confirmer.",
    methods: ["file", "manual"],
    signupUrl: "https://callisto.tech",
    caution: "Aucun flux automatique annoncé : demandez s'ils proposent un export.",
  },
  {
    key: "foneday",
    benefit: "Pièces détachées (plus de 15 000 annoncées) et appareils reconditionnés ; prix d'achat et stock par référence.",
    requirements: "Compte professionnel. Une API par clé client existe mais n'est pas documentée publiquement : demandez-la à support@foneday.com.",
    methods: ["file", "feed"],
    signupUrl: "https://www.foneday.shop",
  },
  {
    key: "mobilesentrix-eu",
    benefit: "Pièces Apple et Android (écrans par qualité, batteries…), entrepôt européen.",
    requirements: "Compte B2B validé sur justificatifs (n° de TVA) ; prix visibles après validation. API réservée à des logiciels partenaires.",
    methods: ["file", "manual"],
    signupUrl: "https://www.mobilesentrix.eu",
  },
  {
    key: "mobileparts-shop",
    benefit: "Distributeur officiel des pièces Samsung (Service Packs), liste de stock grossiste sur demande.",
    requirements: "Compte professionnel ; liste de stock à demander à sales@2service.nl.",
    methods: ["file"],
    signupUrl: "https://www.mobileparts.shop",
  },
  {
    key: "mobilax",
    benefit: "Grossiste français de pièces détachées et accessoires pour réparateurs.",
    requirements: "Compte professionnel (Kbis). Export du catalogue : à demander.",
    methods: ["file"],
    signupUrl: "https://www.mobilax.fr",
  },
  {
    key: "distrihub",
    benefit: "Agrégateur de fournisseurs (plus de 400 annoncés) avec flux CSV / XML / JSON : produits neufs.",
    requirements: "Compte acheteur validé ; commande minimale annoncée 300 €. Identité de la plateforme à confirmer (distrihub.eu, Varle).",
    methods: ["feed", "file"],
    signupUrl: "https://distrihub.eu/",
  },
  {
    key: "thephonehub",
    benefit: "Distributeur de smartphones neufs avec liste de stock CSV partenaire et API annoncées.",
    requirements: "Compte partenaire ; lien CSV ou clés API fournis par l'équipe commerciale.",
    methods: ["feed", "file"],
    signupUrl: "https://www.thephonehub.eu/",
  },
  {
    key: "ingram-micro-fr",
    benefit: "Distributeur informatique : prix et stock de VOTRE compte par l'API officielle (Mac, iPad, PC, électronique neufs).",
    requirements: "Compte revendeur Ingram Micro actif, puis application créée sur le portail développeur (Client ID / Secret).",
    methods: ["api", "file"],
    connectorKey: "ingram-micro",
    signupUrl: "https://fr.ingrammicro.eu/",
  },
  {
    key: "bigbuy",
    benefit: "Grossiste généraliste (électronique, accessoires) avec API officielle et bac à sable.",
    requirements: "Abonnement BigBuy avec accès API (clé générée dans votre espace).",
    methods: ["api", "file"],
    connectorKey: "bigbuy",
    signupUrl: "https://www.bigbuy.eu/fr/",
  },
  {
    key: "merkandi",
    benefit: "Annuaire européen de lots et déstockages, dont smartphones gradés A/B/C.",
    requirements: "Abonnement annuel payant pour contacter les vendeurs ; aucun flux acheteur.",
    methods: ["manual"],
    signupUrl: "https://merkandi.fr/",
    caution: "Pas d'accès automatisé sans accord écrit de Merkandi : consultation sur leur site.",
  },
  {
    key: "gsmexchange",
    benefit: "Plateforme de négoce entre grossistes de téléphones (offres et demandes en temps réel).",
    requirements: "Adhésion contrôlée : deux références de grossistes et un volume minimum.",
    methods: ["manual"],
    signupUrl: "https://www.gsmexchange.com/",
    caution: "Aucune API : consultation sur leur site, à réserver quand vous aurez des références.",
  },
];

export const PRO_METHOD_LABEL: Record<ProAccountMethod, string> = {
  api: "Connecter avec mes identifiants API",
  file: "Importer ma liste de stock",
  feed: "Ajouter le lien de mon flux",
  manual: "Consulter sur leur site",
};

export type ProAccountStatus = "connected" | "pending" | "error" | "not_connected";

export const PRO_STATUS_LABEL: Record<ProAccountStatus, string> = {
  connected: "Connecté",
  pending: "En attente",
  error: "Erreur de connexion",
  not_connected: "Non connecté",
};
