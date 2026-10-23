import type { ReactNode } from "react";

// Application entièrement authentifiée : rendu dynamique à chaque requête.
export const dynamic = "force-dynamic";
import { publicEnvIssues } from "@/lib/env";
import { ConfigMissing } from "@/components/layout/config-missing";
import { AuthShell } from "@/components/auth-shell/auth-shell";
import { Accent } from "@/components/marketing/serif-accent";

/**
 * Connexion, inscription et mot de passe (parcours v2, handoff §D) : chaque page pose son cadre
 * `AuthShell` (scène nuit à titre serif, papier chaud, panneau « ports » pour l'inscription et la
 * connexion). Le layout ne garde que le diagnostic de configuration (W-31).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  // Site déployé sans sa configuration : dire quoi faire plutôt qu'une erreur serveur masquée.
  const missing = publicEnvIssues();
  if (missing.length > 0) {
    return (
      <AuthShell
        eyebrow="Configuration"
        title={
          <>
            Configuration <Accent className="text-mint">incomplète.</Accent>
          </>
        }
      >
        <ConfigMissing names={missing} />
      </AuthShell>
    );
  }
  return children;
}
