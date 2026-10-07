"use client";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[UI] erreur de page", error.message);
  }, [error]);
  const isEnv = error.message.includes("Configuration");
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-danger-soft p-6">
      <h1 className="text-base font-semibold text-red-900">Impossible d'afficher cette page</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm text-red-800">{error.message || "Une erreur inattendue s'est produite."}</p>
      {isEnv ? <p className="mt-2 text-xs text-red-700">Vérifiez vos variables d'environnement (voir .env.example).</p> : null}
      <div className="mt-4 flex gap-2">
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
