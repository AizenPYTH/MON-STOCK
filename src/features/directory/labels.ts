/**
 * Annuaire des fournisseurs (web) — libellés et petites fonctions pures, partagés par les pages
 * serveur et les composants client. Repris de l'application iPhone (apps/mobile/src/data/
 * suppliers-pro.ts, components/supplier-library.tsx) sans dépendance React Native.
 */
import type { DirectoryEntryDTO, DirectoryStage } from "@/features/mobile-api/contract";
import type { BadgeVariant } from "@/components/ui/badge";
import { ACCESS_METHOD_LABEL, INTEGRATION_STATUS_LABEL, RELIABILITY_LABEL, SEGMENT_LABEL } from "@/domain/sourcing/supplier-registry";

export { ACCESS_METHOD_LABEL, INTEGRATION_STATUS_LABEL, RELIABILITY_LABEL, SEGMENT_LABEL };

export type DirectoryEntry = DirectoryEntryDTO;
export type AccessMethod = DirectoryEntryDTO["registry"]["accessMethods"][number];
export type OrgStatus = DirectoryEntryDTO["org"]["status"];

export const STAGE_LABEL: Record<DirectoryStage, string> = {
  identified: "Identifié",
  verified: "Site vérifié",
  public_access: "Accès public fonctionnel",
  account_required: "Compte pro requis",
  connector_ready: "Connecteur prêt (identifiants requis)",
  import_tested: "Import réel testé",
  unavailable: "Site indisponible",
};

export const TIER_LABEL: Record<DirectoryEntryDTO["tier"], string> = {
  connected: "Connecté",
  importable: "Importable",
  accessible: "Accessible",
  verified: "Vérifié",
  identified: "Identifié",
};

export const TIER_HINT: Record<DirectoryEntryDTO["tier"], string> = {
  connected: "Source active ou import réussi dans votre organisation.",
  importable: "Fournit un fichier, un flux ou une API que MON STOCK sait importer.",
  accessible: "Catalogue public consultable, site vérifié.",
  verified: "Site officiel joignable depuis le serveur.",
  identified: "Issu de la recherche, rien de vérifié.",
};

export const ORG_STATUS_LABEL: Record<OrgStatus, string> = { connected: "Connecté", pending: "En attente", error: "Erreur", not_connected: "Non connecté" };
export const ORG_STATUS_VARIANT: Record<OrgStatus, BadgeVariant> = { connected: "success", pending: "warning", error: "danger", not_connected: "neutral" };

export const INTEGRATION_VARIANT: Record<DirectoryEntryDTO["registry"]["integrationStatus"], BadgeVariant> = {
  connected_tested: "success",
  in_progress: "info",
  public_available: "accent",
  api_to_integrate: "accent",
  feed_to_integrate: "accent",
  file_import: "neutral",
  pro_account_required: "warning",
  commercial_access_needed: "warning",
  not_automatable: "neutral",
  abandoned: "danger",
};

/** Modes d'accès annoncés par la recherche documentaire. */
export const ACCESS_MODE_LABEL: Record<string, string> = {
  api: "API",
  feed_csv: "Flux CSV",
  feed_xml: "Flux XML",
  feed_json: "Flux JSON",
  edi: "EDI",
  public_catalog: "Catalogue public",
  pro_portal: "Portail pro",
  manual_download: "Fichier à télécharger",
  pdf_price_list: "Tarif PDF",
  email_quote: "Devis par e-mail",
  email_pricelist: "Liste de prix par e-mail",
  feed: "Flux de données",
  marketplace: "Place de marché",
};

/** Ce que chaque méthode permet concrètement dans MON STOCK. */
export const METHOD_DETAIL: Record<AccessMethod, string> = {
  official_api: "Connecteur MON STOCK prêt : saisissez les identifiants API de VOTRE compte ; prix et stocks récupérés automatiquement.",
  oauth: "Autorisation officielle : vous vous connectez chez le fournisseur, MON STOCK reçoit un accès limité et révocable.",
  catalog_feed: "Le fournisseur fournit un lien de flux (CSV, XML, JSON, EDI) : il se met à jour sans intervention.",
  portal_export: "Depuis votre espace client, exportez la liste de prix et importez-la dans MON STOCK.",
  manual_import: "Importez le fichier reçu ou téléchargé (CSV, Excel, XML, JSON) : aperçu, correspondance des colonnes mémorisée, sans doublon.",
  custom_development: "API annoncée sans documentation publique : intégration possible après réception de la documentation et des accès.",
  pro_account_first: "Il faut d'abord VOTRE compte revendeur chez ce fournisseur (souvent Kbis et n° de TVA).",
  not_automatable: "Aucune intégration automatisable aujourd'hui : consultation sur leur site, ou import d'un fichier s'ils en fournissent un.",
  public_integrated: "Catalogue public déjà intégré à MON STOCK : activez-le pour voir ses produits dans vos recherches, avec le lien de chaque fiche.",
};

/** Nom court (sans la précision entre parenthèses ni le sous-titre après un tiret). */
export function shortName(name: string): string {
  return name.split(/\s+[—–]\s+/)[0]!.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

/** Pays : code ISO tel quel (pas de drapeau emoji, non rendu sous Windows) ; inconnu → « — ». */
export function countryLabel(country: string | null | undefined): string {
  if (!country) return "—";
  const c = country.trim();
  return /^[A-Za-z]{2,3}$/.test(c) ? c.toUpperCase() : c || "—";
}

export function segmentLabel(segment: string): string {
  return SEGMENT_LABEL[segment] ?? segment;
}

/** Lien mailto prêt à l'emploi (destinataire choisi par l'utilisateur : aucun envoi automatique). */
export function mailtoLink(email: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}

/** Statut affiché sur une carte : état réel dans l'organisation s'il y en a un, sinon statut d'intégration. */
export function displayStatus(e: Pick<DirectoryEntry, "org" | "registry">): { label: string; variant: BadgeVariant } {
  if (e.org.status !== "not_connected") return { label: ORG_STATUS_LABEL[e.org.status], variant: ORG_STATUS_VARIANT[e.org.status] };
  return { label: INTEGRATION_STATUS_LABEL[e.registry.integrationStatus], variant: INTEGRATION_VARIANT[e.registry.integrationStatus] };
}

export type StepState = "done" | "current" | "todo" | "error";

export interface ProgressStep {
  key: string;
  label: string;
  state: StepState;
  detail: string;
}

/**
 * Frise d'avancement d'une fiche, étape par étape, uniquement sur preuves (statuts calculés par
 * le serveur) : rien n'est « fait » sans vérification, connexion testée ou import réussi. Pur.
 */
export function progressSteps(e: Pick<DirectoryEntry, "stages" | "org" | "check" | "researchedAt" | "proAccountRequired" | "registry">): ProgressStep[] {
  const has = (s: DirectoryStage) => e.stages.includes(s);
  const steps: ProgressStep[] = [
    { key: "identified", label: "Identifié", state: "done", detail: `Fiche issue de la recherche documentaire du ${e.researchedAt.split("-").reverse().join("/")}.` },
    has("unavailable")
      ? { key: "verified", label: "Site vérifié", state: "error", detail: e.check?.message ?? "Site injoignable lors de la dernière vérification serveur." }
      : has("verified")
        ? { key: "verified", label: "Site vérifié", state: "done", detail: e.check?.message ?? "Site officiel joignable depuis le serveur." }
        : { key: "verified", label: "Site vérifié", state: "todo", detail: "Pas encore vérifié depuis le serveur." },
  ];
  if (has("public_access")) steps.push({ key: "access", label: "Accès au catalogue", state: "done", detail: "Catalogue public lu automatiquement lors de la vérification de la bibliothèque." });
  else if (has("connector_ready")) steps.push({ key: "access", label: "Accès au catalogue", state: e.org.connectionId ? "done" : "current", detail: e.org.connectionId ? "Identifiants de votre compte enregistrés (chiffrés côté serveur)." : "Connecteur MON STOCK prêt : identifiants de votre compte requis." });
  else if (has("account_required") || e.proAccountRequired) steps.push({ key: "access", label: "Accès au catalogue", state: e.org.status === "connected" ? "done" : "current", detail: e.org.status === "connected" ? "Prix de votre compte reçus." : "Compte professionnel à ouvrir chez le fournisseur." });
  else steps.push({ key: "access", label: "Accès au catalogue", state: e.org.status === "connected" ? "done" : "todo", detail: e.org.status === "connected" ? "Offres reçues dans votre organisation." : "Catalogue à obtenir (fichier, flux ou export)." });
  steps.push(
    e.org.status === "connected"
      ? { key: "connected", label: "Connecté dans votre organisation", state: "done", detail: "Connexion testée, source active ou offres reçues." }
      : e.org.status === "error"
        ? { key: "connected", label: "Connecté dans votre organisation", state: "error", detail: e.org.lastError ?? "Connexion en erreur." }
        : e.org.status === "pending"
          ? { key: "connected", label: "Connecté dans votre organisation", state: "current", detail: "Connexion enregistrée, en attente d'un test réussi." }
          : { key: "connected", label: "Connecté dans votre organisation", state: "todo", detail: "Pas encore connecté." },
  );
  steps.push(has("import_tested") ? { key: "import", label: "Import réel testé", state: "done", detail: "Un import de son catalogue a réussi dans votre organisation." } : { key: "import", label: "Import réel testé", state: "todo", detail: "Aucun import réussi pour l'instant." });
  return steps;
}

/** Avantages et limites lisibles d'une fiche (mêmes règles que la fiche mobile). Pur. */
export function advantagesAndLimits(e: Pick<DirectoryEntry, "registry" | "pricesTax" | "partQuality" | "proAccountRequired" | "moq">): { advantages: string[]; limits: string[] } {
  const r = e.registry;
  const advantages = [...r.priority.reasons, e.pricesTax === "HT" ? "Prix affichés HT" : null, e.partQuality ? `Qualités : ${e.partQuality}` : null].filter((x): x is string => Boolean(x));
  const limits = [
    r.abandonedReason,
    r.accessMethods.includes("not_automatable") ? "Aucune intégration automatisable actuellement." : null,
    r.accessMethods.includes("custom_development") ? "API sans documentation publique : accès commercial à obtenir." : null,
    e.proAccountRequired ? "Compte professionnel requis : vos propres identifiants, jamais partagés." : null,
    r.reliability === "inferred" ? "Informations issues de sources secondaires : à confirmer avec le fournisseur." : null,
    e.moq ? `Minimum de commande : ${e.moq}` : null,
  ].filter((x): x is string => Boolean(x));
  return { advantages, limits };
}

export type StatusTone = "ok" | "low" | "out" | "neutral";

/** Ton du point de statut d'une fiche : état réel dans l'organisation, sinon neutre (écarté → rouge). Pur. */
export function statusTone(e: Pick<DirectoryEntry, "org" | "registry">): StatusTone {
  if (e.org.status === "connected") return "ok";
  if (e.org.status === "pending") return "low";
  if (e.org.status === "error") return "out";
  if (e.registry.integrationStatus === "connected_tested") return "ok";
  if (e.registry.integrationStatus === "abandoned") return "out";
  return "neutral";
}

/** Méthode d'accès principale affichée sur une carte (le préalable « compte pro » est signalé à part). Pur. */
export function mainMethod(e: Pick<DirectoryEntry, "registry">): { label: string; tone: "dark" | "danger" | "neutral" } | null {
  const m = e.registry.accessMethods.find((x) => x !== "pro_account_first") ?? e.registry.accessMethods[0];
  if (!m) return null;
  return { label: ACCESS_METHOD_LABEL[m], tone: m === "official_api" || m === "public_integrated" ? "dark" : m === "not_automatable" ? "danger" : "neutral" };
}
