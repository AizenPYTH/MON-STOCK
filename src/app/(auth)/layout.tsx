import type { ReactNode } from "react";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import { PublicHeader } from "@/components/public/public-chrome";

/**
 * Connexion, inscription et mot de passe (handoff v5) : en-tête nuit du site public puis
 * papier arrondi qui porte un formulaire centré de 420 px.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <PublicHeader />
      <main id="contenu" className="mt-6 flex flex-1 justify-center rounded-t-3xl bg-background px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
