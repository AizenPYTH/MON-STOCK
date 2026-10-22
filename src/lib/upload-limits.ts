/**
 * Limites d'envoi de fichiers au SITE (W-09). Module pur, partagé client / serveur / next.config.
 *
 * Sur Vercel, le corps d'une requête vers une fonction est limité à ~4,5 Mo (réponse 413 au-delà) :
 * annoncer 15 ou 20 Mo depuis le site était faux. Les Server Actions sont, elles, bornées par Next
 * (1 Mo par défaut) : `serverActions.bodySizeLimit` est aligné sur la même limite pratique.
 * Les gros fichiers passent par l'application iPhone (15 Mo, Edge Function) ou un flux par URL.
 */
export const WEB_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const WEB_UPLOAD_MAX_LABEL = "4 Mo";

/** Corps maximal d'une Server Action : le fichier + la marge multipart (en-têtes, autres champs). */
export const SERVER_ACTION_BODY_LIMIT_BYTES = WEB_UPLOAD_MAX_BYTES + 256 * 1024;

/** Message unique pour un fichier trop gros envoyé depuis le site. */
export function webUploadTooLargeMessage(size: number): string | null {
  if (size <= WEB_UPLOAD_MAX_BYTES) return null;
  return `Fichier trop volumineux pour un envoi depuis le site (${WEB_UPLOAD_MAX_LABEL} maximum) : découpez-le, importez-le depuis l'application iPhone (15 Mo maximum) ou déclarez une URL de flux.`;
}

/**
 * Contrôle avant envoi d'un champ fichier (navigateur) : message de validation natif qui bloque la
 * soumission du formulaire, au lieu d'un refus tardif et générique du serveur.
 */
export function enforceWebUploadLimit(input: HTMLInputElement): void {
  const file = input.files?.[0];
  input.setCustomValidity((file && webUploadTooLargeMessage(file.size)) ?? "");
  if (file && !input.checkValidity()) input.reportValidity();
}
