/**
 * PARTNER_FEED — fournisseurs partenaires (flux SFTP / EDI / API dédiée).
 *
 * Non implémenté : cette note documente l'emplacement prévu dans l'architecture.
 * Un flux partenaire sera un transport (SFTP, EDI, HTTP signé) livrant des fichiers
 * CSV/XML/JSON lus par les parsers existants (services/sourcing/feed-parsers.ts),
 * avec les identifiants de transport chiffrés dans supplier_connection_secrets.
 */
export interface PartnerFeedTransport {
  readonly kind: "sftp" | "edi" | "https";
  /** Récupère le contenu du dernier fichier publié par le partenaire. */
  fetchLatest(): Promise<{ filename: string; content: string } | null>;
}

export const PARTNER_FEED_STATUS = {
  implemented: false,
  message: "Les flux partenaires (SFTP / EDI) ne sont pas encore disponibles. Utilisez un flux CSV / XML / JSON par URL ou import de fichier.",
} as const;
