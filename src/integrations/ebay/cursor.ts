/**
 * Fenêtre de récupération des commandes.
 * eBay indexe `lastmodifieddate` avec un léger décalage : on recule de quelques heures par
 * rapport au dernier curseur (chevauchement) ; l'ingestion étant idempotente, les
 * commandes déjà connues sont simplement mises à jour.
 */
export const ORDERS_OVERLAP_HOURS = 3;
/** Première synchronisation : eBay ne renvoie par défaut que les 90 derniers jours. */
export const ORDERS_INITIAL_LOOKBACK_DAYS = 90;

export interface OrdersWindow {
  since: Date;
  until: Date;
  /** true = première récupération (aucun curseur connu). */
  initial: boolean;
}

export function computeOrdersWindow(lastCursor: Date | string | null | undefined, now: Date = new Date(), options: { overlapHours?: number; initialLookbackDays?: number } = {}): OrdersWindow {
  const overlapMs = (options.overlapHours ?? ORDERS_OVERLAP_HOURS) * 3_600_000;
  const lookbackMs = (options.initialLookbackDays ?? ORDERS_INITIAL_LOOKBACK_DAYS) * 86_400_000;
  const cursor = lastCursor ? new Date(lastCursor) : null;
  if (!cursor || Number.isNaN(cursor.getTime())) {
    return { since: new Date(now.getTime() - lookbackMs), until: now, initial: true };
  }
  const since = new Date(Math.min(cursor.getTime() - overlapMs, now.getTime()));
  return { since, until: now, initial: false };
}

/**
 * Nouveau curseur après une fenêtre ENTIÈREMENT lue : la plus grande date de modification vue,
 * sinon la borne haute de la fenêtre (rien n'a été modifié avant elle). Jamais plus loin que `until`.
 */
export function nextOrdersCursor(window: OrdersWindow, maxModifiedSeen: Date | null): Date {
  if (!maxModifiedSeen) return window.until;
  return new Date(Math.min(maxModifiedSeen.getTime(), window.until.getTime()));
}

/**
 * Taille d'une tranche de récupération. eBay ne garantit pas que getOrders renvoie les commandes
 * triées par date de MODIFICATION : si la limite de pages est atteinte, « la plus grande date vue »
 * peut dépasser des commandes jamais lues. La fenêtre est donc découpée en tranches lues de la plus
 * ancienne à la plus récente : seule une tranche lue en entier fait avancer le curseur.
 */
export const ORDERS_SLICE_HOURS = 24;

export function splitOrdersWindow(window: OrdersWindow, sliceHours: number = ORDERS_SLICE_HOURS): OrdersWindow[] {
  const sliceMs = Math.max(1, sliceHours) * 3_600_000;
  const slices: OrdersWindow[] = [];
  let start = window.since.getTime();
  const end = window.until.getTime();
  if (end <= start) return [{ since: new Date(start), until: new Date(end), initial: window.initial }];
  while (start < end) {
    const stop = Math.min(end, start + sliceMs);
    slices.push({ since: new Date(start), until: new Date(stop), initial: window.initial });
    start = stop;
  }
  return slices;
}

export interface OrdersProgress {
  /** Borne haute de la dernière tranche lue en entier (toutes ses pages), null si aucune. */
  completedUntil: Date | null;
  /** true si toutes les tranches de la fenêtre ont été lues en entier. */
  windowComplete: boolean;
  maxModifiedSeen: Date | null;
  /** Commandes dont l'ingestion a échoué. */
  failed: number;
  /** Plus ancienne date de modification parmi les échecs (pour les reprendre au run suivant). */
  minFailedModified: Date | null;
  /** true si au moins un échec n'a pas de date de modification connue. */
  failedWithoutDate: boolean;
}

/**
 * Curseur à enregistrer après un run (null = ne pas toucher au curseur existant).
 *  - fenêtre complète : nextOrdersCursor ; sinon : fin de la dernière tranche complète ;
 *  - jamais au-delà de la plus ancienne commande en échec (elle sera relue grâce au chevauchement) ;
 *  - échec sans date connue : le curseur n'avance pas ;
 *  - sans échec, le curseur ne recule jamais.
 */
export function resolveOrdersCursor(window: OrdersWindow, progress: OrdersProgress, previousCursor: Date | string | null | undefined): Date | null {
  if (progress.failedWithoutDate) return null;
  let candidate = progress.windowComplete ? nextOrdersCursor(window, progress.maxModifiedSeen) : progress.completedUntil;
  if (progress.minFailedModified) {
    candidate = candidate ? new Date(Math.min(candidate.getTime(), progress.minFailedModified.getTime())) : null;
    return candidate;
  }
  if (!candidate) return null;
  const previous = previousCursor ? new Date(previousCursor) : null;
  if (previous && !Number.isNaN(previous.getTime()) && candidate.getTime() < previous.getTime()) return null;
  return candidate;
}
