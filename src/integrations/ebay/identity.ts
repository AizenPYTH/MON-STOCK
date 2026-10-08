import { z } from "zod";
import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { accountInfoSchema, type AccountInfo } from "@/integrations/core/types";
import { EBAY_PROVIDER, type EbayConfig } from "@/integrations/ebay/config";
import { ebayRestGet } from "@/integrations/ebay/rest";

/** Réponse de GET /commerce/identity/v1/user/ (Identity API, hôte apiz.ebay.com). */
export const ebayUserSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  accountType: z.string().optional(),
  registrationMarketplaceId: z.string().optional(),
  status: z.string().optional(),
});

export function normalizeEbayUser(raw: unknown): AccountInfo {
  const parsed = ebayUserSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, "Réponse inattendue de l'Identity API eBay (impossible de lire le compte vendeur).", {
      details: { issues: parsed.error.issues.map((i) => i.path.join(".")) },
    });
  }
  return accountInfoSchema.parse({
    externalAccountId: parsed.data.userId,
    username: parsed.data.username,
    accountType: parsed.data.accountType ?? null,
    registrationMarketplaceId: parsed.data.registrationMarketplaceId ?? null,
  });
}

export async function fetchEbayAccountInfo(config: EbayConfig, auth: ConnectorAuth): Promise<AccountInfo> {
  const json = await ebayRestGet(auth, `${config.apizBase}/commerce/identity/v1/user/`, "identity:getUser");
  return normalizeEbayUser(json);
}
