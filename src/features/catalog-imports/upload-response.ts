import type { ActionResult } from "@/lib/result";
import { WEB_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";

/** Hébergé sur Vercel, le site refuse les envois de plus de ~4,5 Mo (limite de la plateforme, réponse 413). */
export const TOO_LARGE_ONLINE = `Fichier trop volumineux pour être envoyé par le site (${WEB_UPLOAD_MAX_LABEL} maximum en ligne) : importez-le depuis l'application iPhone (15 Mo maximum) ou configurez un flux automatique.`;
export const SESSION_EXPIRED_UPLOAD = "Votre session a expiré. Reconnectez-vous pour continuer : rien n'a été enregistré.";
export const UNREACHABLE_UPLOAD = "Le serveur MON STOCK est injoignable ou la connexion a été coupée : vérifiez votre connexion puis réessayez. Rien n'a été enregistré.";

/**
 * Réponse NON exploitable (pas du JSON de l'application) d'un envoi de catalogue → message juste
 * (W-21). Auparavant, toute réponse non JSON était présentée comme « session expirée », y compris
 * une erreur 500 ou un délai dépassé (504) de la plateforme.
 */
export function describeUploadResponse(res: { redirected: boolean; url: string; status: number; contentType: string | null }): ActionResult<never> | null {
  let redirectedTo: string | null = null;
  try {
    redirectedTo = res.redirected ? new URL(res.url).pathname : null;
  } catch {
    redirectedTo = null;
  }
  if (redirectedTo === "/login") return { ok: false, error: SESSION_EXPIRED_UPLOAD, action: { label: "Se reconnecter", href: "/login" } };
  if (res.status === 401) return { ok: false, error: SESSION_EXPIRED_UPLOAD, action: { label: "Se reconnecter", href: "/login" } };
  if ((res.contentType ?? "").includes("application/json") && !res.redirected) return null;
  if (res.status === 413) return { ok: false, error: TOO_LARGE_ONLINE };
  if (res.status === 504 || res.status === 408) {
    return { ok: false, error: `Le traitement a dépassé le délai autorisé (HTTP ${res.status}). Le fichier a peut-être été partiellement importé : vérifiez l'historique des imports avant de réessayer, ou découpez le fichier.` };
  }
  if (res.status >= 500) return { ok: false, error: `Le serveur n'a pas pu traiter le fichier (HTTP ${res.status}). Réessayez dans un instant ; si le problème persiste, contactez le support.` };
  return { ok: false, error: `Réponse inattendue du serveur (HTTP ${res.status}). Rien n'a été enregistré : rechargez la page puis réessayez.` };
}
