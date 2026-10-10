import "server-only";
import { XMLParser } from "fast-xml-parser";
import type { ShippingQuoteDTO, ShippingQuoteRequest } from "@/features/mobile-api/contract";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readBodyText } from "@/integrations/core/http";

/**
 * Boxtal (API v1, ex-Envoimoinscher) — cotation multi-transporteurs aux tarifs Boxtal.
 *
 * Contrat lu dans le SDK officiel github.com/boxtal/php-library (Emc/WebService.php,
 * Emc/Quotation.php) :
 *   GET {hôte}/api/v1/cotation?shipper.pays&shipper.code_postal&shipper.ville&shipper.type
 *       &recipient.*&colis_1.poids(kg)&colis_1.longueur|largeur|hauteur(cm)&collecte=AAAA-MM-JJ
 *       &delay=aucun&content_code=<catégorie de contenu>&colis.valeur=<valeur déclarée>
 *   en-têtes « Authorization: base64(identifiant:mot de passe) » (sans préfixe, comme le SDK),
 *   « Api-Version: 1.3.7 » ; réponse XML /cotation/shipment/offer[] : operator/label,
 *   service/label, price/{currency, tax-exclusive, tax-inclusive}, collection/type/code,
 *   delivery/type/code, delivery/date, characteristics/label[].
 * Hôtes du SDK : https://www.envoimoinscher.com (production), https://test.envoimoinscher.com
 * (test). Secrets : BOXTAL_V1_LOGIN, BOXTAL_V1_PASSWORD, BOXTAL_CONTENT_CODE (catégorie de
 * contenu de vos envois, liste fournie par l'API Boxtal), BOXTAL_API_URL (facultatif).
 */

export const BOXTAL_DEFAULT_URL = "https://www.envoimoinscher.com/api/v1/";
export const BOXTAL_API_VERSION = "1.3.7";

export function boxtalConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BOXTAL_V1_LOGIN?.trim() && env.BOXTAL_V1_PASSWORD?.trim() && /^\d+$/.test(env.BOXTAL_CONTENT_CODE?.trim() ?? ""));
}

/** Prochain jour d'enlèvement possible (lundi → samedi, heure de Paris). */
export function nextCollectionDate(now: Date): string {
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const d = new Date(Date.UTC(paris.getFullYear(), paris.getMonth(), paris.getDate()));
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function boxtalQuoteUrl(req: ShippingQuoteRequest, env: Record<string, string | undefined>, now: Date): string {
  const base = (env.BOXTAL_API_URL?.trim() || BOXTAL_DEFAULT_URL).replace(/\/?$/, "/");
  const p = new URLSearchParams();
  p.set("shipper.pays", req.fromCountry);
  p.set("shipper.code_postal", req.fromPostcode);
  if (req.fromCity) p.set("shipper.ville", req.fromCity);
  p.set("shipper.type", "entreprise");
  p.set("recipient.pays", req.toCountry);
  p.set("recipient.code_postal", req.toPostcode);
  if (req.toCity) p.set("recipient.ville", req.toCity);
  p.set("recipient.type", "particulier");
  p.set("colis_1.poids", String(req.weightKg));
  p.set("colis_1.longueur", String(Math.ceil(req.lengthCm)));
  p.set("colis_1.largeur", String(Math.ceil(req.widthCm)));
  p.set("colis_1.hauteur", String(Math.ceil(req.heightCm)));
  p.set("collecte", nextCollectionDate(now));
  p.set("delay", "aucun");
  p.set("content_code", env.BOXTAL_CONTENT_CODE?.trim() ?? "");
  if (req.declaredValue !== undefined) p.set("colis.valeur", String(req.declaredValue));
  return `${base}cotation?${p.toString()}`;
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, isArray: (name, jpath) => name === "offer" || String(jpath).endsWith("characteristics.label") });

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : null);
const decimalText = (v: unknown): string | null => {
  const s = text(v)?.replace(",", ".") ?? null;
  return s && /^\d+(\.\d+)?$/.test(s) ? s : null;
};

type Node = Record<string, unknown>;

export function mapBoxtalXml(xml: string, quotedAt: string): ShippingQuoteDTO[] {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new ConnectorError("INVALID_RESPONSE", "boxtal", "Réponse Boxtal illisible (XML attendu).");
  }
  const err = (doc.error as Node | undefined) ?? null;
  if (err) throw new ConnectorError("API_ERROR", "boxtal", `Boxtal a refusé la cotation : ${text(err.message) ?? text(err.code) ?? "erreur inconnue"}.`);
  const shipment = ((doc.cotation as Node | undefined)?.shipment as Node | undefined) ?? null;
  if (!shipment) throw new ConnectorError("INVALID_RESPONSE", "boxtal", "Réponse Boxtal inattendue (cotation/shipment absent).");
  const out: ShippingQuoteDTO[] = [];
  asArray(shipment.offer as Node | Node[]).forEach((o, i) => {
    const price = (o.price as Node | undefined) ?? {};
    const incl = decimalText(price["tax-inclusive"]);
    const excl = decimalText(price["tax-exclusive"]);
    if (incl === null && excl === null) return;
    const operator = (o.operator as Node | undefined) ?? {};
    const service = (o.service as Node | undefined) ?? {};
    const collection = (o.collection as Node | undefined) ?? {};
    const delivery = (o.delivery as Node | undefined) ?? {};
    const collectionType = text(((collection.type as Node | undefined) ?? {}).code);
    const deliveryType = text(((delivery.type as Node | undefined) ?? {}).code);
    const deliveryDate = text(delivery.date);
    const characteristics = asArray(((o.characteristics as Node | undefined) ?? {}).label as unknown).map(text).filter((x): x is string => Boolean(x));
    out.push({
      key: `boxtal:${text(operator.code) ?? "op"}:${text(service.code) ?? i}`,
      provider: "boxtal",
      providerLabel: "Boxtal",
      carrier: text(operator.label) ?? text(operator.code) ?? "Transporteur non précisé",
      service: text(service.label) ?? text(service.code) ?? "Service",
      priceInclVat: incl,
      priceExclVat: excl,
      currency: (text(price.currency) ?? "EUR").toUpperCase(),
      transitDaysMin: null,
      transitDaysMax: null,
      estimatedDelivery: deliveryDate && /^\d{4}-\d{2}-\d{2}/.test(deliveryDate) ? deliveryDate.slice(0, 10) : null,
      // Codes Boxtal non documentés publiquement : seuls les libellés connus sont interprétés.
      dropOff: collectionType === "POST_OFFICE" || collectionType === "DROPOFF_POINT" ? true : collectionType === "COMPANY" || collectionType === "HOME" ? false : null,
      deliveryToPickupPoint: deliveryType === "PICKUP_POINT" ? true : deliveryType === "HOME" ? false : null,
      tracking: null,
      restrictions: characteristics.slice(0, 4),
      quotedAt,
    });
  });
  return out;
}

export async function boxtalQuotes(req: ShippingQuoteRequest, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<ShippingQuoteDTO[]> {
  if (!boxtalConfigured(env)) throw new ConnectorError("NOT_CONFIGURED", "boxtal", "Boxtal non configuré (BOXTAL_V1_LOGIN, BOXTAL_V1_PASSWORD, BOXTAL_CONTENT_CODE).");
  const auth = Buffer.from(`${env.BOXTAL_V1_LOGIN!.trim()}:${env.BOXTAL_V1_PASSWORD!.trim()}`).toString("base64");
  const res = await fetchWithRetry(
    boxtalQuoteUrl(req, env, now),
    { method: "GET", headers: { Authorization: auth, "Api-Version": BOXTAL_API_VERSION, "Accept-Language": "fr-FR", Accept: "application/xml" } },
    { provider: "boxtal", timeoutMs: 25_000, retries: 1, label: "cotation" },
  );
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "boxtal", "Identifiants Boxtal refusés : vérifiez BOXTAL_V1_LOGIN / BOXTAL_V1_PASSWORD.", { httpStatus: res.status });
  const body = await readBodyText(res, "boxtal", "cotation");
  if (!res.ok && !body.includes("<error")) throw new ConnectorError("API_ERROR", "boxtal", `Boxtal a refusé la demande (HTTP ${res.status}).`, { httpStatus: res.status });
  return mapBoxtalXml(body, now.toISOString());
}
