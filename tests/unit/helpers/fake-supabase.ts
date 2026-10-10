/**
 * Faux client Supabase pour les tests : enregistre chaque appel du constructeur de requêtes
 * (from / select / eq / or / range / rpc…) et renvoie la réponse programmée pour la table ou la RPC.
 */
export type Call = { method: string; args: unknown[] };
export type Response = { data?: unknown; error?: unknown; count?: number | null };

export function fakeSupabase(responses: Record<string, Response> = {}) {
  const queries: { target: string; calls: Call[] }[] = [];
  function builder(target: string) {
    const entry = { target, calls: [] as Call[] };
    queries.push(entry);
    const result = responses[target] ?? { data: [], error: null, count: 0 };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
          }
          return (...args: unknown[]) => {
            entry.calls.push({ method: prop, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }
  const client = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      queries.push({ target: `rpc:${fn}`, calls: [{ method: "rpc", args: [args] }] });
      const r = responses[`rpc:${fn}`] ?? { data: null, error: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  return { client: client as never, queries };
}
