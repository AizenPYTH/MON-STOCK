/**
 * Jauge de robustesse INDICATIVE du mot de passe (parcours v2, handoff §D).
 *
 * La seule règle réelle est celle du serveur (`passwordSchema` : 8 caractères minimum, 128 au plus) :
 * cette estimation ne bloque rien, ne désactive aucun bouton et ne remplace aucune validation. Elle
 * aide seulement à choisir un mot de passe plus long ou plus varié.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; meetsRule: boolean };

export function passwordStrength(password: string): PasswordStrength {
  // Même mesure que la règle du serveur (zod `.min(8)` : longueur JavaScript).
  const length = password.length;
  if (length === 0) return { score: 0, label: "Robustesse indicative", meetsRule: false };
  if (length < PASSWORD_MIN_LENGTH) return { score: 1, label: `Trop court : ${length} / ${PASSWORD_MIN_LENGTH} caractères`, meetsRule: false };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const bonus = (length >= 12 ? 1 : 0) + (classes >= 3 ? 1 : 0);
  const score = (2 + bonus) as 2 | 3 | 4;
  return { score, label: score === 4 ? "Robuste" : score === 3 ? "Bon" : "Correct", meetsRule: true };
}
