import type { ReactNode } from "react";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import { PublicHeader } from "@/components/public/public-chrome";
import { publicEnvIssues } from "@/lib/env";

/**
 * Connexion, inscription et mot de passe (handoff v5) : en-tête nuit du site public puis
 * papier arrondi qui porte un formulaire centré de 420 px.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  // Site déployé sans sa configuration : dire quoi faire plutôt qu'une erreur serveur masquée.
  const missing = publicEnvIssues();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-night">
      <PublicHeader />
      <main id="contenu" className="mt-6 flex flex-1 justify-center rounded-t-3xl bg-background px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-[420px]">{missing.length > 0 ? <ConfigMissing names={missing} /> : children}</div>
      </main>
    </div>
  );
}

function ConfigMissing({ names }: { names: string[] }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-danger-soft p-6">
      <h1 className="text-base font-bold text-red-900">Le site n'est pas encore relié à la base</h1>
      <p className="mt-2 text-sm text-red-800">Variables d'environnement absentes ou invalides :</p>
      <ul className="mt-2 space-y-1">
        {names.map((n) => (
          <li key={n} className="ms-code text-[13px] text-red-900">
            {n}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-red-800">
        Vercel → Settings → Environment Variables : ajouter les variables (voir docs/WEB-DEPLOY.md), puis Deployments → ⋯ → Redeploy. Les variables NEXT_PUBLIC_* ne sont prises en compte qu'à la build suivante.
      </p>
    </div>
  );
}
