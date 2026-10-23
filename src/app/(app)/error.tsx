"use client";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[UI] erreur de page", error.digest ?? "", error.message);
  }, [error]);
  // En production, les erreurs serveur sont masquées par Next (message générique en anglais + digest) :
  // on affiche alors un message français et la référence à communiquer au support. Le diagnostic de
  // configuration ne peut donc PAS reposer sur le message ici (W-31) : il est rendu côté serveur par
  // le layout (app) ; cette indication ne sert qu'en développement.
  const masked = process.env.NODE_ENV === "production" && Boolean(error.digest);
  const isEnv = !masked && error.message.includes("Configuration");
  const message = masked ? "Une erreur inattendue s'est produite côté serveur. Réessayez dans un instant." : error.message || "Une erreur inattendue s'est produite.";
  return (
    <div className="mx-auto w-full max-w-xl py-6">
      <ErrorState
        title="Impossible d'afficher cette page"
        description={
          <span className="block whitespace-pre-wrap break-words">
            {message}
            {isEnv ? <span className="mt-2 block text-xs">Vérifiez vos variables d&apos;environnement (voir .env.example).</span> : null}
            <span className="mt-2 block text-xs">Vos données ne sont pas modifiées.</span>
          </span>
        }
        details={error.digest ? `Référence : ${error.digest}` : undefined}
        action={
          <>
            <Button variant="secondary" onClick={() => reset()}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Réessayer
            </Button>
            <ButtonLink href="/dashboard" variant="ghost">
              Tableau de bord
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}
