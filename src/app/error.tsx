"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";

/** Erreur hors de l'espace applicatif (connexion, inscription, invitation, onboarding). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[UI] erreur de page", error.digest ?? "", error.message);
  }, [error]);
  const masked = process.env.NODE_ENV === "production" && Boolean(error.digest);
  const message = masked ? "Une erreur inattendue s'est produite côté serveur. Réessayez dans un instant." : error.message || "Une erreur inattendue s'est produite.";
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          MON STOCK
        </Link>
      </header>
      <main id="contenu" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div role="alert" className="w-full max-w-md rounded-xl border border-red-200 bg-danger-soft p-6">
          <h1 className="text-base font-semibold text-red-900">Impossible d'afficher cette page</h1>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-800">{message}</p>
          {error.digest ? <p className="mt-2 font-mono text-xs text-red-800">Référence : {error.digest}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => reset()}>
              Réessayer
            </Button>
            <ButtonLink href="/login" variant="ghost">
              Connexion
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
