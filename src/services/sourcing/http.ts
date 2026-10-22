/**
 * Récupération HTTP bornée (timeout, taille maximale, User-Agent explicite).
 * Aucune gestion de cookies, de session ou de contournement : une requête GET publique.
 *
 * Garde réseau (anti-SSRF) appliquée à TOUTE URL récupérée par le serveur (flux distants, aperçu
 * de flux, sources, découverte, robots.txt, annuaire…) :
 * - http/https uniquement, sans identifiants dans l'URL, ports raisonnables ;
 * - hôtes locaux refusés (localhost, .local, .internal, nom sans point…) ;
 * - adresses IP analysées octet par octet (formes IPv4 décimales / octales / hexadécimales /
 *   abrégées, IPv6 complètes, IPv4 embarquée dans `::ffff:0:0/96`) : boucle locale, privé,
 *   lien local (métadonnées cloud 169.254.169.254), CGNAT, multicast, réservé, documentation,
 *   ULA (fd00:ec2::254), NAT64, 6to4, Teredo… refusés ;
 * - CHAQUE adresse résolue par le DNS est vérifiée ; sous Node, la connexion est ÉPINGLÉE sur les
 *   adresses vérifiées (pas de seconde résolution : pas de « DNS rebinding ») ; sous Deno (Edge
 *   Function), `fetch` ne permet pas d'imposer l'adresse : le nom est re-résolu après la réponse
 *   et le contenu est rejeté si une adresse interne apparaît (fenêtre réduite, pas supprimée) ;
 * - redirections suivies manuellement (5 au plus), chaque saut entièrement revalidé ; passage
 *   https → http refusé ; en-têtes de l'appelant (Authorization, Cookie, clés d'API…) retirés dès
 *   que la redirection change d'origine (schéma, hôte ou port).
 */
import { isIP, type LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
import * as nodeHttp from "node:http";
import * as nodeHttps from "node:https";
import { Readable, pipeline } from "node:stream";
import * as zlib from "node:zlib";

/** Résolution DNS injectable (tests) : liste des adresses du nom d'hôte. */
export type HostResolver = (host: string) => Promise<Array<{ address: string }>>;

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface PinnedRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

/** Transport HTTP qui se connecte UNIQUEMENT aux adresses fournies (déjà vérifiées). */
export type PinnedFetch = (url: URL, init: PinnedRequestInit, addresses: ResolvedAddress[]) => Promise<Response>;

export interface FetchTextOptions {
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  fetchImpl?: typeof fetch;
  /** méthode HTTP (GET par défaut ; POST uniquement pour les API officielles authentifiées) */
  method?: "GET" | "POST";
  /** en-têtes supplémentaires (Authorization, en-têtes propres à une API…) ; jamais de cookie de session */
  headers?: Record<string, string>;
  /** corps de requête (POST) */
  body?: string;
  /** au-delà de maxBytes : garder le début au lieu d'échouer (plans du site très volumineux) */
  truncate?: boolean;
}

export interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string;
  contentType: string | null;
  bytes: number;
  finalUrl: string;
  /** contenu coupé à maxBytes (option truncate) */
  truncated?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

export function decodeBytes(buffer: ArrayBuffer, encoding: string | null | undefined): string {
  const enc = (encoding ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(enc, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

// ---------------------------------------------------------------------------
// Analyse des adresses IP (octet par octet)
// ---------------------------------------------------------------------------

const PRIVATE_ADDRESS_MESSAGE = "Les adresses locales ou privées ne sont pas accessibles.";

/** IPv4 pointée canonique (a.b.c.d, 0–255, sans zéro de tête). */
function parseIPv4Strict(s: string): number[] | null {
  if (isIP(s) !== 4) return null;
  return s.split(".").map(Number);
}

/**
 * Analyseur IPv4 de l'URL WHATWG : 1 à 4 parties décimales, octales (0…) ou hexadécimales (0x…),
 * la dernière remplissant les octets restants (« 127.1 », « 2130706433 », « 0x7f.1 », « 0177.0.0.1 »).
 * Null si la chaîne n'est pas une IPv4 sous l'une de ces formes.
 */
export function parseIPv4Loose(host: string): number[] | null {
  const labels = host.split(".");
  if (labels.length > 1 && labels[labels.length - 1] === "") labels.pop();
  if (labels.length === 0 || labels.length > 4) return null;
  const values: number[] = [];
  for (const label of labels) {
    let n: number;
    if (/^0x[0-9a-f]*$/i.test(label)) n = label.length === 2 ? 0 : parseInt(label.slice(2), 16);
    else if (/^0[0-7]+$/.test(label)) n = parseInt(label.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(label)) n = Number(label);
    else return null;
    if (!Number.isSafeInteger(n)) return null;
    values.push(n);
  }
  const last = values.pop() ?? 0;
  if (values.some((v) => v > 255)) return null;
  if (last >= 256 ** (4 - values.length)) return null;
  const bytes = [...values];
  const rest: number[] = [];
  let rem = last;
  for (let i = 0; i < 4 - values.length; i++) {
    rest.unshift(rem % 256);
    rem = Math.floor(rem / 256);
  }
  return [...bytes, ...rest];
}

/** IPv6 (avec « :: » et IPv4 finale éventuelle) → 16 octets ; null si invalide. */
export function parseIPv6(input: string): number[] | null {
  const s = input.toLowerCase();
  if (s.includes("%")) return null; // identifiant de zone : jamais accepté
  let head = s;
  const tailV4: number[] = [];
  if (s.includes(".")) {
    const cut = s.lastIndexOf(":");
    if (cut < 0) return null;
    const v4 = parseIPv4Strict(s.slice(cut + 1));
    if (!v4) return null;
    tailV4.push(v4[0]! * 256 + v4[1]!, v4[2]! * 256 + v4[3]!);
    head = s.slice(0, cut + 1);
    // « ::ffff:1.2.3.4 » → « ::ffff: » ; « 1:2:3:4:5:6:1.2.3.4 » → « 1:2:3:4:5:6: »
    if (head.endsWith(":") && !head.endsWith("::")) head = head.slice(0, -1);
  }
  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const doubleColon = head.indexOf("::");
  let groups: number[];
  if (doubleColon >= 0) {
    if (head.indexOf("::", doubleColon + 1) >= 0) return null;
    const left = parseGroups(head.slice(0, doubleColon));
    const right = parseGroups(head.slice(doubleColon + 2));
    if (!left || !right) return null;
    const explicit = left.length + right.length + tailV4.length;
    if (explicit > 7) return null;
    groups = [...left, ...new Array<number>(8 - explicit).fill(0), ...right, ...tailV4];
  } else {
    const all = parseGroups(head);
    if (!all) return null;
    groups = [...all, ...tailV4];
    if (groups.length !== 8) return null;
  }
  const bytes: number[] = [];
  for (const g of groups) bytes.push(g >> 8, g & 0xff);
  return bytes;
}

type Cidr = readonly [prefix: readonly number[], bits: number];

function inCidr(bytes: readonly number[], [prefix, bits]: Cidr): boolean {
  for (let i = 0; i < bits; i += 8) {
    const remaining = Math.min(8, bits - i);
    const mask = (0xff << (8 - remaining)) & 0xff;
    if (((bytes[i / 8] ?? 0) & mask) !== ((prefix[i / 8] ?? 0) & mask)) return false;
  }
  return true;
}

/** Plages IPv4 non routables publiquement (registre IANA des adresses à usage spécial) + métadonnées cloud publiques. */
const BLOCKED_V4: readonly Cidr[] = [
  [[0], 8], // « ce réseau »
  [[10], 8], // privé
  [[100, 64], 10], // CGNAT (dont 100.100.100.200, métadonnées Alibaba)
  [[127], 8], // boucle locale
  [[169, 254], 16], // lien local (169.254.169.254 : métadonnées AWS / GCP / Azure / OpenStack)
  [[172, 16], 12], // privé
  [[192, 0, 0], 24], // affectations IETF (dont 192.0.0.192, métadonnées Oracle)
  [[192, 0, 2], 24], // documentation
  [[192, 88, 99], 24], // relais 6to4 (obsolète)
  [[192, 168], 16], // privé
  [[198, 18], 15], // bancs d'essai
  [[198, 51, 100], 24], // documentation
  [[203, 0, 113], 24], // documentation
  [[224], 4], // multicast
  [[240], 4], // réservé + diffusion 255.255.255.255
  [[168, 63, 129, 16], 32], // Azure WireServer (adresse publique joignable seulement depuis l'hôte)
];

/** Plages IPv6 refusées à l'intérieur de 2000::/3 (le reste de l'espace hors 2000::/3 est refusé en bloc). */
const BLOCKED_V6_GLOBAL: readonly Cidr[] = [
  [[0x20, 0x01, 0x00], 23], // affectations IETF : Teredo 2001::/32, bancs d'essai, ORCHID…
  [[0x20, 0x01, 0x0d, 0xb8], 32], // documentation
  [[0x20, 0x02], 16], // 6to4 (IPv4 embarquée)
  [[0x3f, 0xff, 0x00], 20], // documentation (RFC 9637)
  [[0x5f, 0x00], 16], // SRv6
];

const V4_MAPPED: Cidr = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96];

function isBlockedV4(bytes: readonly number[]): boolean {
  return BLOCKED_V4.some((c) => inCidr(bytes, c));
}

function isBlockedV6(bytes: readonly number[]): boolean {
  // ::ffff:a.b.c.d (et sa forme normalisée ::ffff:7f00:1) : c'est l'IPv4 embarquée qui compte.
  if (inCidr(bytes, V4_MAPPED)) return isBlockedV4(bytes.slice(12));
  // Hors unicast global 2000::/3 : ::, ::1, ::/96 (IPv4 compatible), ::ffff:0:0:0/96 (traduite),
  // 64:ff9b::/96 et 64:ff9b:1::/48 (NAT64), 100::/64, fc00::/7 (ULA, dont fd00:ec2::254),
  // fe80::/10, fec0::/10, ff00::/8 (multicast)… tout est refusé.
  if (((bytes[0] ?? 0) & 0xe0) !== 0x20) return true;
  return BLOCKED_V6_GLOBAL.some((c) => inCidr(bytes, c));
}

/** Analyse une adresse IP (IPv4 sous toutes ses formes, IPv6 avec ou sans crochets). */
export function parseIpAddress(address: string): { family: 4 | 6; bytes: number[] } | null {
  const a = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (a.includes(":")) {
    const v6 = parseIPv6(a);
    return v6 ? { family: 6, bytes: v6 } : null;
  }
  const v4 = parseIPv4Loose(a);
  return v4 ? { family: 4, bytes: v4 } : null;
}

/**
 * Vrai si l'adresse n'est PAS une adresse unicast publique : privée, locale, réservée, ou
 * illisible (refus par défaut : une chaîne qui n'est pas une IP est considérée comme interdite).
 */
export function isPrivateAddress(address: string): boolean {
  const ip = parseIpAddress(address);
  if (!ip) return true;
  return ip.family === 4 ? isBlockedV4(ip.bytes) : isBlockedV6(ip.bytes);
}

// ---------------------------------------------------------------------------
// Validation de l'URL (avant toute résolution)
// ---------------------------------------------------------------------------

/** Ports de services internes courants (bases de données, orchestrateurs, caches…). */
const BLOCKED_PORTS = new Set([1433, 1521, 2049, 2375, 2376, 2379, 2380, 3306, 3389, 4369, 5432, 5672, 5984, 6379, 6443, 8500, 9042, 9200, 9300, 10250, 10255, 11211, 15672, 27017, 50070]);

function assertAllowedPort(u: URL): void {
  if (u.port === "") return;
  const port = Number(u.port);
  if (port === 80 || port === 443) return;
  if (port < 1024 || BLOCKED_PORTS.has(port)) throw new Error(`Port ${port} non autorisé (80, 443 ou port applicatif ≥ 1024 uniquement).`);
}

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".localdomain"];

/** Le dernier libellé est numérique : l'hôte doit être lu comme une IPv4 (règle WHATWG). */
function endsInNumber(host: string): boolean {
  const labels = host.split(".");
  if (labels.length > 1 && labels[labels.length - 1] === "") labels.pop();
  const last = labels[labels.length - 1] ?? "";
  return /^[0-9]+$/.test(last) || /^0x[0-9a-f]*$/i.test(last);
}

export function assertPublicHttpUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Adresse invalide.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`URL non supportée (${u.protocol}) : seuls http et https sont acceptés.`);
  if (u.username || u.password) throw new Error("Les identifiants dans l'URL ne sont pas acceptés.");
  assertAllowedPort(u);
  const raw = u.hostname.toLowerCase();
  if (raw.startsWith("[")) {
    if (isPrivateAddress(raw)) throw new Error(PRIVATE_ADDRESS_MESSAGE);
    return u;
  }
  const host = raw.replace(/\.+$/, "");
  if (host === "" || host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) throw new Error(PRIVATE_ADDRESS_MESSAGE);
  if (endsInNumber(host)) {
    // L'URL WHATWG convertit déjà « 2130706433 », « 0x7f.1 »… en IPv4 pointée ; l'analyse est
    // refaite ici pour ne dépendre d'aucune implémentation.
    if (!parseIPv4Loose(host) || isPrivateAddress(host)) throw new Error(PRIVATE_ADDRESS_MESSAGE);
    return u;
  }
  // Nom sans point (« metadata », « intranet ») : résolu par les domaines de recherche internes.
  if (!host.includes(".")) throw new Error(PRIVATE_ADDRESS_MESSAGE);
  return u;
}

const defaultResolver: HostResolver = (h) => lookup(h, { all: true, verbatim: true });

/**
 * Résout le nom d'hôte et refuse toute adresse privée (protection SSRF, y compris DNS pointant
 * vers le réseau interne). Renvoie les adresses vérifiées (épinglées par le transport Node).
 */
export async function assertResolvesToPublicAddress(u: URL, resolver: HostResolver = defaultResolver): Promise<ResolvedAddress[]> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const literal = parseIpAddress(host);
  if (literal && (host.includes(":") || endsInNumber(host))) {
    if (isPrivateAddress(host)) throw new Error(PRIVATE_ADDRESS_MESSAGE);
    return [{ address: literal.family === 4 ? literal.bytes.join(".") : host, family: literal.family }];
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolver(host);
  } catch {
    throw new Error(`Nom d'hôte introuvable : ${host}.`);
  }
  if (addresses.length === 0) throw new Error(`Nom d'hôte introuvable : ${host}.`);
  const out: ResolvedAddress[] = [];
  for (const a of addresses) {
    const ip = parseIpAddress(a.address);
    if (!ip || isPrivateAddress(a.address)) throw new Error(PRIVATE_ADDRESS_MESSAGE);
    out.push({ address: a.address.replace(/^\[|\]$/g, ""), family: ip.family });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transport épinglé (Node) : la connexion utilise exactement les adresses vérifiées
// ---------------------------------------------------------------------------

const IS_DENO = typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";
/** Épinglage possible : runtime Node (sous Deno, `fetch` n'accepte aucune résolution imposée). */
export const PINNED_TRANSPORT_AVAILABLE = !IS_DENO && typeof process !== "undefined" && typeof process.versions?.node === "string";
const NATIVE_FETCH: typeof fetch | undefined = typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;

function decodedStream(res: nodeHttp.IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
  let decoder: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null = null;
  if (encoding === "gzip" || encoding === "x-gzip") decoder = zlib.createGunzip();
  else if (encoding === "deflate") decoder = zlib.createInflate();
  else if (encoding === "br") decoder = zlib.createBrotliDecompress();
  if (!decoder) return res;
  // pipeline : une erreur d'un côté détruit l'autre (le flux web renvoyé échoue proprement)
  return pipeline(res, decoder, () => undefined);
}

/**
 * Requête http(s) Node dont la résolution DNS est remplacée par la liste d'adresses vérifiées :
 * aucune seconde résolution, donc aucun « rebinding » possible. TLS (SNI + certificat) reste
 * vérifié sur le NOM d'hôte. Corps décompressé (gzip, deflate, br) comme avec fetch.
 */
export const nodePinnedFetch: PinnedFetch = (url, init, addresses) =>
  new Promise<Response>((resolve, reject) => {
    if (addresses.length === 0) {
      reject(new Error(`Nom d'hôte introuvable : ${url.hostname}.`));
      return;
    }
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      const wanted = options.family === 4 || options.family === 6 ? addresses.filter((a) => a.family === options.family) : addresses;
      const first = wanted[0];
      if (!first) {
        callback(Object.assign(new Error(`Aucune adresse vérifiée pour ${url.hostname}.`), { code: "ENOTFOUND" }), "", 0);
        return;
      }
      if (options.all) callback(null, wanted.map((a) => ({ address: a.address, family: a.family })));
      else callback(null, first.address, first.family);
    };
    const headers: Record<string, string> = { ...init.headers };
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "accept-encoding")) headers["Accept-Encoding"] = "gzip, deflate, br";
    const mod = url.protocol === "https:" ? nodeHttps : nodeHttp;
    let req: nodeHttp.ClientRequest;
    try {
      req = mod.request(url, { method: init.method, headers, lookup: pinnedLookup, signal: init.signal, agent: false }, (res) => {
        try {
          const status = res.statusCode ?? 0;
          if (status < 200 || status > 599) throw new Error(`Réponse HTTP invalide (${status}).`);
          const responseHeaders = new Headers();
          for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
          const nullBody = status === 204 || status === 205 || status === 304 || init.method === "HEAD";
          if (nullBody) res.resume();
          const body = nullBody ? null : (Readable.toWeb(decodedStream(res)) as unknown as ReadableStream<Uint8Array>);
          resolve(new Response(body, { status, statusText: res.statusMessage ?? "", headers: responseHeaders }));
        } catch (e) {
          res.destroy();
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
      return;
    }
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });

// ---------------------------------------------------------------------------
// Lecture bornée
// ---------------------------------------------------------------------------

async function readBounded(res: Response, maxBytes: number, truncate = false): Promise<{ buffer: ArrayBuffer; truncated: boolean }> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes && !truncate) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Réponse trop volumineuse (${declared} octets, maximum ${maxBytes}).`);
  }
  if (!res.body) return { buffer: new ArrayBuffer(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await reader.read();
    } catch (e) {
      // flux gzip coupé (option truncate) : on garde ce qui a été décompressé
      if (truncate && total > 0) {
        truncated = true;
        break;
      }
      throw e;
    }
    const { done, value } = step;
    if (done) break;
    if (value) {
      if (total + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        if (!truncate) throw new Error(`Réponse trop volumineuse (plus de ${maxBytes} octets).`);
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        truncated = true;
        break;
      }
      total += value.byteLength;
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { buffer: out.buffer, truncated };
}

/**
 * Fichier compressé gzip publié tel quel (ex. « sitemap.xml.gz ») : décompressé en mémoire, avec la
 * même limite de taille sur le contenu décompressé (protection contre les « bombes » gzip).
 * Le décodage HTTP `Content-Encoding` est, lui, déjà fait par fetch.
 */
export async function gunzipBounded(buffer: ArrayBuffer, maxBytes: number, truncate = false): Promise<ArrayBuffer> {
  return (await gunzipBoundedResult(buffer, maxBytes, truncate)).buffer;
}

async function gunzipBoundedResult(buffer: ArrayBuffer, maxBytes: number, truncate: boolean): Promise<{ buffer: ArrayBuffer; truncated: boolean }> {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return { buffer, truncated: false };
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return readBounded(new Response(stream), maxBytes, truncate);
}

// ---------------------------------------------------------------------------
// fetchText
// ---------------------------------------------------------------------------

function abortError(): DOMException {
  return new DOMException("Requête interrompue.", "AbortError");
}

/** Interrompt l'attente d'une promesse non annulable (résolution DNS) quand le délai expire. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchText(
  url: string,
  options: FetchTextOptions & {
    encoding?: string | null;
    resolver?: HostResolver;
    /** transport épinglé de remplacement (tests) ; par défaut `nodePinnedFetch` sous Node */
    pinnedFetch?: PinnedFetch;
  },
): Promise<FetchTextResult> {
  let target = assertPublicHttpUrl(url);
  const initialOrigin = target.origin;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const candidate = options.fetchImpl ?? globalThis.fetch;
  // Épinglage : transport fourni (tests) ou Node avec le fetch natif ; un fetch injecté (tests,
  // instrumentation) est utilisé tel quel, avec re-résolution de contrôle après la réponse.
  const pinned: PinnedFetch | null = options.pinnedFetch ?? (PINNED_TRANSPORT_AVAILABLE && candidate === NATIVE_FETCH ? nodePinnedFetch : null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let method: "GET" | "POST" = options.method ?? "GET";
  let body: string | undefined = method === "POST" ? options.body ?? "" : undefined;
  let crossOrigin = false;
  try {
    let res: Response | null = null;
    // Redirections suivies manuellement : chaque saut est revalidé (pas de rebond vers une adresse interne).
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const addresses = await raceAbort(assertResolvesToPublicAddress(target, options.resolver), controller.signal);
      const headers: Record<string, string> = {
        "User-Agent": options.userAgent,
        Accept: options.accept ?? "text/html,application/xhtml+xml,application/xml,text/csv,application/json;q=0.9,*/*;q=0.8",
        // en-têtes de l'appelant (Authorization, Cookie, clés d'API…) : jamais envoyés à une autre origine
        ...(crossOrigin ? {} : options.headers ?? {}),
      };
      if (pinned) {
        res = await pinned(target, { method, headers, body, signal: controller.signal }, addresses);
      } else {
        res = await candidate(target.toString(), { method, redirect: "manual", headers, body, signal: controller.signal });
        // Pas d'épinglage possible : le nom est re-résolu ; une adresse interne apparue entre-temps
        // (DNS rebinding) fait rejeter la réponse sans en lire le contenu.
        try {
          await raceAbort(assertResolvesToPublicAddress(target, options.resolver), controller.signal);
        } catch (e) {
          await res.body?.cancel().catch(() => undefined);
          throw e;
        }
      }
      const location = res.headers.get("location");
      if (REDIRECT_STATUSES.has(res.status) && location) {
        await res.body?.cancel().catch(() => undefined);
        if (hop === MAX_REDIRECTS) throw new Error("Trop de redirections.");
        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          throw new Error("Redirection vers une adresse invalide.");
        }
        next = assertPublicHttpUrl(next.toString());
        if (target.protocol === "https:" && next.protocol !== "https:") throw new Error("Redirection refusée : passage de HTTPS à HTTP non chiffré.");
        if (next.origin !== initialOrigin) crossOrigin = true;
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        } else if (body !== undefined && crossOrigin) {
          throw new Error("Redirection d'une requête POST vers une autre origine refusée.");
        }
        target = next;
        continue;
      }
      break;
    }
    if (!res) throw new Error("Aucune réponse.");
    const raw = await readBounded(res, maxBytes, options.truncate);
    const unzipped = await gunzipBoundedResult(raw.buffer, maxBytes, Boolean(options.truncate));
    const buffer = unzipped.buffer;
    const contentType = res.headers.get("content-type");
    const charset = contentType?.match(/charset=([\w-]+)/i)?.[1] ?? null;
    return { ok: res.ok, status: res.status, text: decodeBytes(buffer, options.encoding ?? charset), contentType, bytes: buffer.byteLength, finalUrl: target.toString(), truncated: raw.truncated || unzipped.truncated };
  } catch (e) {
    if ((e as { name?: unknown } | null)?.name === "AbortError") throw new Error(`Délai dépassé (${timeoutMs / 1000} s) pour ${target.hostname}.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
