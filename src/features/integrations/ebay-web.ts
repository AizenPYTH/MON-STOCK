import "server-only";
import { EbayConnector } from "@/integrations/ebay/connector";
import type { EbayConfig } from "@/integrations/ebay/config";
import { getEbayConnector } from "@/integrations/core/registry";
import { cleanEnvValue } from "@/lib/site";

/**
 * Connexion eBay DEPUIS LE SITE WEB (W-06 / I-21).
 *
 * eBay n'accepte qu'une « auth accepted URL » par RuName. Le RuName `EBAY_RU_NAME` (lu aussi dans le
 * Vault, partagé avec l'Edge) renvoie vers le relais de l'application iPhone (`monstock://…`) : s'en
 * servir sur le web enverrait l'administrateur dans une impasse sur ordinateur. Le flux web exige donc
 * un RuName DÉDIÉ, `EBAY_WEB_RU_NAME`, dont l'URL de retour chez eBay est
 * `${NEXT_PUBLIC_APP_URL}/api/integrations/ebay/callback`. Sans lui, les boutons « Connecter eBay » du
 * site sont remplacés par un message (connexion depuis l'iPhone). Le flux mobile n'est pas concerné.
 *
 * Variable lue dans l'environnement du serveur web (Vercel) uniquement : ce n'est pas un secret et
 * elle ne figure pas dans la liste du Vault (server/edge/runtime-secrets.ts).
 */
export const EBAY_WEB_RU_NAME_ENV = "EBAY_WEB_RU_NAME";

/** Sous-ensemble du connecteur utilisé par les routes OAuth web (simulable en test). */
export type EbayWebOAuthConnector = Pick<EbayConnector, "getAuthorizeUrl" | "exchangeCode" | "getAccountInfo" | "config">;

export type EbayWebConnectStatus = "ready" | "not_configured" | "web_runame_missing";

export type EbayWebConnect = { status: "ready"; connector: EbayWebOAuthConnector } | { status: Exclude<EbayWebConnectStatus, "ready"> };

/**
 * Configuration OAuth du web : celle de l'application eBay (identifiants, environnement) avec le
 * RuName web à la place de celui du relais mobile. Pure (testée).
 */
export function resolveEbayWebConfig(base: EbayConfig | null, env: Readonly<Record<string, string | undefined>>): { status: "ready"; config: EbayConfig } | { status: Exclude<EbayWebConnectStatus, "ready"> } {
  if (!base) return { status: "not_configured" };
  const ruName = cleanEnvValue(env[EBAY_WEB_RU_NAME_ENV]);
  if (!ruName) return { status: "web_runame_missing" };
  return { status: "ready", config: { ...base, ruName } };
}

/** État de la connexion web et, si elle est possible, le connecteur OAuth à RuName web. */
export function ebayWebConnect(env: Readonly<Record<string, string | undefined>> = process.env): EbayWebConnect {
  const resolved = resolveEbayWebConfig(getEbayConnector().config(), env);
  if (resolved.status !== "ready") return { status: resolved.status };
  return { status: "ready", connector: new EbayConnector(resolved.config) };
}

/**
 * Origine PUBLIQUE de la requête, telle que le navigateur la voit. `request.nextUrl` ne suffit pas :
 * sous `next start` (et derrière un proxy), il porte l'adresse d'écoute du serveur, pas l'hôte demandé.
 * Ordre : `x-forwarded-host`/`x-forwarded-proto` (Vercel, proxy), puis `host`, puis l'URL reçue.
 * Contrôle d'ergonomie (W-29), pas de sécurité : la protection du flux reste l'état OAuth + cookie.
 */
export function publicRequestOrigin(headers: Headers, url: URL): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host")) ?? url.host;
  const proto = first(headers.get("x-forwarded-proto")) ?? url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

/**
 * W-29 : le cookie d'état OAuth est posé sur le domaine qui DÉMARRE le flux, et eBay revient sur le
 * domaine du RuName (le domaine canonique, NEXT_PUBLIC_APP_URL). Un flux lancé depuis un autre domaine
 * (aperçu Vercel, alias) échouerait donc au retour (`browser_mismatch`) : il est refusé d'emblée.
 */
export function isCanonicalOrigin(requestOrigin: string, canonicalUrl: string): boolean {
  try {
    return new URL(requestOrigin).origin === new URL(canonicalUrl).origin;
  } catch {
    return false;
  }
}
