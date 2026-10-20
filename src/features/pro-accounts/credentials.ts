/**
 * Identifiants saisis dans le formulaire de connexion d'un compte pro (pur, testé).
 * Champs nommés `cred.<nom>` ; mêmes bornes que l'Edge Function (nom ≤ 80, valeur ≤ 2000).
 * Le service vérifie ensuite les champs requis par le connecteur et les chiffre côté serveur.
 */
export const CREDENTIAL_PREFIX = "cred.";
const MAX_FIELDS = 20;

export function credentialFieldName(name: string): string {
  return `${CREDENTIAL_PREFIX}${name}`;
}

export function credentialsFromFormData(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith(CREDENTIAL_PREFIX) || typeof v !== "string") continue;
    const name = k.slice(CREDENTIAL_PREFIX.length);
    if (!name || name.length > 80) continue;
    if (Object.keys(out).length >= MAX_FIELDS) break;
    out[name] = v.slice(0, 2000);
  }
  return out;
}
