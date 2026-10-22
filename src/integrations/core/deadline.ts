/**
 * Échéance interne d'un traitement borné (synchronisation, cron) : instant absolu (ms depuis
 * l'époque) au-delà duquel aucun nouvel appel ni aucune nouvelle unité de travail n'est démarré.
 * Les plateformes d'exécution (Supabase Edge Function : ~150 s d'horloge) tuent le processus
 * sans laisser au code le temps d'enregistrer sa progression : on s'arrête AVANT, proprement.
 */

/** Durée minimale restante pour lancer un appel réseau (en deçà : on s'arrête et on reprendra). */
export const MIN_CALL_REMAINING_MS = 1_500;

/**
 * Levée quand l'échéance interne est atteinte (avant un appel, ou appel coupé parce que son délai
 * avait été réduit au temps restant). Ce n'est PAS une panne du service distant : l'appelant
 * arrête proprement son traitement et le reprend au passage suivant.
 */
export class DeadlineExceededError extends Error {
  readonly label: string | null;
  constructor(label: string | null = null) {
    super(`Échéance interne atteinte${label ? ` avant ou pendant ${label}` : ""} : traitement interrompu proprement, reprise au prochain passage.`);
    this.name = "DeadlineExceededError";
    this.label = label;
  }
}

export function isDeadlineExceeded(e: unknown): e is DeadlineExceededError {
  return e instanceof DeadlineExceededError;
}

/** Temps restant avant l'échéance (Infinity si aucune échéance). */
export function remainingMs(deadline: number | null | undefined, now: number = Date.now()): number {
  if (deadline === null || deadline === undefined || !Number.isFinite(deadline)) return Number.POSITIVE_INFINITY;
  return deadline - now;
}
