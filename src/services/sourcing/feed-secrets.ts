import "server-only";
import { z } from "zod";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

/**
 * Identifiants d'un flux distant (en-tête ou authentification HTTP Basic) : stockés chiffrés dans
 * supplier_feed_secrets (serveur uniquement), jamais renvoyés à l'application ni journalisés.
 */
export const feedAuthSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("header"), name: z.string().trim().regex(/^[A-Za-z0-9-]{1,64}$/, "Nom d'en-tête invalide (lettres, chiffres, tirets)."), value: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal("basic"), username: z.string().min(1).max(200), password: z.string().min(1).max(500) }),
]);

const FORBIDDEN_HEADERS = new Set(["host", "cookie", "content-length", "transfer-encoding", "connection", "user-agent"]);

export type FeedAuth = z.infer<typeof feedAuthSchema>;

export function authHeaders(auth: FeedAuth): Record<string, string> {
  if (auth.kind === "header") {
    if (FORBIDDEN_HEADERS.has(auth.name.toLowerCase())) throw new AppError("VALIDATION", `En-tête « ${auth.name} » non autorisé.`);
    return { [auth.name]: auth.value };
  }
  if (auth.kind === "basic") return { Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}` };
  return {};
}

/** Identifiants d'un flux, déchiffrés pour le serveur uniquement. */
export async function loadFeedAuthHeaders(admin: AdminSupabaseClient, feedId: string): Promise<Record<string, string>> {
  const { data } = await admin.from("supplier_feed_secrets").select("credentials_enc").eq("feed_id", feedId).maybeSingle();
  if (!data?.credentials_enc) return {};
  const parsed = feedAuthSchema.safeParse(JSON.parse(decryptSecret(data.credentials_enc)));
  return parsed.success ? authHeaders(parsed.data) : {};
}

