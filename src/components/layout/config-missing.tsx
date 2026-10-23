import { OctagonAlert } from "lucide-react";

/**
 * Diagnostic de configuration (noms des variables absentes, jamais leurs valeurs), rendu CÔTÉ
 * SERVEUR : il reste lisible en production, contrairement au message d'une erreur que Next masque
 * (W-31). Utilisé par les layouts (auth) et (app).
 */
export function ConfigMissing({ names }: { names: string[] }) {
  return (
    <div role="alert" className="overflow-hidden rounded-2xl border border-danger-line bg-surface">
      <div className="flex items-start gap-3 border-b border-danger-line bg-danger-soft px-5 py-4">
        <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-danger-strong text-on-danger-strong">
          <OctagonAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-h3 text-danger-ink">Le site n&apos;est pas encore relié à la base</h1>
          <p className="mt-0.5 text-sm font-medium text-danger-ink">Variables d&apos;environnement absentes ou invalides :</p>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        <ul className="space-y-1.5">
          {names.map((n) => (
            <li key={n} className="ms-code break-all rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] text-foreground">
              {n}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Vercel → Settings → Environment Variables : ajouter les variables (voir docs/WEB-DEPLOY.md), puis Deployments → ⋯ → Redeploy. Les variables NEXT_PUBLIC_* ne sont prises en compte qu&apos;à la build suivante.
        </p>
      </div>
    </div>
  );
}
