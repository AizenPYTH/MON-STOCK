/**
 * Diagnostic de configuration (noms des variables absentes, jamais leurs valeurs), rendu CÔTÉ
 * SERVEUR : il reste lisible en production, contrairement au message d'une erreur que Next masque
 * (W-31). Utilisé par les layouts (auth) et (app).
 */
export function ConfigMissing({ names }: { names: string[] }) {
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
