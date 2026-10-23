import type { Route } from "next";
import { safeInternalPath } from "@/lib/utils";

/**
 * W-22 : chemins internes et `typedRoutes`.
 *
 * Les liens LITTÉRAUX et les gabarits sur une route existante (`/stock/${code}`, `/sales/${id}`,
 * `/advisor?conversation=${id}`) sont vérifiés par le compilateur : aucune conversion n'est
 * nécessaire (les types générés `.next/types/link.d.ts` sont inclus par tsconfig.json).
 *
 * Seuls les chemins CALCULÉS à l'exécution (paramètre `next`, filtres et pagination construits,
 * `href` reçu en propriété) passent par ces fonctions : une conversion nommée et unique au lieu de
 * `as never` dispersés (qui désactivaient toute vérification).
 */

/** Chemin interne déjà construit par l'application (filtres, pagination, propriété `href`). */
export function internalRoute(path: string): Route {
  return path as Route;
}

/** Chemin interne venant de l'extérieur (`?next=`) : assaini (sinon `fallback`), puis typé. */
export function safeInternalRoute(raw: unknown, fallback: Route = "/dashboard"): Route {
  return internalRoute(safeInternalPath(raw, fallback));
}
