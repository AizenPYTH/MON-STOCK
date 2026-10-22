import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { parseQuery } from "@/domain/sourcing/query-parser";
import type { AdapterRunContext, AdapterSourceConfig } from "@/integrations/sourcing/core";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { ebayEnv } from "@/lib/env";

const log = createLogger("SOURCE_LIBRARY");

/**
 * =============================================================================
 * BIBLIOTHÈQUE DE SOURCES — fournisseurs spécialisés activables en un geste.
 *
 * Chaque entrée est un CANDIDAT repéré par recherche (pièces détachées, reconditionné, lots,
 * annonces eBay). Rien n'est présenté comme connecté sur la foi de cette liste :
 *   1. `runLibraryChecks()` (serveur, planifié) vérifie RÉELLEMENT chaque candidat : robots.txt
 *      pour les chemins utilisés, puis une recherche publique qui doit renvoyer des produits avec
 *      prix. Le résultat (preuve : statut HTTP, nombre de produits, exemples) est enregistré dans
 *      sourcing_library_checks.
 *      Chaque passage traite un LOT borné, les sources les moins récemment vérifiées d'abord,
 *      dans un budget de temps global : une source en fin de liste n'est jamais oubliée.
 *   2. Seules les sources dont la dernière vérification est « ok » peuvent être activées, et
 *      l'activation exige une VALIDATION HUMAINE tracée (utilisateur, date) : l'utilisateur
 *      déclare avoir lu les conditions d'utilisation. Quand MON STOCK n'a pas de preuve que
 *      `termsUrl` est la bonne page (« non vérifiée »), l'utilisateur doit indiquer l'adresse de
 *      la page des conditions qu'il a lue. Aucune activation n'est faite par une tâche planifiée.
 *   3. Une source activée devient une supplier_source normale de l'organisation : la recherche
 *      en direct existante (robots.txt, politesse, budget, provenance) s'applique telle quelle.
 * =============================================================================
 */

export type LibrarySegment = "parts" | "refurbished" | "lots" | "marketplace";
export type LibraryAccess = "public_json" | "public_html" | "official_api";

export interface LibrarySource {
  key: string;
  name: string;
  website: string;
  /** URL de base passée à l'adaptateur (boutique) */
  baseUrl: string;
  adapter: "shopify-storefront" | "woocommerce-store" | "sitemap-jsonld" | "ebay-browse";
  segment: LibrarySegment;
  country: string;
  currency: string;
  /** HT/TTC documenté par la source (inconnu tant que non vérifié) */
  taxType: "ht" | "ttc" | "unknown";
  /**
   * Page à ouvrir pour lire les conditions. Tant que `termsEvidence` est absent, rien ne prouve
   * que c'est la bonne page (souvent la page d'accueil, ou le chemin standard des boutiques
   * Shopify) : elle est présentée comme « non vérifiée ».
   */
  termsUrl: string;
  /** preuve que `termsUrl` est bien la page des conditions (sinon : non vérifiée) */
  termsEvidence?: string;
  access: LibraryAccess;
  /** ce qu'on sait de la source, et d'où ça vient */
  notes: string;
  /** requête de vérification (doit renvoyer des produits pertinents) */
  probeQuery: string;
  /** accès automatisé interdit par les conditions du fournisseur : jamais vérifié ni activable */
  blocked?: string;
}

/** Chemin standard des conditions d'une boutique Shopify : existence NON vérifiée (statut « non vérifiée »). */
const shopifyTerms = (base: string) => `${base}/policies/terms-of-service`;

export type TermsStatus = "confirmed" | "unverified";

/** Page des conditions confirmée (preuve enregistrée) ou non vérifiée. */
export function termsStatusOf(s: Pick<LibrarySource, "termsEvidence">): TermsStatus {
  return s.termsEvidence ? "confirmed" : "unverified";
}

export const TERMS_STATUS_LABEL: Record<TermsStatus, string> = {
  confirmed: "Page des conditions confirmée",
  unverified: "Page des conditions non vérifiée par MON STOCK (page d'accueil ou chemin supposé) : localisez les conditions sur le site",
};

export const SOURCE_LIBRARY: readonly LibrarySource[] = [
  {
    key: "ebay-fr",
    name: "eBay France — annonces (lots, reconditionnés, pièces)",
    website: "https://www.ebay.fr",
    baseUrl: "https://api.ebay.com",
    adapter: "ebay-browse",
    segment: "marketplace",
    country: "FR",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://developer.ebay.com/join/api-license-agreement",
    termsEvidence: "Contrat de licence de l'API eBay publié par eBay (programme développeurs) : accès par l'API officielle Buy Browse, pas de collecte de pages.",
    access: "official_api",
    notes: "API officielle Buy Browse (clés de l'application eBay du serveur). Offres publiées par des vendeurs pros et particuliers ; quantité non fournie par la recherche.",
    probeQuery: "iphone 13 128",
  },
  {
    key: "foneday",
    name: "Foneday (NL) — pièces détachées, B2B",
    website: "https://www.foneday.shop",
    baseUrl: "https://www.foneday.shop",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.foneday.shop"),
    access: "public_json",
    notes: "Grossiste néerlandais de pièces et accessoires pour réparateurs (clientèle principalement professionnelle, selon la recherche web).",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "mobileparts-shop",
    name: "MobileParts.shop (2Service, NL) — pièces",
    website: "https://www.mobileparts.shop",
    baseUrl: "https://www.mobileparts.shop",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.mobileparts.shop"),
    access: "public_json",
    notes: "Pièces d'origine, compatibles et de récupération pour réparateurs, reconditionneurs et grossistes (selon la recherche web).",
    probeQuery: "iphone 13 display",
  },
  {
    key: "mobilesentrix-eu",
    name: "MobileSentrix Europe (NL) — pièces",
    website: "https://www.mobilesentrix.eu",
    baseUrl: "https://www.mobilesentrix.eu",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.mobilesentrix.eu",
    access: "public_html",
    notes: "Distributeur de pièces (centre logistique aux Pays-Bas). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en EUR via le plan du site et les données structurées (le point d'entrée Shopify répond 404).",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "replacebase",
    name: "ReplaceBase (UK) — écrans et batteries",
    website: "https://www.replacebase.co.uk",
    baseUrl: "https://www.replacebase.co.uk",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.replacebase.co.uk"),
    access: "public_json",
    notes: "Écrans reconditionnés et batteries, expédition depuis le Royaume-Uni (selon la recherche web) ; frais de douane possibles vers la France.",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "rewa-eu",
    name: "REWA Europe — outils, écrans, batteries",
    website: "https://rewa.tech",
    baseUrl: "https://rewa.tech",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://rewa.tech"),
    access: "public_json",
    notes: "Outillage et pièces de réparation (pays d'expédition à confirmer).",
    probeQuery: "iphone screen",
  },
  {
    key: "ifixit-eu-pro",
    name: "iFixit Pro Store EU — pièces et outils",
    website: "https://eu-pro-store.ifixit.com",
    baseUrl: "https://eu-pro-store.ifixit.com",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://eu-pro-store.ifixit.com"),
    access: "public_json",
    notes: "Boutique professionnelle iFixit pour l'Europe (plateforme Shopify supposée d'après ses URL, confirmée seulement par la vérification).",
    probeQuery: "iphone 13 battery",
  },
  {
    key: "jobalots",
    name: "Jobalots (UK/EU) — lots de retours",
    website: "https://jobalots.com",
    baseUrl: "https://jobalots.com",
    adapter: "shopify-storefront",
    segment: "lots",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://jobalots.com"),
    access: "public_json",
    notes: "Lots de retours clients et de surplus (électronique, téléphonie) ; prix par lot.",
    probeQuery: "phone",
  },
  {
    key: "brico-phone",
    name: "Brico-phone (FR) — pièces détachées",
    website: "https://www.brico-phone.com",
    baseUrl: "https://www.brico-phone.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ttc",
    termsUrl: "https://www.brico-phone.com",
    access: "public_html",
    notes: "Pièces détachées (écrans, batteries, connecteurs) vendues en France. Lu via le plan du site publié et les données structurées des fiches (prix TTC affichés au public).",
    probeQuery: "ecran iphone 13",
  },
  {
    key: "refreshed-apples",
    name: "Refreshed Apples (NL) — iPhone reconditionnés en gros",
    website: "https://www.refreshedapples.com",
    baseUrl: "https://www.refreshedapples.com",
    adapter: "sitemap-jsonld",
    segment: "refurbished",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.refreshedapples.com",
    access: "public_html",
    notes: "Grossiste néerlandais d'iPhone d'occasion par grade. Contrôle serveur du 10/10/2026 : 117 fiches avec prix lisibles (plan du site + données structurées). Minimum de commande annoncé par lots : à vérifier avant achat.",
    probeQuery: "iphone",
  },
  {
    key: "fixje",
    name: "Fixje (NL) — pièces détachées",
    website: "https://www.fixje.nl",
    baseUrl: "https://www.fixje.nl",
    adapter: "woocommerce-store",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.fixje.nl",
    access: "public_json",
    notes: "Pièces et accessoires smartphone (Pays-Bas), offre professionnelle « Zakelijk ». Contrôle serveur du 10/10/2026 : 200 fiches avec prix publics (WooCommerce) ; certaines fiches « modèle » sont des prix de réparation, pas des pièces : vérifiez chaque offre. Remise pro sur compte.",
    probeQuery: "iphone 13",
  },
  {
    key: "servisni-dily",
    name: "Servisní díly (CZ) — pièces détachées",
    website: "https://www.servisnidily.cz",
    baseUrl: "https://www.servisnidily.cz",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "CZ",
    currency: "CZK",
    taxType: "unknown",
    termsUrl: "https://www.servisnidily.cz",
    access: "public_html",
    notes: "Pièces détachées par modèle (République tchèque), expédition UE annoncée. Contrôle serveur du 10/10/2026 : fiches avec prix en CZK (conversion par les taux BCE).",
    probeQuery: "iphone",
  },
  {
    key: "repuestosmovil",
    name: "Repuestosmovil (ES) — pièces smartphone",
    website: "https://repuestosmovil.es",
    baseUrl: "https://repuestosmovil.es",
    adapter: "woocommerce-store",
    segment: "parts",
    country: "ES",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://repuestosmovil.es",
    access: "public_json",
    notes: "Pièces détachées smartphone (Espagne). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 200 produits avec prix (API publique WooCommerce), ex. écran iPhone 15 Pro Max 54,60 €.",
    probeQuery: "iphone 13",
  },
  {
    key: "ekolow",
    name: "Ekolow (FR) — pièces MacBook",
    website: "https://ekolow.fr",
    baseUrl: "https://ekolow.fr",
    adapter: "woocommerce-store",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://ekolow.fr",
    access: "public_json",
    notes: "Pièces MacBook d'origine (France). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 200 produits avec prix pour « macbook », dont 21 avec quantité en stock.",
    probeQuery: "macbook",
  },
  {
    key: "pulled-mac-parts",
    name: "Pulled Mac Parts (NL) — pièces MacBook d'origine",
    website: "https://www.pulledmacparts.nl",
    baseUrl: "https://www.pulledmacparts.nl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.pulledmacparts.nl",
    access: "public_html",
    notes: "Pièces MacBook d'origine récupérées (Pays-Bas). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 253 produits (catalogue Shopify, devise absente) et 21 fiches en EUR (plan du site + données structurées), ex. écran MacBook Pro 14 M1 445 €.",
    probeQuery: "macbook",
  },
  {
    key: "mobinova",
    name: "Mobinova — pièces iPhone",
    website: "https://mobinova.eu",
    baseUrl: "https://mobinova.eu",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://mobinova.eu",
    access: "public_html",
    notes: "Pièces iPhone (châssis, écrans…). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 22 fiches en EUR via le plan du site (le catalogue Shopify répond HTTP 429), ex. châssis iPhone 14 Pro Max 75 €.",
    probeQuery: "iphone 13",
  },
  {
    key: "da-pieces",
    name: "DA Pièces (FR) — pièces smartphone",
    website: "https://da-pieces.com",
    baseUrl: "https://da-pieces.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://da-pieces.com",
    access: "public_html",
    notes: "Pièces smartphone (France). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en EUR via le plan du site (le catalogue Shopify répond HTTP 429), ex. haut-parleur iPhone 11 2 €.",
    probeQuery: "iphone 12",
  },
  {
    key: "2repair",
    name: "2repair.parts — pièces smartphone (GBP)",
    website: "https://2repair.parts",
    baseUrl: "https://2repair.parts",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: "https://2repair.parts",
    access: "public_html",
    notes: "Pièces smartphone, prix en livres sterling. Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en GBP via le plan du site, ex. écran HTC One M8 21,35 £ (rupture). Frais de douane possibles depuis le Royaume-Uni.",
    probeQuery: "lcd",
  },
  {
    key: "gsmok",
    name: "GSMOK (PL) — pièces smartphone",
    website: "https://gsmok.com",
    baseUrl: "https://gsmok.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://gsmok.com",
    access: "public_html",
    notes: "Pièces smartphone (Pologne), site en anglais avec prix en EUR. Collecte réelle par le serveur MON STOCK le 13/10/2026 : 7 fiches en EUR via le plan du site compressé, ex. écran Xiaomi Poco X5 Pro 26,22 € (stock faible).",
    probeQuery: "iphone",
  },
  {
    key: "mobilepart-pl",
    name: "Mobilepart.pl (PL) — pièces smartphone",
    website: "https://mobilepart.pl",
    baseUrl: "https://mobilepart.pl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "PLN",
    taxType: "unknown",
    termsUrl: "https://mobilepart.pl",
    access: "public_html",
    notes: "Pièces smartphone (Pologne), prix en zlotys. Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en PLN, ex. écran Samsung A10 48 PLN (en stock).",
    probeQuery: "lcd",
  },
  {
    key: "portatilmovil",
    name: "Portatilmovil (ES) — pièces d'ordinateurs portables",
    website: "https://www.portatilmovil.com",
    baseUrl: "https://www.portatilmovil.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "ES",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.portatilmovil.com",
    access: "public_html",
    notes: "Pièces et accessoires d'ordinateurs portables (Espagne). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en EUR avec EAN, ex. lot de 100 vis de clavier 14,62 €.",
    probeQuery: "teclado",
  },
  {
    key: "computerg",
    name: "ComputerG — composants informatiques",
    website: "https://www.computerg.shop",
    baseUrl: "https://www.computerg.shop",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.computerg.shop",
    access: "public_html",
    notes: "Composants informatiques (disques, stockage). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 3 fiches en EUR (pages très lourdes), ex. Seagate IronWolf Pro 10 To 524,36 €.",
    probeQuery: "ssd",
  },
  {
    key: "bestellaptops",
    name: "Bestellaptops (NL) — portables reconditionnés",
    website: "https://bestellaptops.nl",
    baseUrl: "https://bestellaptops.nl",
    adapter: "sitemap-jsonld",
    segment: "refurbished",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://bestellaptops.nl",
    access: "public_html",
    notes: "Ordinateurs portables reconditionnés (Pays-Bas). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en EUR via le plan du site (le catalogue Shopify répond HTTP 429), ex. Dell Latitude 5480 i5 8 Go 199,99 €.",
    probeQuery: "dell latitude",
  },
  {
    key: "pc-ricondizionati",
    name: "PC Ricondizionati (IT) — reconditionné",
    website: "https://www.pc-ricondizionati.com",
    baseUrl: "https://www.pc-ricondizionati.com",
    adapter: "woocommerce-store",
    segment: "refurbished",
    country: "IT",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.pc-ricondizionati.com",
    access: "public_json",
    notes: "Ordinateurs reconditionnés (Italie). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 18 MacBook avec prix pour « macbook » (de 492 à 974 €).",
    probeQuery: "macbook",
  },
  {
    key: "flashmac",
    name: "Flashmac (IT) — informatique",
    website: "https://www.flashmac.com",
    baseUrl: "https://www.flashmac.com",
    adapter: "woocommerce-store",
    segment: "refurbished",
    country: "IT",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.flashmac.com",
    access: "public_json",
    notes: "Informatique (Italie). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 100 produits par page de catalogue, dont 41 avec quantité. Attention : le catalogue contient aussi des devis (« Preventivo ») qui ne sont pas des produits en vente.",
    probeQuery: "macbook",
  },
  {
    key: "subastalotes",
    name: "Subastalotes (ES) — lots et palettes",
    website: "https://subastalotes.com",
    baseUrl: "https://subastalotes.com",
    adapter: "woocommerce-store",
    segment: "lots",
    country: "ES",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://subastalotes.com",
    access: "public_json",
    notes: "Lots et palettes de déstockage (Espagne). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 100 lots par page avec quantité, ex. carton de jouets 152,09 €.",
    probeQuery: "lote",
  },
  {
    key: "eurolots",
    name: "Eurolots — lots de gros",
    website: "https://www.eurolots.com",
    baseUrl: "https://www.eurolots.com",
    adapter: "sitemap-jsonld",
    segment: "lots",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.eurolots.com",
    access: "public_html",
    notes: "Lots de gros multi-catégories. Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en EUR via le plan du site.",
    probeQuery: "electronics",
  },
  {
    key: "bitstockz",
    name: "Bitstockz (PL) — palettes de retours",
    website: "https://www.bitstockz.pl",
    baseUrl: "https://www.bitstockz.pl",
    adapter: "sitemap-jsonld",
    segment: "lots",
    country: "PL",
    currency: "PLN",
    taxType: "unknown",
    termsUrl: "https://www.bitstockz.pl",
    access: "public_html",
    notes: "Palettes de retours (Pologne), prix en zlotys. Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en PLN, ex. palette Amazon MIX 1 629,51 PLN.",
    probeQuery: "elektronika",
  },
  {
    key: "hurtel",
    name: "Hurtel (PL) — accessoires en gros",
    website: "https://hurtel.com",
    baseUrl: "https://hurtel.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://hurtel.com",
    access: "public_html",
    notes: "Grossiste d'accessoires (Pologne), catalogue très large au-delà de la téléphonie. Collecte réelle par le serveur MON STOCK le 13/10/2026 : 8 fiches en EUR et PLN via le plan du site compressé.",
    probeQuery: "iphone",
  },
  {
    key: "technoworld",
    name: "Shop Technoworld (IT) — pièces smartphone",
    website: "https://www.shop-technoworld.eu",
    baseUrl: "https://www.shop-technoworld.eu",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "IT",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.shop-technoworld.eu",
    access: "public_html",
    notes: "Pièces smartphone (Italie). Collecte réelle par le serveur MON STOCK le 13/10/2026 : 4 fiches en EUR via le plan du site (quelques fiches du plan répondent 404), ex. écran iPhone 4 blanc 4,99 €.",
    probeQuery: "iphone",
  },
  {
    key: "pieces2mobile",
    name: "Pieces2Mobile (FR) — pièces smartphone et tablette",
    website: "https://www.pieces2mobile.com",
    baseUrl: "https://www.pieces2mobile.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ht",
    termsUrl: "https://www.pieces2mobile.com",
    access: "public_html",
    notes: "Pièces Apple (origine, génériques, reconditionnées), Samsung et autres marques ; prix affichés HT selon la recherche (meilleurs tarifs pour les comptes professionnels, article de 2019 à confirmer). Site Magento joignable par le serveur le 13/10/2026. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "ecran iphone 13",
  },
  {
    key: "appleparts-pl",
    name: "AppleParts (PL) — pièces Apple",
    website: "https://appleparts.pl",
    baseUrl: "https://appleparts.pl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "PLN",
    taxType: "unknown",
    termsUrl: "https://appleparts.pl",
    access: "public_html",
    notes: "Pièces Apple (batteries, écrans, caméras, nappes, outillage) pour iPhone, iPad, Apple Watch, MacBook ; prix publics en złotys selon la recherche ; livraison vers la France et facture avec TVA à confirmer. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13",
  },
  {
    key: "a-parts-pl",
    name: "A-Parts (PL) — batteries et écrans iPhone",
    website: "https://www.a-parts.com.pl",
    baseUrl: "https://www.a-parts.com.pl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "PLN",
    taxType: "ttc",
    termsUrl: "https://www.a-parts.com.pl",
    access: "public_html",
    notes: "Batteries iPhone (dont modèles compatibles diagnostic), écrans et accessoires ; prix bruts (TTC) en złotys selon la recherche ; export vers la France à confirmer. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone",
  },
  {
    key: "telehurt-pl",
    name: "Telehurt (PL) — pièces et accessoires en gros",
    website: "https://telehurt.pl",
    baseUrl: "https://telehurt.pl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "PLN",
    taxType: "ht",
    termsUrl: "https://telehurt.pl",
    access: "public_html",
    notes: "Grossiste polonais de pièces et accessoires ; prix nets (HT) et bruts affichés publiquement selon la recherche (ex. écran Hard OLED iPhone 17e : 152,79 PLN HT). Conditions d'export à demander. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13",
  },
  {
    key: "hurtowniagsm-pl",
    name: "HurtowniaGSM (PL) — pièces d'origine",
    website: "https://www.hurtowniagsm.pl",
    baseUrl: "https://www.hurtowniagsm.pl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "PL",
    currency: "PLN",
    taxType: "ht",
    termsUrl: "https://www.hurtowniagsm.pl",
    access: "public_html",
    notes: "Gros et détail de pièces neuves d'origine (déclaratif : distribution européenne) ; prix HT en złotys selon la recherche ; un flux de dropshipping existerait pour les comptes société. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone",
  },
  {
    key: "ms-gsm",
    name: "MS GSM (DE) — pièces pour réparateurs",
    website: "https://ms-gsm.de",
    baseUrl: "https://ms-gsm.de",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "DE",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://ms-gsm.de",
    access: "public_html",
    notes: "Grossiste allemand de pièces pour ateliers et boutiques (MS GSM International GmbH, Coesfeld) ; boutique en ligne publique, tarif grossiste sur contact. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13 display",
  },
  {
    key: "phonegigant",
    name: "PhoneGigant (NL) — pièces iPhone",
    website: "https://www.phonegigant.nl",
    baseUrl: "https://www.phonegigant.nl",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.phonegigant.nl",
    access: "public_html",
    notes: "Pièces iPhone et outillage de réparation, prix de détail publics (référence de prix plutôt que grossiste). Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13 scherm",
  },
  {
    key: "teknikdelar-se",
    name: "Teknikdelar (SE) — pièces smartphone",
    website: "https://www.teknikdelar.se",
    baseUrl: "https://www.teknikdelar.se",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "SE",
    currency: "SEK",
    taxType: "unknown",
    termsUrl: "https://www.teknikdelar.se",
    access: "public_html",
    notes: "Pièces pour particuliers et réparateurs professionnels (groupe Spares Nordic) ; prix en couronnes suédoises ; offre entreprise à confirmer. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13",
  },
  {
    key: "repair-outlet-uk",
    name: "Repair Outlet (UK) — pièces, prix trade",
    website: "https://repairoutlet.co.uk",
    baseUrl: "https://repairoutlet.co.uk",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "ht",
    termsUrl: shopifyTerms("https://repairoutlet.co.uk"),
    access: "public_json",
    notes: "Cellcom Ltd, fournisseur trade de pièces depuis 2015 ; collection « Trade discount products » avec prix HT (ex VAT) publics selon la recherche. Frais de douane possibles depuis le Royaume-Uni. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "fonefunshop-uk",
    name: "FoneFunShop (UK) — pièces et outillage",
    website: "https://www.fonefunshop.com",
    baseUrl: "https://www.fonefunshop.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: "https://www.fonefunshop.com",
    access: "public_html",
    notes: "Pièces, outils et accessoires de réparation, catalogue public (et boutique eBay) ; remises trade à demander. Frais de douane possibles depuis le Royaume-Uni. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "thebookyard-uk",
    name: "The Bookyard (UK) — cartes mères Mac",
    website: "https://www.thebookyard.com",
    baseUrl: "https://www.thebookyard.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: "https://www.thebookyard.com",
    access: "public_html",
    notes: "Cartes mères et processeurs MacBook Pro / Air ; prix publics en livres. Frais de douane possibles depuis le Royaume-Uni. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "macbook pro",
  },
  {
    key: "mobistock-nl",
    name: "Mobistock (NL) — smartphones reconditionnés",
    website: "https://www.mobistock.nl",
    baseUrl: "https://www.mobistock.nl",
    adapter: "sitemap-jsonld",
    segment: "refurbished",
    country: "NL",
    currency: "EUR",
    taxType: "ttc",
    termsUrl: "https://www.mobistock.nl",
    access: "public_html",
    notes: "Se présente comme fournisseur de gros (Enschede) ; vitrine publique avec prix de détail TTC ; conditions de gros par e-mail. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone 13",
  },
  {
    key: "mobiledepot-eu",
    name: "Mobile Depot Europe (NL) — stock smartphones B2B",
    website: "https://www.mobiledepot.eu",
    baseUrl: "https://www.mobiledepot.eu",
    adapter: "sitemap-jsonld",
    segment: "refurbished",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://www.mobiledepot.eu",
    access: "public_html",
    notes: "Grossiste B2B (Taqat BV, NL ; agence MJ Phone à Aubervilliers) ; offres de stock publiées en ligne avec prix unitaire selon la recherche ; neuf, occasion, reconditionné, lots. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "iphone",
  },
  {
    key: "pc-portatil-es",
    name: "PC Portátil (ES) — ordinateurs d'occasion",
    website: "https://www.pc-portatil.com",
    baseUrl: "https://www.pc-portatil.com",
    adapter: "sitemap-jsonld",
    segment: "refurbished",
    country: "ES",
    currency: "EUR",
    taxType: "ttc",
    termsUrl: "https://www.pc-portatil.com",
    access: "public_html",
    notes: "Grossiste informatique d'occasion depuis 1997 (PrestaShop) ; catalogue public avec quantités, prix TTC ; conditions distributeurs à demander. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "lenovo thinkpad",
  },
  {
    key: "it-versand-de",
    name: "it-versand.com (DE) — informatique reconditionnée",
    website: "https://it-versand.com",
    baseUrl: "https://it-versand.com",
    adapter: "shopify-storefront",
    segment: "refurbished",
    country: "DE",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://it-versand.com"),
    access: "public_json",
    notes: "NET Online-Versand GmbH : portables et PC professionnels reconditionnés (retours de leasing, surstocks), garantie 12 mois ; collection B2B publique selon la recherche. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "lenovo thinkpad",
  },
  {
    key: "itjustgood-fr",
    name: "ITJustGood (FR) — portables reconditionnés",
    website: "https://www.itjustgood.com",
    baseUrl: "https://www.itjustgood.com",
    adapter: "sitemap-jsonld",
    segment: "refurbished",
    country: "FR",
    currency: "EUR",
    taxType: "ttc",
    termsUrl: "https://www.itjustgood.com",
    access: "public_html",
    notes: "Portables reconditionnés vendus aux particuliers, entreprises et collectivités (garantie 1 an extensible) ; prix de détail : référence de prix française plutôt que grossiste. Candidat de la recherche documentaire du 10/10/2026 (docs/sourcing/supplier-directory.csv), ajouté le 21/10/2026 sans vérification en direct (réseau de l'environnement de développement fermé à ce site) : activable seulement après la vérification serveur (robots.txt + produits avec prix) ; conditions d'utilisation à relire avant activation.",
    probeQuery: "dell latitude",
  },
  {
    key: "utopya",
    name: "Utopya (FR) — distributeur B2B de pièces",
    website: "https://www.utopya.fr",
    baseUrl: "https://www.utopya.fr",
    adapter: "woocommerce-store",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ht",
    termsUrl: "https://www.utopya.fr/c-g-v",
    termsEvidence: "CGV d'Utopya lues (article 14 cité dans les notes) : elles interdisent l'accès automatisé, d'où le blocage.",
    access: "public_json",
    notes: "Distributeur B2B de pièces et accessoires (Paris). Sa FAQ indique ne proposer ni export Excel ni API ; ses CGV (art. 14) interdisent tout accès automatisé (robots, scrapers, scripts), sauf API officielle sous contrat écrit.",
    probeQuery: "iphone 13",
    blocked: "Accès automatisé interdit par les CGV d'Utopya (article 14, clause pénale). Utilisez la saisie manuelle ou un fichier explicitement fourni par Utopya ; seule une API sous contrat écrit permettrait une synchronisation.",
  },
];

export function getLibrarySource(key: string): LibrarySource | null {
  return SOURCE_LIBRARY.find((s) => s.key === key) ?? null;
}

function adapterConfig(s: LibrarySource): AdapterSourceConfig {
  return { baseUrl: s.baseUrl, settings: { adapter: s.adapter, library_key: s.key }, defaultCurrency: s.currency, defaultTaxType: s.taxType, defaultCountry: s.country.length === 2 && s.country !== "EU" ? s.country : null };
}

export interface LibraryCheckResult {
  key: string;
  status: "ok" | "robots_disallowed" | "no_products" | "http_error" | "unreachable" | "not_configured";
  adapter: string;
  robotsAllowed: boolean | null;
  httpStatus: number | null;
  productCount: number;
  sample: Array<{ title: string; price: number | null; currency: string | null; url: string | null }>;
  message: string;
  durationMs: number;
}

export type LibraryCheckRuntime = Pick<AdapterRunContext, "fetchImpl" | "resolver" | "sleep" | "now"> & {
  /** délai maximal de la recherche de contrôle (20 s par défaut) */
  timeoutMs?: number;
};

/** Délai minimal entre deux requêtes vers la boutique pendant une vérification. */
export const LIBRARY_CHECK_MIN_DELAY_MS = 1_500;
/** Crawl-delay au-delà duquel la vérification n'est pas tentée (elle ne tiendrait pas dans le budget). */
export const LIBRARY_CHECK_MAX_CRAWL_DELAY_S = 30;

/** Vérifie UNE source : robots.txt puis vraie recherche publique (aucune donnée enregistrée côté organisation). */
export async function checkLibrarySource(s: LibrarySource, runtime: LibraryCheckRuntime = {}): Promise<LibraryCheckResult> {
  const t0 = Date.now();
  const adapter = getSourceAdapter(s.adapter);
  const base = { key: s.key, adapter: s.adapter, robotsAllowed: null as boolean | null, httpStatus: null as number | null, productCount: 0, sample: [] as LibraryCheckResult["sample"] };
  if (!adapter) return { ...base, status: "not_configured", message: `Adaptateur ${s.adapter} absent.`, durationMs: Date.now() - t0 };
  if (s.adapter === "ebay-browse" && !ebayEnv()) return { ...base, status: "not_configured", message: "Clés de l'application eBay non configurées sur le serveur.", durationMs: Date.now() - t0 };
  const config = adapterConfig(s);
  const parsed = parseQuery(s.probeQuery);
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  let minDelayMs = LIBRARY_CHECK_MIN_DELAY_MS;
  if (adapter.urlsForQuery) {
    const urls = adapter.urlsForQuery(config, parsed, s.probeQuery);
    const robots = await checkRobotsForUrls(s.baseUrl, urls, userAgent, runtime.fetchImpl ?? fetch, runtime.resolver).catch((e: unknown) => ({ allowed: false, details: e instanceof Error ? e.message : String(e), crawlDelay: null }) as const);
    base.robotsAllowed = robots.allowed;
    if (!robots.allowed) return { ...base, status: "robots_disallowed", message: robots.details, durationMs: Date.now() - t0 };
    // Crawl-delay demandé par le site : appliqué entre deux requêtes (jamais moins que notre délai minimal).
    if (robots.crawlDelay !== null) {
      if (robots.crawlDelay > LIBRARY_CHECK_MAX_CRAWL_DELAY_S) return { ...base, status: "http_error", message: `robots.txt demande ${robots.crawlDelay} s entre deux requêtes : vérification automatique non tentée (trop lente), à faire manuellement.`, durationMs: Date.now() - t0 };
      minDelayMs = Math.max(minDelayMs, Math.ceil(robots.crawlDelay * 1000));
    }
  }
  const { timeoutMs = 20_000, ...ctx } = runtime;
  const r = await adapter.search(config, parsed, s.probeQuery, { userAgent, timeoutMs, minDelayMs, ...ctx });
  const last = r.requests[r.requests.length - 1];
  base.httpStatus = last?.status ?? null;
  const priced = r.offers.filter((o) => o.price !== null && o.price > 0);
  base.productCount = priced.length;
  base.sample = priced.slice(0, 3).map((o) => ({ title: o.title.slice(0, 160), price: o.price, currency: o.currency ?? s.currency, url: o.url ?? null }));
  if (r.error) {
    const unreachable = !last || last.status === null;
    return { ...base, status: unreachable ? "unreachable" : "http_error", message: r.error.slice(0, 500), durationMs: Date.now() - t0 };
  }
  if (priced.length === 0) return { ...base, status: "no_products", message: `Aucun produit avec prix pour « ${s.probeQuery} ».`, durationMs: Date.now() - t0 };
  return { ...base, status: "ok", message: `${priced.length} produit(s) avec prix pour « ${s.probeQuery} ».`, durationMs: Date.now() - t0 };
}

/** Adaptateurs publics essayés pour détecter la plateforme d'une boutique. */
export const DETECT_ADAPTERS: readonly LibrarySource["adapter"][] = ["shopify-storefront", "woocommerce-store", "sitemap-jsonld"];

/** Dernière vérification enregistrée (pour l'ordre des adaptateurs du passage suivant). */
export interface PreviousLibraryCheck {
  status: string;
  adapter: string | null;
}

/**
 * Adaptateurs à essayer lors d'UN passage : l'adaptateur principal (celui qui a réussi la fois
 * précédente, sinon l'adaptateur déclaré), puis AU PLUS UN adaptateur de repli. Le repli tourne
 * d'un passage à l'autre (celui qui suit le dernier essayé) : tous finissent par être essayés
 * sans qu'un passage enchaîne trois boutiques lentes.
 */
export function libraryAdapterPlan(s: Pick<LibrarySource, "adapter" | "access">, previous: PreviousLibraryCheck | null = null): LibrarySource["adapter"][] {
  const known = (a: string | null | undefined): a is LibrarySource["adapter"] => typeof a === "string" && (DETECT_ADAPTERS as readonly string[]).includes(a);
  const primary = previous?.status === "ok" && known(previous.adapter) ? previous.adapter : s.adapter;
  if (s.access === "official_api" || !(DETECT_ADAPTERS as readonly string[]).includes(s.adapter)) return [primary];
  const cycle = [s.adapter, ...DETECT_ADAPTERS.filter((a) => a !== s.adapter)].filter((a) => a !== primary);
  if (cycle.length === 0) return [primary];
  const lastIdx = previous && previous.status !== "ok" && known(previous.adapter) ? cycle.indexOf(previous.adapter) : -1;
  return [primary, cycle[(lastIdx + 1) % cycle.length]!];
}

/**
 * Vérification avec détection de plateforme : l'adaptateur principal d'abord, puis UN adaptateur de
 * repli si la boutique ne répond pas au premier (une boutique Shopify n'expose pas l'API
 * WooCommerce, et inversement). L'adaptateur retenu est celui qui a réellement renvoyé des
 * produits ; en cas d'échec, l'adaptateur enregistré est le dernier essayé (rotation du repli).
 */
export async function checkLibrarySourceDetect(s: LibrarySource, runtime: LibraryCheckRuntime = {}, opts: { previous?: PreviousLibraryCheck | null; deadline?: number; clock?: () => number } = {}): Promise<LibraryCheckResult> {
  const clock = opts.clock ?? Date.now;
  const [primary, fallback] = libraryAdapterPlan(s, opts.previous ?? null);
  const first = await checkLibrarySource(primary === s.adapter ? s : { ...s, adapter: primary! }, runtime);
  if (first.status === "ok" || first.status === "robots_disallowed" || first.status === "not_configured" || !fallback) return first;
  if (opts.deadline !== undefined && opts.deadline - clock() < LIBRARY_CHECK_FALLBACK_MIN_MS) {
    return { ...first, message: `${first.message} | repli ${fallback} reporté au prochain passage (budget de temps)`.slice(0, 500) };
  }
  const next = await checkLibrarySource({ ...s, adapter: fallback }, runtime);
  if (next.status === "ok") return next;
  return { ...first, adapter: fallback, durationMs: first.durationMs + next.durationMs, message: `${primary} : ${first.message} | ${fallback} : ${next.message}`.slice(0, 500) };
}

/** Sources vérifiées par passage planifié (les moins récemment vérifiées d'abord). */
export const LIBRARY_CHECK_BATCH = 6;
/** Budget de temps global d'un passage (la fonction serveur est coupée à 150 s). */
export const LIBRARY_CHECK_BUDGET_MS = 110_000;
/** Temps minimal restant pour commencer la vérification d'une source. */
export const LIBRARY_CHECK_MIN_START_MS = 25_000;
/** Temps minimal restant pour tenter l'adaptateur de repli. */
export const LIBRARY_CHECK_FALLBACK_MIN_MS = 22_000;

export interface LibraryCheckRow {
  key: string;
  checked_at: string | null;
  last_attempt_at?: string | null;
  status: string;
  adapter: string | null;
}

/** Date de dernière prise en charge d'une source : vérification terminée ou tentative interrompue. */
function lastTouched(row: LibraryCheckRow | undefined): string {
  if (!row) return "";
  const a = row.checked_at ?? "";
  const b = row.last_attempt_at ?? "";
  return a > b ? a : b;
}

/**
 * File équitable : sources non bloquées, jamais vérifiées d'abord, puis la moins récemment prise en
 * charge (vérification ou tentative interrompue), à égalité dans l'ordre de la bibliothèque.
 */
export function orderLibraryChecks(entries: readonly LibrarySource[], rows: readonly LibraryCheckRow[]): LibrarySource[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return entries
    .map((s, i) => ({ s, i, at: lastTouched(byKey.get(s.key)) }))
    .filter((x) => !x.s.blocked)
    .sort((a, b) => a.at.localeCompare(b.at) || a.i - b.i)
    .map((x) => x.s);
}

export interface LibraryChecksRun {
  results: LibraryCheckResult[];
  /** sources du lot non vérifiées faute de temps (prioritaires au prochain passage) */
  deferred: string[];
  /** sources non vérifiées lors de ce passage (hors lot ou reportées) */
  pending: number;
  batchSize: number;
  budgetMs: number;
  durationMs: number;
}

export interface LibraryChecksOptions {
  /** clés demandées explicitement (sinon : un lot des moins récemment vérifiées) */
  keys?: string[];
  batchSize?: number;
  budgetMs?: number;
  admin?: AdminSupabaseClient;
  runtime?: LibraryCheckRuntime;
  clock?: () => number;
  /** vérification injectable (tests) */
  check?: typeof checkLibrarySourceDetect;
}

const withDeadline = <T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(onTimeout()), Math.max(1, ms));
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

/**
 * Vérifie un LOT de la bibliothèque (séquentiellement : un hôte à la fois) dans un budget de temps
 * global et enregistre les preuves. Chaque source est marquée « tentée » avant sa vérification :
 * si la fonction est coupée pendant une source lente, celle-ci passe en fin de file au passage
 * suivant au lieu de bloquer toutes les autres.
 */
export async function runLibraryChecks(input: string[] | LibraryChecksOptions = {}): Promise<LibraryChecksRun> {
  const opts: LibraryChecksOptions = Array.isArray(input) ? { keys: input } : input;
  const admin = opts.admin ?? createAdminSupabaseClient();
  const clock = opts.clock ?? Date.now;
  const check = opts.check ?? checkLibrarySourceDetect;
  const budgetMs = opts.budgetMs ?? LIBRARY_CHECK_BUDGET_MS;
  const batchSize = Math.max(1, opts.batchSize ?? LIBRARY_CHECK_BATCH);
  const started = clock();
  const deadline = started + budgetMs;

  const { data: rows, error: rowsErr } = await admin.from("sourcing_library_checks").select("key, checked_at, last_attempt_at, status, adapter");
  if (rowsErr) throw new Error(`Lecture des vérifications impossible : ${rowsErr.message}`);
  const previous = new Map(((rows ?? []) as LibraryCheckRow[]).map((r) => [r.key, r]));
  const eligible = opts.keys ? SOURCE_LIBRARY.filter((s) => opts.keys!.includes(s.key) && !s.blocked) : orderLibraryChecks(SOURCE_LIBRARY, (rows ?? []) as LibraryCheckRow[]);
  const batch = opts.keys ? eligible : eligible.slice(0, batchSize);

  const results: LibraryCheckResult[] = [];
  const deferred: string[] = [];
  for (const s of batch) {
    const remaining = deadline - clock();
    if (remaining < LIBRARY_CHECK_MIN_START_MS) {
      deferred.push(s.key);
      continue;
    }
    const prev = previous.get(s.key) ?? null;
    const attemptAt = new Date(clock()).toISOString();
    const mark = prev
      ? await admin.from("sourcing_library_checks").update({ last_attempt_at: attemptAt }).eq("key", s.key)
      : await admin.from("sourcing_library_checks").upsert({ key: s.key, checked_at: attemptAt, last_attempt_at: attemptAt, status: "unreachable", adapter: s.adapter, message: "Vérification commencée et non terminée (fonction interrompue ?) : elle sera reprise." });
    if (mark.error) log.warn("tentative de vérification non marquée", { key: s.key, error: mark.error.message });

    const sourceBudget = remaining - 5_000;
    let r: LibraryCheckResult;
    try {
      r = await withDeadline(
        check(s, { ...opts.runtime, timeoutMs: Math.min(opts.runtime?.timeoutMs ?? 20_000, Math.max(5_000, Math.floor(sourceBudget / 3))) }, { previous: prev, deadline: deadline - 5_000, clock }),
        sourceBudget,
        () => ({ key: s.key, status: "unreachable", adapter: prev?.adapter ?? s.adapter, robotsAllowed: null, httpStatus: null, productCount: 0, sample: [], message: `Vérification interrompue : budget de ${Math.round(budgetMs / 1000)} s du passage atteint.`, durationMs: sourceBudget }),
      );
    } catch (e) {
      r = { key: s.key, status: "unreachable", adapter: s.adapter, robotsAllowed: null, httpStatus: null, productCount: 0, sample: [], message: e instanceof Error ? e.message.slice(0, 500) : String(e), durationMs: 0 };
    }
    results.push(r);
    const { error } = await admin.from("sourcing_library_checks").upsert({
      key: r.key,
      checked_at: new Date(clock()).toISOString(),
      last_attempt_at: attemptAt,
      status: r.status,
      adapter: r.adapter,
      robots_allowed: r.robotsAllowed,
      http_status: r.httpStatus,
      product_count: r.productCount,
      sample: r.sample as unknown as Json,
      message: r.message,
      duration_ms: r.durationMs,
    });
    if (error) log.error("enregistrement de la vérification impossible", { key: r.key, error: error.message });
  }
  const pending = eligible.length - results.length;
  log.info("vérifications de la bibliothèque", { checked: results.length, deferred: deferred.length, pending });
  return { results, deferred, pending, batchSize, budgetMs, durationMs: clock() - started };
}

export interface LibraryEntryDTO {
  key: string;
  name: string;
  website: string;
  segment: LibrarySegment;
  country: string;
  currency: string;
  access: LibraryAccess;
  termsUrl: string;
  /** « confirmed » : page des conditions prouvée ; « unverified » : page d'accueil ou chemin supposé */
  termsStatus: TermsStatus;
  termsLabel: string;
  /** l'activation exige que l'utilisateur indique la page des conditions qu'il a lue */
  requiresTermsUrl: boolean;
  notes: string;
  check: { status: LibraryCheckResult["status"]; checkedAt: string; productCount: number | null; message: string | null; sample: Json } | null;
  /** activable : dernière vérification réelle « ok » */
  activatable: boolean;
  /** source déjà activée dans l'organisation */
  sourceId: string | null;
  /** raison du blocage (conditions du fournisseur) */
  blocked: string | null;
}

export async function sourceLibrary(ctx: OrgContext): Promise<{ entries: LibraryEntryDTO[] }> {
  const [checks, sources] = await Promise.all([
    ctx.supabase.from("sourcing_library_checks").select("*"),
    ctx.supabase.from("supplier_sources").select("id, config").eq("organization_id", ctx.organization.id),
  ]);
  if (checks.error) throw checks.error;
  if (sources.error) throw sources.error;
  const byKey = new Map((checks.data ?? []).map((c) => [c.key, c]));
  const activated = new Map<string, string>();
  for (const src of sources.data ?? []) {
    const k = (src.config as { library_key?: unknown } | null)?.library_key;
    if (typeof k === "string") activated.set(k, src.id);
  }
  return {
    entries: SOURCE_LIBRARY.map((s) => {
      const c = byKey.get(s.key);
      const termsStatus = termsStatusOf(s);
      return {
        key: s.key,
        name: s.name,
        website: s.website,
        segment: s.segment,
        country: s.country,
        currency: s.currency,
        access: s.access,
        termsUrl: s.termsUrl,
        termsStatus,
        termsLabel: TERMS_STATUS_LABEL[termsStatus],
        requiresTermsUrl: termsStatus !== "confirmed",
        notes: s.notes,
        check: c ? { status: c.status as LibraryCheckResult["status"], checkedAt: c.checked_at, productCount: c.product_count, message: c.message, sample: c.sample } : null,
        activatable: !s.blocked && c?.status === "ok",
        sourceId: activated.get(s.key) ?? null,
        blocked: s.blocked ?? null,
      };
    }),
  };
}

/** Même site (domaine identique ou sous-domaine, « www. » ignoré) : la page des conditions doit appartenir au fournisseur. */
export function termsUrlMatchesSite(termsUrl: string, website: string): boolean {
  let t: URL;
  let w: URL;
  try {
    t = new URL(termsUrl);
    w = new URL(website);
  } catch {
    return false;
  }
  if (t.protocol !== "https:" || t.username || t.password) return false;
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const th = strip(t.hostname);
  const wh = strip(w.hostname);
  return th === wh || th.endsWith(`.${wh}`) || wh.endsWith(`.${th}`);
}

/**
 * Corps de l'activation (Edge POST /sourcing/library/activate et site web) : attestation de
 * l'utilisateur, et page des conditions qu'il a lue (exigée quand MON STOCK ne l'a pas confirmée).
 */
export const libraryActivateSchema = z.object({
  key: z.string().min(1).max(80),
  attest: z.literal(true, { error: "Confirmez avoir lu les conditions d'utilisation de la source." }),
  termsUrl: z.string().trim().url("Adresse de la page des conditions invalide.").max(500).optional(),
});

/** Validation humaine d'une activation : qui, quand, quelle page des conditions a été lue. */
export interface LibraryActivationReview {
  /** utilisateur qui valide (auth.users.id) — jamais une tâche planifiée */
  userId: string;
  /** libellé de l'utilisateur dans la trace (e-mail, sinon identifiant) */
  userLabel: string;
  /** page des conditions lue par l'utilisateur (exigée tant que la page connue n'est pas confirmée) */
  termsUrl?: string | null;
  channel: "web" | "mobile";
  at?: Date;
}

/** Trace enregistrée dans supplier_sources.access_conditions : uniquement ce que l'utilisateur a déclaré et ce que le serveur a vérifié. */
export function activationTrace(s: LibrarySource, review: LibraryActivationReview, termsUrl: string, checkedAt: string | null): string {
  const at = (review.at ?? new Date()).toISOString();
  const status = termsStatusOf(s) === "confirmed" ? "page des conditions confirmée par MON STOCK" : "page des conditions indiquée par l'utilisateur, NON vérifiée par MON STOCK";
  return `Validation humaine : ${review.userLabel} (${review.userId}) déclare le ${at} (${review.channel === "web" ? "site web" : "application mobile"}) avoir lu les conditions d'utilisation (${termsUrl} — ${status}) et qu'elles autorisent cet accès automatisé. Contrôle serveur distinct : robots.txt et produits avec prix${checkedAt ? ` le ${checkedAt}` : ""}.`;
}

/** Activation depuis l'application (session de l'utilisateur, RLS) : la validation est celle de l'utilisateur connecté. */
export async function activateLibrarySource(ctx: OrgContext, key: string, input: { termsUrl?: string | null } = {}, channel: LibraryActivationReview["channel"] = "mobile"): Promise<{ sourceId: string; supplierId: string; alreadyActive: boolean }> {
  return activateLibrarySourceFor(ctx.supabase, ctx.organization.id, key, { userId: ctx.user.id, userLabel: ctx.user.email ?? ctx.user.id, termsUrl: input.termsUrl ?? null, channel });
}

/**
 * Activation d'une source de la bibliothèque pour une organisation, sous la session de
 * l'utilisateur qui valide (RLS). Exige : source non bloquée, dernière vérification serveur « ok »,
 * validation humaine (utilisateur, date) et, si la page des conditions n'est pas confirmée,
 * l'adresse de la page que l'utilisateur a lue (même site que le fournisseur).
 */
export async function activateLibrarySourceFor(
  db: OrgContext["supabase"] | AdminSupabaseClient,
  organizationId: string,
  key: string,
  review: LibraryActivationReview,
  /** adaptateur imposé : celui de la bibliothèque, vérifié en mode catalogue (collecte complète), plutôt que celui qui a répondu à la recherche de contrôle */
  opts: { adapter?: string } = {},
): Promise<{ sourceId: string; supplierId: string; alreadyActive: boolean }> {
  const s = getLibrarySource(key);
  if (!s) throw new AppError("NOT_FOUND", "Source inconnue.");
  if (s.blocked) throw new AppError("FORBIDDEN", s.blocked);
  if (!review.userId) throw new AppError("FORBIDDEN", "L'activation d'une source exige la validation d'un utilisateur identifié.");
  const confirmed = termsStatusOf(s) === "confirmed";
  const declared = review.termsUrl?.trim() || null;
  if (!confirmed && !declared) {
    throw new AppError("VALIDATION", `La page des conditions d'utilisation de ${s.name} n'a pas été vérifiée par MON STOCK : indiquez l'adresse exacte de la page des conditions que vous avez lue sur ${s.website} (mettez l'application à jour si ce champ n'apparaît pas).`);
  }
  if (declared && !termsUrlMatchesSite(declared, s.website)) throw new AppError("VALIDATION", `La page des conditions doit être une adresse https du site du fournisseur (${s.website}).`);
  const termsUrl = declared ?? s.termsUrl;

  const { data: check } = await db.from("sourcing_library_checks").select("status, checked_at, adapter").eq("key", key).maybeSingle();
  if (check?.status !== "ok") throw new AppError("VALIDATION", "Cette source n'a pas passé la vérification en direct (robots.txt + produits avec prix) : elle ne peut pas être activée.");

  const { data: existing } = await db.from("supplier_sources").select("id, supplier_id, config").eq("organization_id", organizationId);
  const found = (existing ?? []).find((r) => (r.config as { library_key?: unknown } | null)?.library_key === key);
  if (found) return { sourceId: found.id, supplierId: found.supplier_id, alreadyActive: true };

  const reviewedAt = (review.at ?? new Date()).toISOString();
  const country = s.country.length === 2 && s.country !== "EU" ? s.country : null;
  const { data: supplier, error: supErr } = await db
    .from("suppliers")
    .insert({ organization_id: organizationId, name: s.name.slice(0, 200), website: s.website, country, currency: s.currency, notes: `Ajouté depuis la bibliothèque de sources MON STOCK (${s.key}). ${s.notes}` })
    .select("id")
    .single();
  if (supErr || !supplier) throw supErr ?? new AppError("INTERNAL", "Fournisseur non créé.");
  const { data: source, error: srcErr } = await db
    .from("supplier_sources")
    .insert({
      organization_id: organizationId,
      supplier_id: supplier.id,
      name: s.name.slice(0, 200),
      source_type: s.access === "official_api" ? "API" : "PUBLIC_WEB",
      base_url: s.baseUrl,
      country,
      default_currency: s.currency,
      default_tax_type: s.taxType,
      access_conditions: activationTrace(s, { ...review, at: new Date(reviewedAt) }, termsUrl, check.checked_at).slice(0, 2000),
      automated_access_confirmed: true,
      access_reviewed_by: review.userId,
      access_reviewed_at: reviewedAt,
      terms_url: termsUrl.slice(0, 500),
      terms_status: confirmed ? "confirmed" : "user_declared",
      robots_checked_at: check.checked_at,
      robots_allowed: s.access === "official_api" ? null : true,
      sync_frequency: "manual",
      status: "active",
      // Adaptateur ayant réellement répondu lors de la vérification (détection de plateforme).
      config: { adapter: opts.adapter ?? check.adapter ?? s.adapter, library_key: s.key } as unknown as NonNullable<Json>,
    })
    .select("id")
    .single();
  if (srcErr || !source) {
    await db.from("suppliers").delete().eq("id", supplier.id).eq("organization_id", organizationId);
    throw srcErr ?? new AppError("INTERNAL", "Source non créée.");
  }
  log.info("source de bibliothèque activée", { orgId: organizationId, key, termsStatus: confirmed ? "confirmed" : "user_declared" });
  return { sourceId: source.id, supplierId: supplier.id, alreadyActive: false };
}

/** Source de la bibliothèque active dans une organisation, à faire revalider par le titulaire. */
export interface LibrarySourceToRevalidate {
  organizationId: string;
  sourceId: string;
  libraryKey: string;
  name: string;
  status: string;
  termsUrl: string | null;
  termsStatus: TermsStatus;
  reasons: string[];
}

/** Attestation générée par l'ancienne activation planifiée (`/cron/library-activate`, supprimée). */
export const GENERATED_ATTESTATION_RE = /robots\.txt vérifié par le serveur|Activation enregistrée le/;

/**
 * Rapport (lecture seule) : sources de la bibliothèque activées sans validation humaine tracée,
 * avec une attestation générée par une tâche planifiée, ou dont la page des conditions n'est pas
 * confirmée. Rien n'est désactivé : la décision appartient au titulaire du compte.
 */
export async function librarySourcesToRevalidate(admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<LibrarySourceToRevalidate[]> {
  const { data, error } = await admin
    .from("supplier_sources")
    .select("id, organization_id, name, status, config, access_conditions, access_reviewed_by, access_reviewed_at, terms_url, terms_status")
    .neq("status", "paused")
    .order("organization_id")
    .order("id")
    .limit(1000);
  if (error) throw new Error(`Lecture des sources impossible : ${error.message}`);
  const out: LibrarySourceToRevalidate[] = [];
  for (const r of data ?? []) {
    const key = (r.config as { library_key?: unknown } | null)?.library_key;
    if (typeof key !== "string") continue;
    const lib = getLibrarySource(key);
    const termsStatus: TermsStatus = r.terms_status === "confirmed" || (!r.terms_status && lib && termsStatusOf(lib) === "confirmed") ? "confirmed" : "unverified";
    const reasons: string[] = [];
    if (!r.access_reviewed_by || !r.access_reviewed_at) reasons.push("aucune validation humaine tracée (utilisateur, date)");
    if (r.access_conditions && GENERATED_ATTESTATION_RE.test(r.access_conditions)) reasons.push("attestation générée par une tâche planifiée");
    if (termsStatus !== "confirmed") reasons.push("page des conditions non confirmée");
    if (lib?.blocked) reasons.push("source désormais bloquée par les conditions du fournisseur");
    if (reasons.length) out.push({ organizationId: r.organization_id, sourceId: r.id, libraryKey: key, name: r.name, status: r.status, termsUrl: r.terms_url ?? lib?.termsUrl ?? null, termsStatus, reasons });
  }
  return out;
}
