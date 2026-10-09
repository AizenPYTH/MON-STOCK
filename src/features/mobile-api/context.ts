import "server-only";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createBearerSupabaseClient } from "@/lib/supabase/bearer";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOrgContext, type OrgContext } from "@/features/auth/dal";
import { ORGANIZATION_HEADER } from "@/features/mobile-api/contract";

/**
 * Authentification des appels de l'application mobile.
 *
 * - Le jeton d'accès Supabase arrive dans `Authorization: Bearer <jwt>` (jamais en cookie,
 *   jamais dans l'URL) ; il est VALIDÉ auprès de Supabase Auth (`getUser`), pas seulement décodé.
 * - Toutes les requêtes utilisent ensuite le client de l'utilisateur : la RLS s'applique.
 * - L'organisation active vient de l'en-tête `X-Organization-Id` ; l'appartenance est vérifiée.
 */

/** Taille maximale acceptée pour un JWT (protection contre les en-têtes démesurés). */
const MAX_TOKEN_LENGTH = 8192;

export const MOBILE_SESSION_EXPIRED = "Votre session a expiré. Reconnectez-vous pour continuer.";

export function bearerTokenOf(request: Pick<Request, "headers">): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+([A-Za-z0-9\-_.=]+)$/);
  if (!match?.[1] || match[1].length > MAX_TOKEN_LENGTH) return null;
  return match[1];
}

export interface MobileUserContext {
  supabase: ServerSupabaseClient;
  user: User;
}

export type MobileClientFactory = (accessToken: string) => ServerSupabaseClient;

/** Utilisateur authentifié (sans exiger d'organisation : écran d'accueil, création d'organisation). */
export async function requireMobileUser(request: Pick<Request, "headers">, factory: MobileClientFactory = createBearerSupabaseClient): Promise<MobileUserContext> {
  const token = bearerTokenOf(request);
  if (!token) throw new AppError("AUTH_REQUIRED", "Connexion requise.");
  const supabase = factory(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AppError("AUTH_REQUIRED", MOBILE_SESSION_EXPIRED);
  return { supabase, user: data.user };
}

const orgIdSchema = z.string().uuid();

export interface MobileContextOptions {
  write?: boolean;
  admin?: boolean;
}

/** Contexte complet (utilisateur + organisation + rôle), mêmes règles que les Server Actions. */
export async function requireMobileOrgContext(
  request: Pick<Request, "headers">,
  options: MobileContextOptions = {},
  factory: MobileClientFactory = createBearerSupabaseClient,
): Promise<OrgContext> {
  const rawOrg = request.headers.get(ORGANIZATION_HEADER);
  let orgId: string | null = null;
  if (rawOrg !== null) {
    const parsed = orgIdSchema.safeParse(rawOrg.trim());
    if (!parsed.success) throw new AppError("VALIDATION", "Organisation invalide.");
    orgId = parsed.data;
  }
  const { supabase, user } = await requireMobileUser(request, factory);
  const ctx = await resolveOrgContext(supabase, user, orgId);
  if (!ctx) {
    throw new AppError(
      "FORBIDDEN",
      orgId ? "Vous n'êtes pas (ou plus) membre de cette organisation. Choisissez une autre organisation." : "Vous n'êtes membre d'aucune organisation active.",
    );
  }
  if (options.admin && !["owner", "admin"].includes(ctx.role)) {
    throw new AppError("FORBIDDEN", "Cette action est réservée aux administrateurs de l'organisation.");
  }
  if (options.write && ctx.role === "viewer") {
    throw new AppError("FORBIDDEN", "Votre rôle (lecture seule) ne permet pas cette action.");
  }
  return ctx;
}
