/**
 * Fiches d'intégration des grossistes étudiés le 12/10/2026 (mission « sourcing B2B »).
 *
 * Source des informations : extraits indexés des sites officiels. Les pages n'ont pas pu être
 * ouvertes depuis l'environnement de recherche. Rien n'est présenté comme vérifié tant qu'un accès
 * réel n'a pas été testé avec les identifiants du revendeur.
 */

export type B2BMethod =
  /** lien de flux (CSV / XML / JSON) fourni par le fournisseur → « Ajouter un flux autorisé » */
  | "remote_feed"
  /** fichier Excel / CSV transmis ou téléchargé → « Importer un fichier » */
  | "file_import"
  /** portail web uniquement : export à demander, sinon saisie */
  | "portal_only"
  /** aucun accès automatisé autorisé : saisie manuelle ou fichier fourni explicitement */
  | "manual_only";

export type AutomationStance = "on_agreement" | "forbidden" | "unknown";

export interface B2BProfile {
  method: B2BMethod;
  /** méthode de secours si la principale n'est pas obtenue */
  fallback: B2BMethod | null;
  automation: AutomationStance;
  /** ce qu'il faut obtenir du fournisseur pour activer l'intégration */
  activation: string;
  /** questions précises à poser (reprises dans l'e-mail de demande d'accès) */
  questions: string[];
  /** annonce non vérifiée (extraits de recherche) */
  evidence: "search_snippets";
  checkedAt: string;
}

export const B2B_PROFILES: Record<string, B2BProfile> = {
  thephonehub: {
    method: "remote_feed",
    fallback: "file_import",
    automation: "on_agreement",
    activation: "Lien CSV partenaire (ou clés API) envoyé par l'équipe commerciale ; à ajouter dans Sources → « Ajouter un flux autorisé ».",
    questions: [
      "Le lien feed.thephonehub.eu/stocklist.csv est-il public, ou faut-il un lien ou un jeton propre à chaque partenaire ?",
      "Colonnes exactes du CSV : SKU, EAN, modèle, capacité, couleur, état (neuf / reconditionné), grade, quantité, prix unitaire, devise, MOQ, entrepôt, régime de TVA ?",
      "Séparateur, encodage et fréquence de mise à jour du CSV.",
      "Documentation de l'API (/v1/stock) : URL de base, authentification, limites de débit, pagination, environnement de test.",
      "L'usage automatisé du flux dans notre outil interne est-il autorisé par vos conditions ?",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
  distrihub: {
    method: "remote_feed",
    fallback: "file_import",
    automation: "on_agreement",
    activation: "Compte acheteur validé, puis URL du flux (CSV ou XML) limité aux smartphones.",
    questions: [
      "Schéma du flux acheteur (CSV / XML / JSON) : EAN, SKU fournisseur, état, grade, quantité, prix, devise, MOQ fournisseur, pays d'expédition, délai ?",
      "Le flux indique-t-il le distributeur ou l'entrepôt d'origine ? Peut-on filtrer par pays d'expédition et par état ?",
      "Proposez-vous du reconditionné ou de l'occasion gradée en smartphones ?",
      "Fréquence de rafraîchissement, authentification et limites de l'API.",
      "Conditions en vigueur : minimum de 300 € par commande, frais de 39 € sous 1 500 €, livraison vers la France.",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
  foxway: {
    method: "file_import",
    fallback: "portal_only",
    automation: "unknown",
    activation: "Compte revendeur, puis export Excel de la stocklist (ou des lots) importé dans MON STOCK. Le mapping est mémorisé après le premier import.",
    questions: [
      "Existe-t-il un export de la stocklist complète (CSV, XLSX, XML) ou un flux / une API revendeur via l'account manager ?",
      "Colonnes de l'export : identifiant d'offre ou de lot unique, SKU, modèle, capacité, couleur, grade, quantité, prix, devise, entrepôt.",
      "Les identifiants restent-ils stables d'un export à l'autre ? Fréquence de mise à jour ?",
      "Livraison en France : délais, coût, incoterm, TVA (marge ou autoliquidation).",
      "Le minimum de 2 000 € s'applique-t-il par commande ou par ligne ?",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
  "mobile-depot-europe": {
    method: "file_import",
    fallback: "portal_only",
    automation: "unknown",
    activation: "Liste de stock reçue par e-mail ou téléchargée (XLSX / CSV de préférence) importée dans MON STOCK. Le PDF n'est pas pris en charge : demandez un format tableur.",
    questions: [
      "Format exact des listes (XLSX, CSV, PDF) et liste des colonnes.",
      "Existe-t-il une URL stable (CSV / XML) pour récupérer la liste quotidienne automatiquement ?",
      "La mise à jour est-elle quotidienne ou hebdomadaire ?",
      "MOQ par catégorie et frais de livraison vers la France.",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
  smartchoice: {
    method: "portal_only",
    fallback: "file_import",
    automation: "unknown",
    activation: "Demander un export (CSV / XLSX) ou un lien de flux de la page stock ; à défaut, saisie manuelle.",
    questions: [
      "Pouvez-vous fournir un export (CSV ou XLSX) ou une URL de flux de votre page stock avec les prix revendeur ?",
      "Champs disponibles : modèle, capacité, couleur, grade, santé de la batterie, quantité, prix, régime de TVA.",
      "Les identifiants d'offre sont-ils stables ? Fréquence de mise à jour ?",
      "L'accès automatisé à votre page stock avec nos identifiants est-il autorisé ?",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
  "refreshed-apples": {
    method: "remote_feed",
    fallback: "file_import",
    automation: "on_agreement",
    activation: "Avec l'accord écrit du fournisseur : lien d'export CSV du Google Sheet de prix, ajouté comme flux autorisé. La source publique existante reste disponible.",
    questions: [
      "Pouvez-vous partager le Google Sheet de prix en lecture et nous autoriser par écrit à le lire automatiquement (export CSV programmé) ?",
      "Colonnes du Sheet : modèle, capacité, couleur, grade, batterie, quantité, prix, devise, version UE ?",
      "Fréquence de mise à jour du Sheet par rapport à deals.refreshedapples.com.",
      "Conditions de la commande d'essai et livraison en France (TVA sur marge).",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
  utopya: {
    method: "manual_only",
    fallback: null,
    automation: "forbidden",
    activation: "Aucune synchronisation : les CGV (article 14) interdisent tout accès automatisé, sauf API officielle sous contrat écrit. Saisie manuelle des offres ou fichier explicitement fourni par Utopya.",
    questions: [
      "Proposez-vous un contrat d'API officiel (exception prévue à l'article 14 de vos CGV) pour un revendeur client ? À quelles conditions ?",
      "À défaut, envoyez-vous une liste de prix professionnelle périodique ?",
      "Un outil d'aide à l'achat interne, non destiné à des tiers, entre-t-il dans les activités exclues de vos CGV ?",
    ],
    evidence: "search_snippets",
    checkedAt: "2026-10-12",
  },
};

export const B2B_METHOD_LABEL: Record<B2BMethod, string> = {
  remote_feed: "Flux distant autorisé (lien CSV / XML / JSON)",
  file_import: "Import de fichier (Excel / CSV)",
  portal_only: "Portail web uniquement",
  manual_only: "Manuel uniquement",
};

export const AUTOMATION_LABEL: Record<AutomationStance, string> = {
  on_agreement: "Automatisation possible avec l'accord du fournisseur",
  forbidden: "Accès automatisé interdit par les conditions du fournisseur",
  unknown: "Conditions d'automatisation à demander",
};
