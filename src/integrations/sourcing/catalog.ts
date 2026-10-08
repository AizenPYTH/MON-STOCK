/**
 * =============================================================================
 * CATALOGUE DES SOURCES CANDIDATES du moteur de sourcing — données uniquement.
 *
 * Ce fichier ne fait AUCUN appel réseau. Il transcrit fidèlement les fiches de
 * docs/sourcing-sources.md (recherche du 2026-10-07, restreinte aux domaines
 * officiels, pages NON ouvertes : extraits indexés uniquement). Règles :
 *   - rien n'est inventé : « À vérifier » / « Non trouvé » dans la fiche → "unknown" / null ;
 *   - aucune montée de confiance : le statut reprend celui de la fiche ;
 *   - la vérification HTTP réelle (statut, robots.txt, signaux de plateforme) est
 *     produite par `npm run sources:verify` (scripts/verify-sources.ts) depuis une
 *     machine disposant d'un accès réseau.
 * =============================================================================
 */

export type YesNoUnknown = "yes" | "no" | "unknown";

/** Visibilité des prix sans connexion. */
export type PricePublic = "yes" | "no" | "after_login" | "unknown";

/** Accès automatisé (robots / scripts) tel que documenté par la source elle-même. */
export type AutomationAllowed = "yes" | "no" | "unknown" | "forbidden_by_terms";

/** Classe d'intégration (voir docs/sourcing-sources.md, section 2). */
export type IntegrationMethod =
  | "PUBLIC_WEB"
  | "API"
  | "FEED"
  | "SUPPLIER_ACCOUNT"
  | "PARTNER_FEED"
  | "MANUAL"
  | "NOT_INTEGRABLE";

/** Adaptateur générique pressenti (null = adaptateur dédié ou pas d'automatisation). */
export type SuggestedAdapter =
  | "jsonld-public"
  | "shopify-storefront"
  | "woocommerce-store"
  | "google-merchant-feed"
  | "bigbuy"
  | "ingram-micro"
  | null;

/** Niveau de confiance de la fiche (jamais relevé par ce fichier). */
export type CatalogStatus = "verified_official_snippets" | "partial" | "unverified" | "not_integrable";

export interface CatalogVerification {
  lastCheckedAt: "2026-10-07";
  checkedFrom: "search_snippets_official_domain";
  pageOpened: false;
  robotsChecked: false;
  /** précisions issues de la fiche (ce qui a été lu, ce qui reste à vérifier) */
  notes: string;
}

export interface CatalogSource {
  /** identifiant stable (kebab-case) */
  key: string;
  name: string;
  /** URL officielle principale (page d'accueil ou portail B2B) */
  url: string;
  category: string[];
  country: string;
  pricePublic: PricePublic;
  /** null = non trouvé dans les extraits officiels */
  accountRequired: boolean | null;
  api: YesNoUnknown;
  apiDocsUrl?: string;
  feed: YesNoUnknown;
  stockVisible: YesNoUnknown;
  automationAllowed: AutomationAllowed;
  termsNote?: string;
  integrationMethod: IntegrationMethod;
  suggestedAdapter: SuggestedAdapter;
  status: CatalogStatus;
  /** section de docs/sourcing-sources.md */
  docSection: string;
  verification: CatalogVerification;
}

const VERIFIED_FROM_SNIPPETS = {
  lastCheckedAt: "2026-10-07",
  checkedFrom: "search_snippets_official_domain",
  pageOpened: false,
  robotsChecked: false,
} as const;

function v(notes: string): CatalogVerification {
  return { ...VERIFIED_FROM_SNIPPETS, notes };
}

export const SOURCING_CATALOG: readonly CatalogSource[] = [
  // ---------------------------------------------------------------------------
  // 4. Reconditionné et B2B « refurbished » (France / Europe)
  // ---------------------------------------------------------------------------
  {
    key: "backmarket-pro",
    name: "Back Market Pro",
    url: "https://pro.backmarket.fr/",
    category: ["smartphones", "laptops", "tablettes", "accessoires"],
    country: "FR / UK / US",
    pricePublic: "unknown",
    accountRequired: true,
    api: "no",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote:
      "CGU Back Market : interdiction des « software, devices, scripts, robots or any other means or process (including web crawlers…) » pour du web scraping. Pas d'API côté acheteur (API vendeur uniquement).",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.1",
    verification: v(
      "Compte réservé aux professionnels (n° TVA intracommunautaire). Affichage des prix avant connexion : À vérifier. Flux CSV/XML : non trouvé. Volume : canal MANUAL (sourcing accompagné).",
    ),
  },
  {
    key: "foxway",
    name: "Foxway (Reseller Store + Wholesale)",
    url: "https://resellers.foxway.com/",
    category: ["smartphones", "tablettes", "laptops", "wearables", "accessoires"],
    country: "EU (Wholesale : ex-works UK)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "unknown",
    termsNote: "CGV du Reseller Portal : compte requis, mot de passe strictement personnel. Clause scraping explicite : non trouvée.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.2",
    verification: v(
      "« Real-time prices and on-site checkout » après création de compte ; « real-time stock visibility ». Wholesale : deals « take-all » décrits dans un tableur (manuel), feed structuré À vérifier. API : À vérifier.",
    ),
  },
  {
    key: "refurbed-business",
    name: "refurbed Business",
    url: "https://business.refurbed.de/",
    category: ["smartphones", "laptops", "tablettes", "écrans"],
    country: "DE / AT (+ IE) ; FR : À vérifier",
    pricePublic: "yes",
    accountRequired: true,
    api: "unknown",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "AGB B2B : devis et listes de prix non contraignants. Clause scraping : non trouvée.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.3",
    verification: v(
      "Prix B2C publics ; offre B2B sur devis par e-mail (MOQ 15 appareils identiques), pas de portail de commande automatisé trouvé. API : non trouvée. Portail business FR : À vérifier.",
    ),
  },
  {
    key: "largo",
    name: "Largo (Largo Business)",
    url: "https://www.largo.fr/",
    category: ["smartphones", "tablettes", "ordinateurs", "accessoires"],
    country: "FR / BE / CH",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'accès automatisé : non trouvées.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "4.4",
    verification: v(
      "Extranet distributeurs : « accès en temps réel au stock disponible, saisie de commande simplifiée ». API et flux : À vérifier. Conditions exactes du compte (Kbis, validation) : À vérifier. PARTNER_FEED si Largo fournit un export.",
    ),
  },
  {
    key: "recommerce",
    name: "Recommerce",
    url: "https://www.recommerce.com/fr/",
    category: ["smartphones"],
    country: "EU (20 pays)",
    pricePublic: "no",
    accountRequired: null,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'accès automatisé : non trouvées.",
    integrationMethod: "PARTNER_FEED",
    suggestedAdapter: null,
    status: "partial",
    docSection: "4.5",
    verification: v(
      "Prix B2C publics sur recommerce.com ; B2B via distributeurs/opérateurs/partenariat, pas de portail ouvert trouvé. API / flux : non trouvés. Compte : À vérifier (contact commercial).",
    ),
  },
  {
    key: "smaaart",
    name: "SMAAART",
    url: "https://smaaart.fr/",
    category: ["smartphones", "ordinateurs", "tablettes"],
    country: "FR",
    pricePublic: "unknown",
    accountRequired: null,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "partial",
    docSection: "4.6",
    verification: v(
      "Prix B2C publics ; programme revendeurs / tarifs pro : À vérifier. API / flux : non trouvés. Alternative : PARTNER_FEED après qualification commerciale.",
    ),
  },
  {
    key: "ab-business",
    name: "AB Business",
    url: "https://www.abbusiness.fr/",
    category: ["smartphones", "tablettes", "accessoires"],
    country: "FR",
    pricePublic: "unknown",
    accountRequired: null,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU : À vérifier.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "partial",
    docSection: "4.7",
    verification: v(
      "Grossiste téléphonie (neuf + reconditionné). Visibilité des prix avant compte non confirmée ; conditions pro non trouvées ; API / flux non trouvés. SUPPLIER_ACCOUNT probable, à confirmer.",
    ),
  },

  // ---------------------------------------------------------------------------
  // 5. Distributeurs IT et mobilité
  // ---------------------------------------------------------------------------
  {
    key: "ingram-micro-fr",
    name: "Ingram Micro France",
    url: "https://fr.ingrammicro.eu/",
    category: ["informatique", "mobilité", "accessoires"],
    country: "FR",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://developer.ingrammicro.com/reseller",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote:
      "Terms of Use couvrant les API : accès « solely within the applicable country for your account(s) », apps abusives révoquées. Pas de clause anti-scraping spécifique trouvée (l'API est la voie officielle).",
    integrationMethod: "API",
    suggestedAdapter: "ingram-micro",
    status: "verified_official_snippets",
    docSection: "5.1",
    verification: v(
      "Reseller APIs v6 (catalogue, prix & disponibilité ≤ 50 SKU/appel, stock par entrepôt), sans frais, accès avec n° client / Partner ID. Listes de prix / EDI : À vérifier. Pièces d'ouverture de compte : À vérifier.",
    ),
  },
  {
    key: "td-synnex-fr",
    name: "TD SYNNEX France",
    url: "https://fr.tdsynnex.com/",
    category: ["informatique"],
    country: "FR / EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://developer.api.tdsynnex.com/eu",
    feed: "unknown",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via l'API officielle (Developer Portal). CGU hors API : À vérifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.2",
    verification: v(
      "Developer Portal EU : REST APIs produits, prix, disponibilité, commandes ; sandbox, Swagger. Compte revendeur (RIB, Kbis < 3 mois, DBE-S1, n° TVA, SIRET…). EDI : probable, non confirmé.",
    ),
  },
  {
    key: "also-fr",
    name: "ALSO France",
    url: "https://www.also.com/ec/cms5/fr_2000/2000/",
    category: ["informatique"],
    country: "FR / EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://www.also.com/ec/cms5/de_1010/1010/services/it-services/edi-und-xml-integration/index.jsp",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via flux SFTP / EDI-XML du groupe. CGV (section Documentation) : À vérifier.",
    integrationMethod: "FEED",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.3",
    verification: v(
      "Groupe : intégration XML/EDI (commande XML ou requête HTTP vers l'ERP), « SFTP price lists », contenu 1WorldSync quotidien. Disponibilité exacte pour la filiale France : À vérifier. Webshop : disponibilité et prix d'achat en temps réel après compte.",
    ),
  },
  {
    key: "exertis-fr",
    name: "Exertis France",
    url: "https://www.exertis.fr/",
    category: ["informatique", "gaming", "mobilité", "audio-vidéo"],
    country: "FR",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://exertis.fr/web-services.php",
    feed: "yes",
    stockVisible: "unknown",
    automationAllowed: "yes",
    termsNote: "Via « PriceCAT feeds » et EDI (page web-services). CGU hors flux : À vérifier.",
    integrationMethod: "FEED",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.4",
    verification: v(
      "API = EDI (commandes). Flux PriceCAT : format exact À vérifier. Ouverture de compte : CGV signées, Kbis < 3 mois, RIB, papier en-tête, CNI du gérant.",
    ),
  },
  {
    key: "westcoast-uk",
    name: "Westcoast",
    url: "https://www.westcoast.co.uk/",
    category: ["informatique", "composants"],
    country: "UK (FR : À vérifier)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://www.westcoast.co.uk/what-we-do/Electronic_Trading.html",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via XML Portal / EDI (EDIFact, Tradacoms, BOSS XML, cXML). CGU hors API : À vérifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.5",
    verification: v(
      "« XML Portal » (stock, prix, commandes) ; feed par marque configurable par l'account manager. Compte : Cash with Order ou crédit. Site FR officiel : À vérifier.",
    ),
  },
  {
    key: "komsa-de",
    name: "KOMSA",
    url: "https://komsa.com/",
    category: ["smartphones", "accessoires", "informatique"],
    country: "DE (FR : À vérifier)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://komsa.com/en/downloads/edi/interfaces-at-komsa",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via webservice REST authentifié et EDI (XML/JSON, SFTP). CG easydata (PDF) : À vérifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.6",
    verification: v(
      "Webservice de disponibilité temps réel (GET partner.komsa.de/api/v1/product/[article]) ; EDI complet XML/JSON via webservice ou SFTP ; données articles easydata. Compte après vérification société + solvabilité (KARLO). Livraison France : À vérifier.",
    ),
  },
  {
    key: "brodos-de",
    name: "Brodos AG",
    url: "https://brodos.com/",
    category: ["smartphones", "tablettes", "accessoires"],
    country: "DE (intl. possible)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://forms.brodos.com/brodos-developer-area/",
    feed: "yes",
    stockVisible: "unknown",
    automationAllowed: "yes",
    termsNote: "Via les API documentées (Developer Area) et openTRANS XML. CGU hors API : À vérifier.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "5.7",
    verification: v(
      "Activate API, Customer API, Marketplace OFFER API, Article Master Data API, commandes openTRANS XML ; identifiants de test via account manager. Livraison France : À vérifier.",
    ),
  },

  // ---------------------------------------------------------------------------
  // 6. Déstockage, liquidation, enchères B2B
  // ---------------------------------------------------------------------------
  {
    key: "stocklear",
    name: "Stocklear",
    url: "https://stocklear.fr/",
    category: ["retours clients", "invendus", "téléphonie"],
    country: "FR (+ EU)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'accès automatisé : non trouvées. Automatisation à confirmer avec Stocklear.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.1",
    verification: v(
      "« Only certified accounts… have access to offers and the ability to bid and purchase ». Compte pro validé manuellement (SIRET, Kbis < 1 an, TVA). API / flux : À vérifier.",
    ),
  },
  {
    key: "destockplus",
    name: "Destockplus",
    url: "https://www.destockplus.com/",
    category: ["lots", "téléphonie", "déstockage"],
    country: "FR",
    pricePublic: "yes",
    accountRequired: false,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote:
      "CGV : interdiction de programmes visant à endommager ou intercepter clandestinement les systèmes/données ; clause spécifique robots/scraping : non trouvée. robots.txt à lire avant toute automatisation.",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "verified_official_snippets",
    docSection: "6.2",
    verification: v(
      "Annonces publiques (consultation sans compte), prix affichés ou « sur demande » selon l'annonceur. « Flux d'annonces » = flux entrant pour les vendeurs, pas de flux sortant acheteurs. Qualité hétérogène.",
    ),
  },
  {
    key: "merkandi",
    name: "Merkandi",
    url: "https://merkandi.fr/",
    category: ["surstocks", "retours", "reconditionné", "électronique"],
    country: "EU / monde",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Clause robots/scraping : non trouvée dans les extraits des conditions. Automatisation à confirmer par écrit avec Merkandi.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.3",
    verification: v(
      "Abonnement annuel payant (STANDARD 239 € HT, PREMIUM 279 € HT). Particuliers et entreprises acceptés comme acheteurs. API / flux : non trouvés (import d'offres côté vendeur uniquement).",
    ),
  },
  {
    key: "bstock-europe",
    name: "B-Stock (Europe / Amazon EU / France)",
    url: "https://bstock.com/auctions/europe/",
    category: ["électronique", "mobiles (grades A–D)", "retours Amazon"],
    country: "EU / UK",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote:
      "Terms of Use : interdiction de « any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means, to access, collect, copy or record the Services ».",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.4",
    verification: v(
      "Enchères après compte (business license + n° TVA ; Amazon EU : virement uniquement). API / flux : non trouvés. Alternative : alertes natives du compte vendeur ; PARTNER_FEED sur accord écrit.",
    ),
  },
  {
    key: "eurolots",
    name: "Eurolots",
    url: "https://www.eurolots.com/en",
    category: ["électronique", "lots mixtes"],
    country: "EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'accès automatisé : À vérifier.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.5",
    verification: v("« Company registration is mandatory », revue manuelle de chaque candidature ; minimum 100 € par commande. API / flux : À vérifier."),
  },
  {
    key: "wholesale-clearance-uk",
    name: "Wholesale Clearance UK",
    url: "https://www.wholesaleclearance.co.uk/",
    category: ["électronique", "lots", "déstockage"],
    country: "UK",
    pricePublic: "yes",
    accountRequired: false,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote:
      "Conditions du site : interdiction de « automated software, process, program, robot, web crawler, spider, data mining, trawling or 'screen scraping' software ».",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "6.6",
    verification: v("Prix publics ; achats réputés professionnels (B2B basis), pas de société/TVA requise ; paiement intégral avant expédition. Import FR post-Brexit à prévoir."),
  },
  {
    key: "gem-wholesale",
    name: "Gem Wholesale",
    url: "https://www.gemwholesale.co.uk/",
    category: ["électroménager", "électronique domestique"],
    country: "UK",
    pricePublic: "yes",
    accountRequired: null,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Clause robots : non trouvée.",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "verified_official_snippets",
    docSection: "6.7",
    verification: v("Prix publics HT, minimum £250 + VAT, « trade only » (modalités de compte non trouvées). Faible pertinence pour le périmètre smartphones."),
  },
  {
    key: "solostocks",
    name: "SoloStocks",
    url: "https://www.solostocks.fr/",
    category: ["téléphonie", "informatique", "multi-secteurs"],
    country: "ES / FR / EU / LATAM",
    pricePublic: "yes",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Conditions non indexées : clause d'accès automatisé non trouvée. Ne pas automatiser avant lecture des CGU.",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "partial",
    docSection: "6.8",
    verification: v("Prix publics sur annonces (selon vendeur) ; inscription préalable pour négocier avec les fournisseurs. API / flux : non trouvés."),
  },

  // ---------------------------------------------------------------------------
  // 7. Brokers, marketplaces B2B avec API, plateformes US/Asie
  // ---------------------------------------------------------------------------
  {
    key: "brokerbin",
    name: "BrokerBin",
    url: "https://brokerbin.com/",
    category: ["pièces IT", "systèmes IT", "télécom/réseau"],
    country: "Monde",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction de « mining, harvesting, or scripting any data » ; « robot, spider, scraper, or other automated means… without express written permission ».",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.1",
    verification: v("Bourse « members-only » (plans 1 599 à 3 750 $/an, vérification par account manager). API / flux : non trouvés. Smartphones : marginal."),
  },
  {
    key: "gsmexchange",
    name: "gsmExchange",
    url: "https://www.gsmexchange.com/",
    category: ["smartphones en gros", "accessoires"],
    country: "Monde (Dublin)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction de « systematic retrieval of site content… through robots, spiders, automatic devices or manual processes » ; partage d'identifiants = résiliation.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.2",
    verification: v("Membres vérifiés : 100–500 terminaux min. par transaction, > 1 an d'expérience, 2 références commerciales, preuve TVA. Frais de transaction sur le trading floor."),
  },
  {
    key: "handelot",
    name: "Handelot",
    url: "https://www.handelot.com/",
    category: ["mobiles", "tablettes", "consoles", "TV", "informatique"],
    country: "Monde (Pologne)",
    pricePublic: "after_login",
    accountRequired: true,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU / clause d'accès automatisé : non trouvées.",
    integrationMethod: "SUPPLIER_ACCOUNT",
    suggestedAdapter: null,
    status: "partial",
    docSection: "7.3",
    verification: v("Niveaux VIP / VIP Gold / Junior ; 2 références commerciales, > 1 an d'activité. Tarif d'adhésion : non trouvé. API / flux : non trouvés."),
  },
  {
    key: "amazon-business-fr",
    name: "Amazon Business (FR)",
    url: "https://business.amazon.fr/",
    category: ["smartphones", "informatique", "tout"],
    country: "FR / EU",
    pricePublic: "after_login",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://developer-docs.amazon.com/amazon-business/docs/product-search-api-overview",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote:
      "CGU : interdiction sans consentement écrit des « data mining, robots, or similar data gathering and extraction tools » et de constituer une base de données de prix. Seule voie : Product Search API sur approbation (rôles attribués par Amazon Business).",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.4",
    verification: v("Prix pro après compte Business gratuit et vérifié (SIRET/TVA). Product Search API (searchProducts, getProductsByAsins ≤ 30 ASIN) après questionnaire d'onboarding. Sans approbation : SUPPLIER_ACCOUNT sans automatisation."),
  },
  {
    key: "ebay-browse-api",
    name: "eBay (Browse API)",
    url: "https://developer.ebay.com/api-docs/buy/browse/overview.html",
    category: ["smartphones", "lots", "tout"],
    country: "FR / EU / monde",
    pricePublic: "yes",
    accountRequired: false,
    api: "yes",
    apiDocsUrl: "https://developer.ebay.com/api-docs/buy/browse/overview.html",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote:
      "CGU eBay.fr : robots, spiders, scrapers et data mining interdits hors API ; robots.txt : accès automatisé interdit sauf moteurs de recherche ; licence API : « market research » et contournement des limites interdits.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.5",
    verification: v("Browse API (token applicatif, 5 000 appels/jour par défaut) ; Buy APIs en Limited Release : production réservée aux partenaires EPN après « Application Growth Check ». Aucun scraping HTML."),
  },
  {
    key: "bigbuy",
    name: "BigBuy",
    url: "https://www.bigbuy.eu/fr/",
    category: ["électronique", "informatique", "accessoires"],
    country: "EU (Espagne)",
    pricePublic: "unknown",
    accountRequired: true,
    api: "yes",
    apiDocsUrl: "https://api.bigbuy.eu/rest/doc",
    feed: "yes",
    stockVisible: "yes",
    automationAllowed: "yes",
    termsNote: "Via API REST et fichiers CSV/XML/FTP (voie officielle). Clause scraping : non trouvée.",
    integrationMethod: "API",
    suggestedAdapter: "bigbuy",
    status: "verified_official_snippets",
    docSection: "7.6",
    verification: v(
      "API REST/JSON réservée aux packs Ecommerce ou supérieurs (tarif À vérifier) ; CSV/XML avec code, EAN, prix distributeur, PVC, stock ; FTP sur demande. Visibilité des prix avant compte : À vérifier. Présence de smartphones de marque : À vérifier.",
    ),
  },
  {
    key: "cdiscount-pro",
    name: "CdiscountPro",
    url: "https://www.cdiscountpro.com/",
    category: ["informatique", "téléphonie"],
    country: "FR",
    pricePublic: "yes",
    accountRequired: false,
    api: "unknown",
    feed: "unknown",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "CGU : À vérifier (non lues).",
    integrationMethod: "PUBLIC_WEB",
    suggestedAdapter: "jsonld-public",
    status: "partial",
    docSection: "7.7",
    verification: v("Prix publics affichés HT (> 100 000 références) ; conditions de commande/compte : À vérifier. API / flux : non trouvés. Prix de détail pro, pas de prix de gros."),
  },
  {
    key: "alibaba",
    name: "Alibaba.com",
    url: "https://www.alibaba.com/",
    category: ["électronique", "tout"],
    country: "Asie / monde",
    pricePublic: "yes",
    accountRequired: false,
    api: "yes",
    apiDocsUrl: "https://openapi.alibaba.com/doc/doc.htm",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote:
      "CGU : « Systematic retrieval of Site Content… (whether through robots, spiders, automatic devices or manual processes) without written permission » interdit. Seule voie : Open Platform sur approbation.",
    integrationMethod: "API",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.8",
    verification: v("Fourchettes de prix indicatives publiques (MOQ), prix réels négociés. Open Platform : inscription développeur, OAuth, accès « scoped to approved business partners ». Sans accès : MANUAL."),
  },
  {
    key: "global-sources",
    name: "Global Sources",
    url: "https://www.globalsources.com/",
    category: ["électronique grand public", "mobile"],
    country: "Asie / monde (Hong Kong)",
    pricePublic: "no",
    accountRequired: true,
    api: "unknown",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote:
      "CGU : usage limité à des « non-substantial portions… for personal or internal and non-commercial purposes », reproduction/réutilisation interdite sans permission écrite ; clause robots explicite : non trouvée.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.9",
    verification: v("Prix sur demande (inquiries) ; inscription gratuite. API / flux : non trouvés."),
  },
  {
    key: "liquidation-com",
    name: "Liquidation.com",
    url: "https://www.liquidation.com/",
    category: ["électronique", "mobiles", "retours"],
    country: "US",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "User Agreement : interdiction des « spiders, crawlers, robots or any other similar means… data-mining ».",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.10",
    verification: v("Compte gratuit ; acheteurs internationaux : virement uniquement ; export à la charge de l'acheteur. Priorité basse."),
  },
  {
    key: "direct-liquidation",
    name: "Direct Liquidation",
    url: "https://www.directliquidation.com/",
    category: ["électronique", "retours"],
    country: "US",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction de « robot, spider, data miner, wanderer, crawler or any other automatic or manual device or process to copy or monitor ».",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.11",
    verification: v("Compte (nom, e-mail, téléphone, société) ; pas d'expédition internationale gérée. Priorité basse."),
  },
  {
    key: "via-trading",
    name: "Via Trading",
    url: "https://www.viatrading.com/",
    category: ["électronique", "retours"],
    country: "US (export)",
    pricePublic: "yes",
    accountRequired: false,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "forbidden_by_terms",
    termsNote: "Terms : interdiction sans permission écrite des « automated tools to scrape, copy or download listings, manifests, images or pricing » ; republication des manifestes interdite.",
    integrationMethod: "MANUAL",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.12",
    verification: v("Prix publics, « no membership fee and no minimum dollar order », aucune licence/société requise ; minimum un carton, une palette ou un camion. Priorité basse."),
  },
  {
    key: "888lots",
    name: "888 Lots",
    url: "https://888lots.com/",
    category: ["électronique", "mobiles"],
    country: "US uniquement",
    pricePublic: "after_login",
    accountRequired: true,
    api: "no",
    feed: "no",
    stockVisible: "unknown",
    automationAllowed: "unknown",
    termsNote: "Non applicable : « does not accept international customers ».",
    integrationMethod: "NOT_INTEGRABLE",
    suggestedAdapter: null,
    status: "verified_official_snippets",
    docSection: "7.13",
    verification: v("Certificat de revente US exigé ; clients internationaux refusés → plateforme sœur Eurolots (6.5) pour l'Europe."),
  },
];

// -----------------------------------------------------------------------------
// Accès
// -----------------------------------------------------------------------------

export function listCatalogSources(): readonly CatalogSource[] {
  return SOURCING_CATALOG;
}

export function catalogSourceByKey(key: string | null | undefined): CatalogSource | null {
  if (!key) return null;
  return SOURCING_CATALOG.find((s) => s.key === key) ?? null;
}

export interface CatalogSummary {
  total: number;
  /** statut de la fiche */
  verifiedFromSnippets: number;
  partial: number;
  unverified: number;
  /** prix visibles sans connexion (pricePublic === "yes") */
  pricePublic: number;
  /** compte fournisseur nécessaire (accountRequired === true) */
  accountRequired: number;
  /** au moins une voie machine documentée (api ou feed === "yes") */
  apiOrFeed: number;
  /** non intégrable (statut ou classe NOT_INTEGRABLE) */
  notIntegrable: number;
}

export function catalogSummary(sources: readonly CatalogSource[] = SOURCING_CATALOG): CatalogSummary {
  const count = (pred: (s: CatalogSource) => boolean): number => sources.filter(pred).length;
  return {
    total: sources.length,
    verifiedFromSnippets: count((s) => s.status === "verified_official_snippets"),
    partial: count((s) => s.status === "partial"),
    unverified: count((s) => s.status === "unverified"),
    pricePublic: count((s) => s.pricePublic === "yes"),
    accountRequired: count((s) => s.accountRequired === true),
    apiOrFeed: count((s) => s.api === "yes" || s.feed === "yes"),
    notIntegrable: count((s) => s.status === "not_integrable" || s.integrationMethod === "NOT_INTEGRABLE"),
  };
}

// -----------------------------------------------------------------------------
// Libellés français (tableau 12 colonnes partagé par la doc et le script de vérification)
// -----------------------------------------------------------------------------

/** Libellé utilisé quand la fiche n'a pas pu trancher (réseau bloqué lors de la recherche). */
export const TO_VERIFY_LABEL = "À vérifier (réseau bloqué)";

export const CATALOG_TABLE_COLUMNS = [
  "SOURCE",
  "URL",
  "CATÉGORIE",
  "PAYS",
  "PRIX PUBLIC ?",
  "COMPTE NÉCESSAIRE ?",
  "API ?",
  "CSV/XML ?",
  "STOCK VISIBLE ?",
  "AUTOMATISATION POSSIBLE ?",
  "MÉTHODE D'INTÉGRATION",
  "STATUT",
] as const;

export function labelYesNoUnknown(value: YesNoUnknown): string {
  return value === "yes" ? "Oui" : value === "no" ? "Non" : TO_VERIFY_LABEL;
}

export function labelPricePublic(value: PricePublic): string {
  switch (value) {
    case "yes":
      return "Oui";
    case "no":
      return "Non";
    case "after_login":
      return "Après connexion";
    default:
      return TO_VERIFY_LABEL;
  }
}

export function labelAccountRequired(value: boolean | null): string {
  return value === null ? TO_VERIFY_LABEL : value ? "Oui" : "Non";
}

export function labelAutomationAllowed(value: AutomationAllowed): string {
  switch (value) {
    case "yes":
      return "Oui (canal officiel)";
    case "no":
      return "Non";
    case "forbidden_by_terms":
      return "Interdite par les CGU";
    default:
      return TO_VERIFY_LABEL;
  }
}

export function labelStatus(value: CatalogStatus): string {
  switch (value) {
    case "verified_official_snippets":
      return "Vérifié (extraits officiels)";
    case "partial":
      return "Partiel";
    case "unverified":
      return "Non vérifié";
    default:
      return "Non intégrable";
  }
}

/** Les 12 cellules (dans l'ordre de CATALOG_TABLE_COLUMNS) d'une source, telles que documentées. */
export function catalogTableRow(source: CatalogSource): string[] {
  return [
    source.name,
    source.url,
    source.category.join(", "),
    source.country,
    labelPricePublic(source.pricePublic),
    labelAccountRequired(source.accountRequired),
    labelYesNoUnknown(source.api),
    labelYesNoUnknown(source.feed),
    labelYesNoUnknown(source.stockVisible),
    labelAutomationAllowed(source.automationAllowed),
    `\`${source.integrationMethod}\``,
    labelStatus(source.status),
  ];
}
