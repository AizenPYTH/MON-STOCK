/**
 * REGISTRE DES FOURNISSEURS — classification commune (module pur, partagé serveur / application).
 *
 * À partir d'une fiche de l'annuaire (ce que le fournisseur propose réellement) et des preuves
 * propres à l'organisation (connexion testée, import réussi, source active), on calcule :
 *   - les MÉTHODES D'ACCÈS possibles (9 catégories, plusieurs par fournisseur) ;
 *   - le STATUT D'INTÉGRATION réel ;
 *   - la PRIORITÉ d'intégration (critères explicites, pondérés) ;
 *   - la FIABILITÉ de l'information (confirmée / annoncée / supposée) ;
 *   - l'ACTION PRINCIPALE à proposer, avec ce qu'elle permettra ensuite.
 * Un simple lien vers le site n'est jamais présenté comme une connexion.
 */

export type AccessMethod =
  /** 1. API officielle déjà intégrée dans MON STOCK (connecteur réel) */
  | "official_api"
  /** 2. OAuth ou autre autorisation officielle (place de marché, compte autorisé) */
  | "oauth"
  /** 3. Flux de catalogue régulier (CSV / XML / JSON / EDI) */
  | "catalog_feed"
  /** 4. Export depuis l'espace client */
  | "portal_export"
  /** 5. Import manuel d'un catalogue téléchargé ou reçu (liste de stock) */
  | "manual_import"
  /** 6. API annoncée mais sans connecteur MON STOCK : développement spécifique */
  | "custom_development"
  /** 7. Compte professionnel à ouvrir avant toute intégration */
  | "pro_account_first"
  /** 8. Aucune intégration automatisable actuellement (devis, consultation, CGU) */
  | "not_automatable"
  /** 9. Fournisseur public intégré par MON STOCK (catalogue public collecté) */
  | "public_integrated";

export const ACCESS_METHOD_LABEL: Record<AccessMethod, string> = {
  official_api: "API officielle intégrée",
  oauth: "Autorisation officielle (OAuth)",
  catalog_feed: "Flux de catalogue",
  portal_export: "Export depuis l'espace client",
  manual_import: "Import de fichier",
  custom_development: "API à intégrer (développement)",
  pro_account_first: "Compte pro à ouvrir",
  not_automatable: "Non automatisable",
  public_integrated: "Catalogue public intégré",
};

export type IntegrationStatus =
  | "connected_tested"
  | "in_progress"
  | "public_available"
  | "api_to_integrate"
  | "feed_to_integrate"
  | "file_import"
  | "pro_account_required"
  | "commercial_access_needed"
  | "not_automatable"
  | "abandoned";

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected_tested: "Connecté et testé",
  in_progress: "Intégration en cours",
  public_available: "Disponible publiquement",
  api_to_integrate: "À intégrer par API",
  feed_to_integrate: "À intégrer par flux",
  file_import: "Import de fichier",
  pro_account_required: "Compte professionnel requis",
  commercial_access_needed: "Accès commercial à demander",
  not_automatable: "Non automatisable actuellement",
  abandoned: "Écarté",
};

export type Reliability = "confirmed" | "announced" | "inferred";

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  confirmed: "Confirmé (documentation officielle)",
  announced: "Annoncé par le fournisseur, non testé",
  inferred: "Déduit, à confirmer",
};

/** Fournisseurs écartés de toute automatisation, avec la raison documentée. */
export const ABANDONED: Readonly<Record<string, string>> = {
  utopya: "CGV (art. 14) : extraction automatisée et réutilisation des données interdites.",
  "bstock-europe": "Conditions d'utilisation : robots, scrapers et extraction de données interdits.",
  "liquidity-services": "Conditions d'utilisation : robots, scrapers et extraction de données interdits.",
};

/** Connecteurs API réellement implémentés dans MON STOCK, par fiche de l'annuaire. */
export const CONNECTOR_BY_KEY: Readonly<Record<string, "bigbuy" | "ingram-micro">> = { bigbuy: "bigbuy", "ingram-micro-fr": "ingram-micro" };

/** Marques de référence du secteur (notoriété en France / Europe) : critère de priorité, pas de compétitivité. */
export const MAJOR_BRANDS = new Set([
  "foxway", "thephonehub", "distrihub", "mobilax", "mps-mobile", "mobistock", "ingram-micro-fr", "bigbuy", "td-synnex", "td-synnex-fr", "esprinet", "exertis", "komsa",
  "mobilesentrix-eu", "foneday", "callisto-alchemy", "also", "also-france", "4phones", "lcd-phone", "tr-vertrieb", "refreshed-apples", "gsmexchange", "merkandi",
]);

export interface RegistryEntryInput {
  key: string;
  segment: string;
  country: string | null;
  deliveryZones: string[];
  categories: string[];
  accessModes: string[];
  proAccountRequired: boolean | null;
  apiDocsUrl: string | null;
  verificationLevel: string;
}

export interface RegistryOrgFacts {
  /** connexion API testée avec succès dans l'organisation */
  connectionOk: boolean;
  /** connexion créée mais pas encore validée (ou en erreur) */
  connectionPending: boolean;
  /** au moins un import de fichier / flux réussi dans l'organisation */
  imported: boolean;
  /** source publique de la bibliothèque active dans l'organisation */
  publicActive: boolean;
  /** source publique existante dans la bibliothèque MON STOCK (activable) */
  publicAvailable: boolean;
}

export const NO_FACTS: RegistryOrgFacts = { connectionOk: false, connectionPending: false, imported: false, publicActive: false, publicAvailable: false };

const has = (e: RegistryEntryInput, ...modes: string[]) => e.accessModes.some((m) => modes.includes(m) || (modes.includes("feed") && m.startsWith("feed")));

export function accessMethodsOf(e: RegistryEntryInput, facts: Pick<RegistryOrgFacts, "publicAvailable"> = NO_FACTS): AccessMethod[] {
  const out: AccessMethod[] = [];
  if (ABANDONED[e.key]) return ["not_automatable"];
  if (CONNECTOR_BY_KEY[e.key]) out.push("official_api");
  if (e.key === "ebay-browse") out.push("oauth");
  if (facts.publicAvailable) out.push("public_integrated");
  if (has(e, "feed", "edi")) out.push("catalog_feed");
  if (has(e, "manual_download") || (has(e, "pro_portal") && has(e, "manual_download"))) out.push("portal_export");
  if (has(e, "manual_download", "email_pricelist", "pro_portal", "feed", "public_catalog") || e.proAccountRequired) out.push("manual_import");
  if (has(e, "api") && !CONNECTOR_BY_KEY[e.key]) out.push("custom_development");
  if (e.proAccountRequired) out.push("pro_account_first");
  const automatable = out.some((m) => m !== "pro_account_first");
  if (!automatable) out.push("not_automatable");
  return [...new Set(out)];
}

export function reliabilityOf(verificationLevel: string): Reliability {
  if (verificationLevel === "server_verified" || verificationLevel.startsWith("official_docs")) return "confirmed";
  if (verificationLevel.startsWith("official_page") || verificationLevel.startsWith("third_party_docs")) return "announced";
  return "inferred";
}

export function integrationStatusOf(e: RegistryEntryInput, methods: AccessMethod[], facts: RegistryOrgFacts): IntegrationStatus {
  if (ABANDONED[e.key]) return "abandoned";
  if (facts.connectionOk || facts.imported || facts.publicActive) return "connected_tested";
  if (facts.connectionPending) return "in_progress";
  if (methods.includes("public_integrated")) return "public_available";
  if (methods.includes("official_api")) return e.proAccountRequired ? "pro_account_required" : "api_to_integrate";
  if (methods.includes("catalog_feed")) return e.proAccountRequired ? "pro_account_required" : "feed_to_integrate";
  if (methods.includes("custom_development")) return "commercial_access_needed";
  if (methods.includes("portal_export") || has(e, "email_pricelist")) return e.proAccountRequired ? "pro_account_required" : "file_import";
  if (has(e, "public_catalog")) return "file_import";
  if (methods.includes("not_automatable") && has(e, "email_quote")) return "commercial_access_needed";
  if (e.proAccountRequired) return "pro_account_required";
  return "not_automatable";
}

export interface PriorityBreakdown {
  score: number;
  tier: "A" | "B" | "C";
  reasons: string[];
}

/**
 * Priorité d'intégration (0–100). Pondération explicite :
 * marché français 25 · notoriété 15 · couverture produit 12 · accès aux prix pro 12 ·
 * facilité technique 20 · qualité de l'information 8 · cœur de métier (reconditionné, pièces) 10 −
 * écarté. Ce n'est PAS une mesure de compétitivité des prix.
 */
export function priorityOf(e: RegistryEntryInput): PriorityBreakdown {
  const reasons: string[] = [];
  let s = 0;
  if (ABANDONED[e.key]) return { score: 0, tier: "C", reasons: ["Écarté (conditions d'utilisation)."] };
  if (e.country === "FR") {
    s += 15;
    reasons.push("Fournisseur français");
  }
  if (e.deliveryZones.some((z) => z === "FR" || z === "EU")) {
    s += 10;
    reasons.push("Livre la France");
  }
  if (MAJOR_BRANDS.has(e.key)) {
    s += 15;
    reasons.push("Acteur de référence");
  }
  s += Math.min(4, e.categories.length) * 3;
  if (e.proAccountRequired || has(e, "api", "feed", "edi")) {
    s += 12;
    reasons.push("Prix professionnels");
  } else if (has(e, "public_catalog")) s += 4;
  if (CONNECTOR_BY_KEY[e.key]) {
    s += 20;
    reasons.push("Connecteur MON STOCK disponible");
  } else if (has(e, "feed", "edi")) {
    s += 14;
    reasons.push("Flux de catalogue");
  } else if (has(e, "api")) {
    s += 8;
    reasons.push("API annoncée");
  } else if (has(e, "manual_download", "email_pricelist")) {
    s += 8;
    reasons.push("Liste de stock exportable");
  } else if (has(e, "pro_portal", "public_catalog")) s += 3;
  const rel = reliabilityOf(e.verificationLevel);
  s += rel === "confirmed" ? 8 : rel === "announced" ? 5 : 2;
  if (e.segment === "A_refurb" || e.segment === "B_parts") s += 10;
  else if (e.segment === "D_distributor") s += 6;
  else if (e.segment === "E_specialist") s += 5;
  else s += 4;
  const score = Math.max(0, Math.min(100, Math.round(s)));
  return { score, tier: score >= 65 ? "A" : score >= 45 ? "B" : "C", reasons };
}

export type PrimaryActionKind = "sync" | "connect_api" | "add_feed" | "import_catalog" | "activate_public" | "get_pro_access" | "open_site" | "none";

export interface PrimaryAction {
  kind: PrimaryActionKind;
  label: string;
  /** ce que l'utilisateur pourra faire ensuite */
  outcome: string;
}

/** Action principale cohérente avec le mode d'accès RÉEL (jamais un faux « Connecter »). */
export function primaryActionOf(input: { status: IntegrationStatus; methods: AccessMethod[]; connected: boolean; hasConnection: boolean }): PrimaryAction {
  const { status, methods } = input;
  if (status === "abandoned") return { kind: "open_site", label: "Ouvrir le site fournisseur", outcome: "Consultation sur leur site uniquement : leurs conditions interdisent l'automatisation." };
  if (input.hasConnection) return { kind: "sync", label: "Synchroniser mes prix", outcome: "Récupère les prix et stocks de votre compte dans MON STOCK." };
  if (methods.includes("official_api")) return { kind: "connect_api", label: "Configurer l'API", outcome: "Avec vos identifiants API, vos prix et stocks arrivent automatiquement dans la recherche." };
  if (methods.includes("public_integrated") && !input.connected) return { kind: "activate_public", label: "Activer le catalogue public", outcome: "Ses produits publics apparaissent dans vos recherches, avec le lien vers chaque fiche." };
  if (status === "pro_account_required" && !input.connected) return { kind: "get_pro_access", label: "Obtenir l'accès professionnel", outcome: "Ouvrez votre compte revendeur ; vous pourrez ensuite importer vos prix pro." };
  if (methods.includes("catalog_feed")) return { kind: "add_feed", label: "Ajouter mon flux", outcome: "Collez le lien du flux fourni par le fournisseur : le catalogue se met à jour automatiquement." };
  if (methods.includes("manual_import") || methods.includes("portal_export")) return { kind: "import_catalog", label: "Importer mon catalogue", outcome: "Importez la liste de stock reçue ou exportée : vos prix rejoignent la comparaison." };
  if (status === "commercial_access_needed") return { kind: "get_pro_access", label: "Demander l'accès", outcome: "E-mail de demande prêt : l'intégration sera possible après réception des accès." };
  return { kind: "open_site", label: "Ouvrir le site fournisseur", outcome: "Aucune intégration automatisable aujourd'hui : consultation sur leur site." };
}

export const SEGMENT_LABEL: Record<string, string> = {
  A_refurb: "Reconditionné & occasion",
  B_parts: "Pièces détachées",
  C_liquidation: "Lots & déstockage",
  D_distributor: "Distribution & neuf",
  E_specialist: "Spécialistes",
};
