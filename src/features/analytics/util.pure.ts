/** Petits utilitaires purs partagés par la couche analytique (aucune dépendance serveur). */

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const step = Math.max(1, size);
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

export function sumBy<T>(items: readonly T[], pick: (item: T) => number | null | undefined): number {
  let total = 0;
  for (const it of items) {
    const v = pick(it);
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count > 1 ? (pluralForm ?? `${singular}s`) : singular;
}

/** Nombre de jours (fractionnaires) entre deux dates. */
export function daysSince(value: string | Date | null | undefined, now: Date): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 86_400_000;
}
