/**
 * Organisation AFFICHÉE dans l'onglet (W-07). Module PUR, partagé client / serveur.
 *
 * L'organisation active est mémorisée côté serveur (profil) et commune à tous les onglets : un onglet
 * resté sur l'organisation X enverrait sinon ses actions dans l'organisation Y choisie entre-temps
 * dans un autre onglet. Le navigateur joint donc l'identifiant de l'organisation qu'il affiche à
 * chaque requête d'écriture vers le site (Server Actions, routes POST), et le serveur refuse l'action
 * si ce n'est plus l'organisation active (`requireOrgContextForAction`).
 */
export const DISPLAYED_ORGANIZATION_HEADER = "x-monstock-displayed-org";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valeur d'en-tête exploitable (UUID) ou null (absente, vide, falsifiée). */
export function parseDisplayedOrganization(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && UUID_RE.test(v) ? v.toLowerCase() : null;
}

type FetchInput = string | URL | Request;

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: FetchInput, init: RequestInit | undefined): string {
  return (init?.method ?? (typeof input === "object" && !(input instanceof URL) ? input.method : undefined) ?? "GET").toUpperCase();
}

/**
 * Options de `fetch` complétées de l'en-tête d'organisation affichée, ou `undefined` si la requête
 * ne doit pas le porter : lecture (GET/HEAD), autre origine (jamais d'en-tête vers un tiers), pas
 * d'organisation connue, ou en-tête déjà présent.
 */
export function withDisplayedOrganization(input: FetchInput, init: RequestInit | undefined, organizationId: string | null, origin: string): RequestInit | undefined {
  if (!organizationId) return undefined;
  const method = requestMethod(input, init);
  if (method === "GET" || method === "HEAD") return undefined;
  let url: URL;
  try {
    url = new URL(requestUrl(input), origin);
  } catch {
    return undefined;
  }
  if (url.origin !== origin) return undefined;
  const headers = new Headers(init?.headers ?? (typeof input === "object" && !(input instanceof URL) ? input.headers : undefined));
  if (headers.has(DISPLAYED_ORGANIZATION_HEADER)) return undefined;
  headers.set(DISPLAYED_ORGANIZATION_HEADER, organizationId);
  return { ...init, headers };
}

/**
 * Enveloppe `fetch` pour y appliquer `withDisplayedOrganization`. Les Server Actions de Next 16.4
 * passent par le `fetch` global au moment de l'appel (`segment-cache/fetch.js`) : c'est le seul point
 * commun à toutes les actions, sans modifier chaque formulaire.
 */
export function wrapFetchWithDisplayedOrganization(base: typeof fetch, currentOrganization: () => string | null, origin: () => string): typeof fetch {
  const wrapped = (input: FetchInput, init?: RequestInit) => {
    const next = withDisplayedOrganization(input, init, currentOrganization(), origin());
    return next ? base(input, next) : base(input, init);
  };
  return wrapped as typeof fetch;
}
