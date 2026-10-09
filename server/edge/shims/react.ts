/** `cache` de React (mémoïsation par requête côté serveur) : identité hors React. */
export function cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
export default { cache };
