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
 * Nouveau curseur après un run : la plus grande date de modification vue, sinon la borne
 * haute de la fenêtre (rien n'a été modifié avant elle). Jamais plus loin que `until`.
 */
export function nextOrdersCursor(window: OrdersWindow, maxModifiedSeen: Date | null, options: { truncated?: boolean } = {}): Date {
  if (options.truncated && maxModifiedSeen) return maxModifiedSeen;
  if (!maxModifiedSeen) return window.until;
  return new Date(Math.min(maxModifiedSeen.getTime(), window.until.getTime()));
}
