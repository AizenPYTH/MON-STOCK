import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/db/database.types";
import { publicEnv } from "@/lib/env";
import { isWebPreview, previewClient } from "@/lib/supabase/preview";

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * Il agit AU NOM DE L'UTILISATEUR connecté : la RLS s'applique.
 */
export async function createServerSupabaseClient() {
  // cookies() en premier : la route devient dynamique avant toute lecture d'environnement.
  const cookieStore = await cookies();
  // Aperçu visuel uniquement (jamais sur un vrai projet, voir preview.ts).
  if (isWebPreview()) return (await previewClient()) as unknown as SsrClient;
  const env = publicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un Server Component : les cookies sont rafraîchis par proxy.ts.
        }
      },
    },
  });
}

type SsrClient = ReturnType<typeof createServerClient<Database>>;
export type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
