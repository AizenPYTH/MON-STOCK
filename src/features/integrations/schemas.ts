import { z } from "zod";

export const connectionIdSchema = z.string().uuid("Identifiant de connexion invalide.");

export const syncNowSchema = z.object({
  connection_id: connectionIdSchema,
  scope: z.enum(["full", "listings", "orders"]).default("full"),
  trigger: z.enum(["manual", "initial"]).default("manual"),
});

export const disconnectSchema = z.object({
  connection_id: connectionIdSchema,
  confirm: z.literal("yes", { message: "Confirmez la déconnexion." }),
});

const checkbox = z.union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("off"), z.literal("false"), z.literal("0"), z.literal("")]).optional();

export const connectionSettingsSchema = z.object({
  connection_id: connectionIdSchema,
  auto_sync: checkbox,
  sync_interval_minutes: z.coerce.number().int().min(15, "L'intervalle minimum est de 15 minutes.").max(1440, "L'intervalle maximum est de 24 h."),
  push_inventory: checkbox,
});

export function checkboxOn(v: string | undefined): boolean {
  return v === "on" || v === "true" || v === "1";
}

export const listingIdSchema = z.object({ listing_id: z.string().uuid("Annonce invalide.") });
export const mapListingSchema = z.object({ listing_id: z.string().uuid("Annonce invalide."), sku_id: z.string().uuid("SKU invalide.") });
export const suggestionIdSchema = z.object({ suggestion_id: z.string().uuid("Suggestion invalide.") });
export const pushQuantitySchema = z.object({ listing_id: z.string().uuid("Annonce invalide."), confirm: z.literal("yes", { message: "Confirmez l'envoi." }) });

export const MAPPING_TABS = ["unmapped", "mapped", "ignored"] as const;
export type MappingTab = (typeof MAPPING_TABS)[number];

export const mappingParamsSchema = z.object({
  tab: z.enum(MAPPING_TABS).default("unmapped"),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type MappingParams = z.infer<typeof mappingParamsSchema>;

export function fieldErrorsOf(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}
