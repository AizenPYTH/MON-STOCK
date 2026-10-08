/** Parsing pur du flux quotidien de la BCE (eurofxref-daily.xml, base EUR). */
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export interface EcbRates {
  date: string;
  /** taux EUR → devise (EUR = 1) */
  rates: Record<string, number>;
}

const cubeSchema = z.object({ "@_currency": z.string().length(3), "@_rate": z.coerce.number().positive() });

export function parseEcbXml(xml: string): EcbRates {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const envelope = (doc.Envelope ?? doc) as Record<string, unknown>;
  const outer = envelope.Cube as Record<string, unknown> | undefined;
  const dated = outer?.Cube as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
  const day = Array.isArray(dated) ? dated[0] : dated;
  if (!day || typeof day !== "object") throw new Error("Flux BCE illisible : structure Cube absente.");
  const date = String(day["@_time"] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Flux BCE illisible : date absente.");
  const inner = day.Cube;
  const list = Array.isArray(inner) ? inner : inner ? [inner] : [];
  const rates: Record<string, number> = { EUR: 1 };
  for (const c of list) {
    const parsed = cubeSchema.safeParse(c);
    if (parsed.success) rates[parsed.data["@_currency"].toUpperCase()] = parsed.data["@_rate"];
  }
  if (Object.keys(rates).length <= 1) throw new Error("Flux BCE illisible : aucun taux.");
  return { date, rates };
}

/** Taux croisé from → to à partir de taux base EUR. null si une devise manque. */
export function crossRate(rates: Record<string, number>, from: string, to: string): number | null {
  const f = rates[from.toUpperCase()];
  const t = rates[to.toUpperCase()];
  if (!f || !t) return null;
  return Math.round((t / f) * 1_000_000) / 1_000_000;
}
