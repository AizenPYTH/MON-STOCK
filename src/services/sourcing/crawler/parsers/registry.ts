import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";
import { jsonLdParser } from "@/services/sourcing/crawler/parsers/jsonld-parser";
import { SOURCE_PARSERS } from "@/integrations/suppliers/sources/registry";

export const DEFAULT_PARSER_KEY = jsonLdParser.key;

export function listParsers(): SourceParser[] {
  return [jsonLdParser, ...SOURCE_PARSERS];
}

export function getParser(key: string | null | undefined): SourceParser | null {
  const k = key && key.trim() ? key.trim() : DEFAULT_PARSER_KEY;
  return listParsers().find((p) => p.key === k) ?? null;
}
