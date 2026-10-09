/**
 * Retour d'eBay après autorisation (« Your auth accepted URL » / « declined URL » du RuName).
 *
 * eBay exige une URL https : cette page publique ne fait QUE relayer `code` et `state` vers
 * l'application (lien profond monstock://), sans rien enregistrer ni échanger. L'échange du code
 * se fait ensuite dans /api/ebay/finalize, sous la session de l'utilisateur qui a démarré le flux.
 * Sur iOS, le lien profond est capturé par la session d'authentification (ASWebAuthenticationSession)
 * qui a ouvert la page eBay : il n'est pas diffusé aux autres applications.
 */
export const EBAY_APP_CALLBACK = "monstock://ebay/callback";

const SAFE_CODE = /^[A-Za-z0-9._~\-#=%+/^]{1,2048}$/;
const SAFE_STATE = /^[A-Za-z0-9_-]{16,200}$/;

export function ebayCallbackTarget(url: URL): string {
  const target = new URL(EBAY_APP_CALLBACK);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    // Seul un code d'erreur connu circule (jamais un texte libre).
    target.searchParams.set("error", error === "access_denied" ? "access_denied" : "ebay_error");
  } else if (code && state && SAFE_CODE.test(code) && SAFE_STATE.test(state)) {
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
  } else {
    target.searchParams.set("error", "incomplete");
  }
  if (state && SAFE_STATE.test(state) && !target.searchParams.has("state")) target.searchParams.set("state", state);
  return target.toString();
}

export function ebayCallbackRedirect(url: URL): Response {
  const target = ebayCallbackTarget(url);
  // Page de secours si le navigateur n'ouvre pas l'application automatiquement.
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MON STOCK</title></head><body style="font-family:-apple-system,system-ui,sans-serif;padding:32px;text-align:center"><p>Retour vers MON STOCK…</p><p><a href="${target.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Ouvrir l'application</a></p></body></html>`;
  return new Response(html, { status: 302, headers: { Location: target, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
