/**
 * Échéance globale d'un tour d'IA (audit S-11, I-14) : un seul `AbortSignal` pour tout le tour
 * (appels au modèle, lectures des outils), déclenché à l'échéance OU quand le client se déconnecte.
 * Chaque appel au modèle reçoit en plus un délai = min(délai par appel, temps restant).
 */
export interface TurnBudget {
  /** annulé à l'échéance ou par le signal parent (déconnexion du client) */
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
  remaining(now?: number): number;
  /** vrai si l'annulation vient de l'échéance (et non du client) */
  timedOut(): boolean;
  dispose(): void;
}

export function turnBudget(totalMs: number, parent?: AbortSignal, now: number = Date.now()): TurnBudget {
  const controller = new AbortController();
  const deadlineAt = now + totalMs;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Échéance du tour atteinte", "TimeoutError"));
  }, Math.max(0, totalMs));
  const onParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason);
  else parent?.addEventListener("abort", onParent, { once: true });
  return {
    signal: controller.signal,
    deadlineAt,
    remaining: (at = Date.now()) => Math.max(0, deadlineAt - at),
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}

export class BudgetExceededError extends Error {
  constructor() {
    super("Délai dépassé");
    this.name = "BudgetExceededError";
  }
}

/**
 * Attend `work` sans dépasser le signal : à l'annulation, rejette immédiatement (le travail en cours
 * n'est plus attendu ; son résultat éventuel est ignoré).
 */
export function withinBudget<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new BudgetExceededError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new BudgetExceededError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}
