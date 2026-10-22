/**
 * Thème clair / sombre : préférence de l'utilisateur (« system » | « light » | « dark »).
 * - « system » : aucun attribut, le CSS suit `prefers-color-scheme` ;
 * - « light » / « dark » : `data-theme` sur <html>.
 * La préférence est gardée dans localStorage ET dans un cookie (lisible par le serveur plus tard).
 *
 * Branchement (layout racine, autre lot) :
 *   <html … suppressHydrationWarning>
 *     <head><ThemeScript /></head>
 * Le script s'exécute avant la première peinture : aucun flash de thème. La CSP actuelle
 * (script-src 'unsafe-inline') l'autorise ; avec une CSP à nonce, passer `nonce`.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "ms-theme";
export const THEME_COOKIE = "ms-theme";

export const themeInitScript = `(function(){try{var t=null;try{t=window.localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)/);t=m?m[1]:null}if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

/** Script bloquant à placer dans <head> du layout racine (composant serveur). */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}
