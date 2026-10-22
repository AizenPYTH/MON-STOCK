/**
 * Informations légales du site. Les champs `null` ne sont PAS inventés : ils doivent être fournis
 * par l'éditeur (raison sociale, adresse, SIREN, directeur de publication, e-mail de contact).
 * Tant qu'ils manquent, les pages affichent « à compléter par l'éditeur ».
 */
export const LEGAL = {
  publisher: null as string | null,
  legalForm: null as string | null,
  address: null as string | null,
  registration: null as string | null,
  publicationDirector: null as string | null,
  contactEmail: null as string | null,
  lastUpdated: "2026-10-20",
} as const;

/** Prestataires réellement utilisés par l'application (sous-traitants au sens du RGPD). */
export const PROCESSORS = [
  { name: "Supabase", role: "Base de données, authentification et fonctions serveur", location: "Union européenne (Irlande, eu-west-1)" },
  { name: "Vercel", role: "Hébergement du site web", location: "Réseau mondial, société établie aux États-Unis" },
  { name: "OpenAI", role: "Conseiller et assistant IA, synthèse vocale (uniquement si vous les utilisez)", location: "États-Unis" },
  { name: "eBay", role: "Synchronisation de vos annonces et commandes (uniquement si vous connectez votre compte)", location: "Selon votre compte eBay" },
  { name: "Sendcloud, Boxtal", role: "Devis d'expédition (uniquement si vous utilisez le comparateur)", location: "Union européenne" },
  { name: "Packlink", role: "Devis d'expédition (uniquement si vous utilisez le comparateur et que le service est activé)", location: "Union européenne" },
  { name: "La Poste (API Suivi)", role: "Suivi des colis que vous ajoutez", location: "France" },
  { name: "Ship24, DHL", role: "Suivi des colis d'autres transporteurs (uniquement si le service est activé)", location: "Selon le prestataire" },
  { name: "Brave Search", role: "Découverte de nouveaux fournisseurs : seuls les mots-clés de recherche sont envoyés (uniquement si le service est activé)", location: "États-Unis" },
  { name: "Apple", role: "Distribution de l'application iPhone (TestFlight / App Store) et dictée vocale de l'iPhone", location: "Selon les conditions d'Apple" },
  { name: "Éditeur de votre navigateur (Google, Apple, Microsoft…)", role: "Dictée vocale sur le site : la reconnaissance de la parole est faite par le navigateur, qui peut l'envoyer à son éditeur", location: "Selon le navigateur" },
] as const;

export const HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  website: "https://vercel.com",
} as const;

export const TO_COMPLETE = "à compléter par l'éditeur";

/** Champs obligatoires des mentions légales (LCEN art. 6 III) : à fournir par l'éditeur, jamais à deviner. */
export const LEGAL_REQUIRED_FIELDS = {
  publisher: "Raison sociale ou nom de l'éditeur",
  legalForm: "Forme juridique et capital",
  address: "Adresse du siège",
  registration: "Immatriculation (SIREN / RCS)",
  publicationDirector: "Directeur de la publication",
  contactEmail: "E-mail de contact",
} as const satisfies Partial<Record<keyof typeof LEGAL, string>>;

export type LegalRequiredField = keyof typeof LEGAL_REQUIRED_FIELDS;

type LegalValues = { readonly [K in LegalRequiredField]: string | null };

/** Liste les champs obligatoires absents ou vides. Une liste non vide bloque la mise en vente publique. */
export function missingLegalFields(values: LegalValues = LEGAL): LegalRequiredField[] {
  return (Object.keys(LEGAL_REQUIRED_FIELDS) as LegalRequiredField[]).filter((k) => !values[k]?.trim());
}
