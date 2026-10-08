"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[UI] erreur de page", error.digest ?? "", error.message);
  }, [error]);
  const isEnv = error.message.includes("Configuration");
  // En production, les erreurs serveur sont masquées par Next (message générique en anglais + digest) :
  // on affiche alors un message français et la référence à communiquer au support.
  const masked = process.env.NODE_ENV === "production" && Boolean(error.digest);
  const message = masked ? "Une erreur inattendue s'est produite côté serveur. Réessayez dans un instant." : error.message || "Une erreur inattendue s'est produite.";
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-200 bg-danger-soft p-6">
      <h1 className="flex items-center gap-2 text-base font-semibold text-red-900">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Impossible d'afficher cette page
      </h1>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-800">{message}</p>
      {isEnv ? <p className="mt-2 text-xs text-red-800">Vérifiez vos variables d'environnement (voir .env.example).</p> : null}
      {error.digest ? <p className="mt-2 font-mono text-xs text-red-800">Référence : {error.digest}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => reset()}>
          Réessayer
        </Button>
        <ButtonLink href="/dashboard" variant="ghost">
          Tableau de bord
        </ButtonLink>
      </div>
    </div>
  );
}
