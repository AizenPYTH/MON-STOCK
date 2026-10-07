/** Résultat standard des Server Actions : jamais d'exception brute vers le client. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]>; action?: { label: string; href: string } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: string, extra: Omit<Extract<ActionResult<T>, { ok: false }>, "ok" | "error"> = {}): ActionResult<T> {
  return { ok: false, error, ...extra };
}
