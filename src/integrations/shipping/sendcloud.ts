import "server-only";
import { z } from "zod";
import { formatMoneyDec, parseDecimal } from "@/domain/tools/decimal";
import type { ShippingQuoteDTO, ShippingQuoteRequest } from "@/features/mobile-api/contract";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";

/**
 * Sendcloud — CONSULTATION DE TARIFS UNIQUEMENT (API v3 « shipping-options »).
 *
 * Ce module n'appelle qu'un seul point d'accès, en lecture : il ne crée, n'achète, n'annule ni ne
 * modifie aucune étiquette ni aucun envoi. Un devis Sendcloud n'est pas facturé (« charging_type:
 * label_creation » : seule la création d'une étiquette l'est).
 *
 * Contrat (documentation officielle sendcloud.dev « Return a list of available shipping options »,
 * remplaçant de « Create a list of shipping options », déprécié le 14/01/2026) et réponse réelle
 * observée le 11/10/2026 sur le compte MON STOCK :
 *   POST https://panel.sendcloud.sc/api/v3/shipping-options
 *   en-tête « Authorization: Basic base64(<clé publique>:<clé secrète>) »
 *   corps { from_address{ country_code, postal_code }, to_address{…}, parcels[{ weight{ value, unit },
 *           dimensions{ length, width, height, unit } }], calculate_quotes: true }
 *   réponse { data[{ code, name, carrier{ code, name }, functionalities{ tracked, first_mile, last_mile },
 *             requirements{ fields, is_service_point_required }, quotes[{ price{ total{ value, currency },
 *             breakdown[{ type, label, price{ value } }] }, lead_time }], quote_error }] }
 * Quota : 100 requêtes POST par minute et par compte (au-delà : HTTP 429, géré par fetchWithRetry).
 *
 * TVA : l'API ne précise pas si les montants sont HT ou TTC → `priceVatUnknown`, jamais converti.
 * Secrets serveur : SENDCLOUD_PUBLIC_KEY, SENDCLOUD_SECRET_KEY (Sendcloud → Paramètres →
 * Intégrations → Sendcloud API). Seuls pays, code postal, poids et dimensions sont transmis.
 */

export const SENDCLOUD_SHIPPING_OPTIONS_URL = "https://panel.sendcloud.sc/api/v3/shipping-options";

const money = z.object({ value: z.union([z.string(), z.number()]).nullable().optional(), currency: z.string().nullable().optional() }).passthrough();
const optionSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().nullable().optional(),
    carrier: z.object({ code: z.string().nullable().optional(), name: z.string().nullable().optional() }).passthrough().nullable().optional(),
    functionalities: z
      .object({ tracked: z.boolean().nullable().optional(), first_mile: z.string().nullable().optional(), last_mile: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    requirements: z.object({ fields: z.array(z.string()).nullable().optional(), is_service_point_required: z.boolean().nullable().optional() }).passthrough().nullable().optional(),
    quotes: z
      .array(
        z
          .object({
            price: z
              .object({
                total: money.nullable().optional(),
                breakdown: z.array(z.object({ type: z.string().nullable().optional(), label: z.string().nullable().optional(), price: money.nullable().optional() }).passthrough()).nullable().optional(),
              })
              .passthrough()
              .nullable()
              .optional(),
            lead_time: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    quote_error: z.unknown().optional(),
  })
  .passthrough();

export interface SendcloudExcludedOption {
  carrier: string;
  service: string;
  reason: string;
}

export interface SendcloudQuoteResult {
  quotes: ShippingQuoteDTO[];
  /** offres renvoyées mais écartées (prix nul ou absent, non suivies, incomplètes) — jamais affichées comme un prix */
  excluded: SendcloudExcludedOption[];
}

const PICKUP_LAST_MILE = new Set(["service_point", "locker", "locker_or_service_point"]);
const REQUIREMENT_LABEL: Record<string, string> = {
  to_email: "E-mail du destinataire requis pour l'étiquette.",
  to_telephone: "Téléphone du destinataire requis pour l'étiquette.",
};

export function sendcloudConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SENDCLOUD_PUBLIC_KEY?.trim().length ?? 0) >= 10 && (env.SENDCLOUD_SECRET_KEY?.trim().length ?? 0) >= 10;
}

/** Corps du devis : pays, code postal, poids et dimensions uniquement (aucune donnée client). */
export function sendcloudShippingOptionsBody(req: ShippingQuoteRequest): Record<string, unknown> {
  return {
    from_address: { country_code: req.fromCountry, postal_code: req.fromPostcode },
    to_address: { country_code: req.toCountry, postal_code: req.toPostcode },
    parcels: [
      {
        weight: { value: String(req.weightKg), unit: "kg" },
        dimensions: { length: String(req.lengthCm), width: String(req.widthCm), height: String(req.heightCm), unit: "cm" },
      },
    ],
    calculate_quotes: true,
  };
}

/** Montant texte exact strictement positif (« 10.71 ») ; null si absent, non numérique, nul ou négatif. */
function positiveAmount(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s) || !/[1-9]/.test(s)) return null;
  return s;
}

function amountLabel(value: string, currency: string): string {
  const parsed = parseDecimal(value);
  return parsed.ok ? formatMoneyDec(parsed.value, currency) : `${value} ${currency}`;
}

export function mapSendcloudOptions(body: unknown, quotedAt: string): SendcloudQuoteResult {
  const data = body !== null && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) throw new ConnectorError("INVALID_RESPONSE", "sendcloud", "Réponse Sendcloud inattendue (liste d'options absente).");
  const quotes: ShippingQuoteDTO[] = [];
  const excluded: SendcloudExcludedOption[] = [];
  for (const raw of data) {
    const parsed = optionSchema.safeParse(raw);
    if (!parsed.success) {
      excluded.push({ carrier: "Transporteur non précisé", service: "Option illisible", reason: "Option incomplète dans la réponse Sendcloud." });
      continue;
    }
    const o = parsed.data;
    const carrier = o.carrier?.name?.trim() || o.carrier?.code?.trim() || "Transporteur non précisé";
    const service = o.name?.trim() || o.code;
    if (o.functionalities?.tracked === false) {
      excluded.push({ carrier, service, reason: "Envoi sans suivi : exclu du comparateur." });
      continue;
    }
    if (o.quote_error !== undefined && o.quote_error !== null) {
      excluded.push({ carrier, service, reason: "Sendcloud n'a pas pu calculer de prix pour cette option." });
      continue;
    }
    const quote = o.quotes?.[0];
    const total = positiveAmount(quote?.price?.total?.value);
    const currency = quote?.price?.total?.currency?.trim().toUpperCase() ?? "";
    if (!quote || total === null) {
      excluded.push({ carrier, service, reason: "Prix absent ou nul renvoyé : non affiché." });
      continue;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      excluded.push({ carrier, service, reason: "Devise absente dans la réponse : prix non affiché." });
      continue;
    }
    const restrictions: string[] = [];
    if (o.requirements?.is_service_point_required) restrictions.push("Point relais à choisir pour l'étiquette.");
    for (const f of o.requirements?.fields ?? []) restrictions.push(REQUIREMENT_LABEL[f] ?? `Champ requis pour l'étiquette : ${f}.`);
    for (const b of quote.price?.breakdown ?? []) {
      if (b.type === "price_without_insurance") continue;
      const amount = positiveAmount(b.price?.value);
      if (amount) restrictions.push(`Dont ${b.label?.trim() || b.type || "supplément"} : ${amountLabel(amount, currency)}.`);
    }
    // lead_time : délai annoncé par Sendcloud en heures (ex. 48) ; absent → non communiqué, jamais estimé.
    const transitDays = typeof quote.lead_time === "number" && quote.lead_time > 0 ? Math.ceil(quote.lead_time / 24) : null;
    const firstMile = o.functionalities?.first_mile ?? null;
    const lastMile = o.functionalities?.last_mile ?? null;
    quotes.push({
      key: `sendcloud:${o.code}`,
      provider: "sendcloud",
      providerLabel: "Sendcloud",
      carrier,
      service,
      priceInclVat: null,
      priceExclVat: null,
      priceVatUnknown: total,
      currency,
      transitDaysMin: transitDays,
      transitDaysMax: transitDays,
      estimatedDelivery: null,
      dropOff: firstMile === "dropoff" ? true : firstMile === "pickup" ? false : null,
      deliveryToPickupPoint: lastMile === null ? null : PICKUP_LAST_MILE.has(lastMile) ? true : lastMile === "home_delivery" ? false : null,
      tracking: o.functionalities?.tracked ?? null,
      restrictions,
      quotedAt,
    });
  }
  return { quotes, excluded };
}

/** Message d'erreur Sendcloud v3 ({ errors: [{ detail }] }) tronqué, sans écho de la requête. */
function apiErrorDetail(body: unknown): string | null {
  const errors = body !== null && typeof body === "object" ? (body as { errors?: unknown }).errors : undefined;
  if (!Array.isArray(errors)) return null;
  const first = errors.find((e) => e && typeof e === "object" && typeof (e as { detail?: unknown }).detail === "string") as { detail: string } | undefined;
  return first ? first.detail.replace(/\s+/g, " ").slice(0, 160) : null;
}

export async function sendcloudQuotes(
  req: ShippingQuoteRequest,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
  options: { timeoutMs?: number } = {},
): Promise<SendcloudQuoteResult> {
  const pub = env.SENDCLOUD_PUBLIC_KEY?.trim();
  const secret = env.SENDCLOUD_SECRET_KEY?.trim();
  if (!pub || !secret) throw new ConnectorError("NOT_CONFIGURED", "sendcloud", "Clés Sendcloud absentes (secrets SENDCLOUD_PUBLIC_KEY et SENDCLOUD_SECRET_KEY).");
  const res = await fetchWithRetry(
    SENDCLOUD_SHIPPING_OPTIONS_URL,
    {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${pub}:${secret}`)}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(sendcloudShippingOptionsBody(req)),
    },
    { provider: "sendcloud", timeoutMs: options.timeoutMs ?? 20_000, retries: 1, label: "shipping-options" },
  );
  if (res.status === 401) throw new ConnectorError("AUTH_EXPIRED", "sendcloud", "Clés Sendcloud refusées : vérifiez les secrets SENDCLOUD_PUBLIC_KEY et SENDCLOUD_SECRET_KEY.", { httpStatus: 401 });
  if (res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "sendcloud", "Accès refusé par Sendcloud : votre formule ou vos clés ne permettent pas la consultation des tarifs par API.", { httpStatus: 403 });
  const body = await readJson(res, "sendcloud");
  if (!res.ok) {
    const detail = apiErrorDetail(body);
    throw new ConnectorError("API_ERROR", "sendcloud", `Sendcloud a refusé la demande de devis (HTTP ${res.status})${detail ? ` : ${detail}` : "."}`, { httpStatus: res.status });
  }
  if (body === null) throw new ConnectorError("INVALID_RESPONSE", "sendcloud", "Réponse Sendcloud vide ou illisible.");
  return mapSendcloudOptions(body, now.toISOString());
}
