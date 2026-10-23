/**
 * File d'envoi du stepper de quantité (M-04), sans React : testable avec des minuteries simulées.
 *
 * Règles :
 *  - les taps s'accumulent dans `pending` et partent en UN mouvement après `delayMs` sans tap ;
 *  - au départ, le montant envoyé quitte `pending` (il passe dans `inFlight`) : un tap pendant la
 *    requête n'est ni perdu ni renvoyé deux fois ;
 *  - un seul envoi à la fois (sérialisé) : les taps arrivés pendant l'envoi partent au suivant ;
 *  - échec : tout ce qui n'est pas confirmé est abandonné (retour à la valeur de la base) et
 *    l'erreur est signalée — jamais de nouvel essai automatique.
 */
export interface StepperQueueState {
  pending: number;
  inFlight: number;
}

export interface StepperQueueOptions {
  delayMs: number;
  /** envoie un mouvement signé ; résout avec la quantité confirmée par la base (null si inconnue) */
  send: (delta: number) => Promise<number | null>;
  onConfirmed: (quantityAfter: number | null, delta: number) => void;
  onError: (error: unknown) => void;
  onState: (state: StepperQueueState) => void;
}

export class StepperQueue {
  private pending = 0;
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly options: StepperQueueOptions) {}

  state(): StepperQueueState {
    return { pending: this.pending, inFlight: this.inFlight };
  }

  /** Ajoute un tap (+1 / −1, ou l'écart demandé). */
  tap(delta: number): void {
    if (this.disposed || delta === 0) return;
    this.pending += delta;
    this.emit();
    this.schedule();
  }

  /** Envoie tout de suite ce qui reste (fermeture de l'écran : les taps ne sont pas perdus). */
  flushNow(): void {
    this.clearTimer();
    void this.flush();
  }

  dispose(): void {
    this.clearTimer();
    this.disposed = true;
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.delayMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.options.onState(this.state());
  }

  private async flush(): Promise<void> {
    if (this.inFlight !== 0 || this.pending === 0) return;
    const amount = this.pending;
    this.pending = 0;
    this.inFlight = amount;
    this.emit();
    try {
      const after = await this.options.send(amount);
      this.inFlight = 0;
      this.options.onConfirmed(after, amount);
      this.emit();
      if (this.pending !== 0 && !this.disposed) this.schedule();
      else if (this.pending !== 0) void this.flush();
    } catch (e) {
      this.inFlight = 0;
      this.pending = 0;
      this.clearTimer();
      this.emit();
      this.options.onError(e);
    }
  }
}
