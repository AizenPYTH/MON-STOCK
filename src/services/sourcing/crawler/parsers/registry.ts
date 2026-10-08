import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";
import { jsonLdParser } from "@/services/sourcing/crawler/parsers/jsonld-parser";
import { listAdapterHtmlParsers } from "@/integrations/sourcing/registry";

export const DEFAULT_PARSER_KEY = jsonLdParser.key;

/** Parser générique JSON-LD + parsers HTML dédiés exposés par les adaptateurs (src/integrations/sourcing/<key>). */
export function listParsers(): SourceParser[] {
  const out: SourceParser[] = [jsonLdParser];
  for (const p of listAdapterHtmlParsers()) if (!out.some((x) => x.key === p.key)) out.push(p);
  return out;
}

export function getParser(key: string | null | undefined): SourceParser | null {
  const k = key && key.trim() ? key.trim() : DEFAULT_PARSER_KEY;
  return listParsers().find((p) => p.key === k) ?? null;
}
