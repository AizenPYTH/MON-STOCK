/** Vue d'un calculateur : version simple (par défaut) ou calcul détaillé (`?vue=detail`). */
export type ToolView = "simple" | "detail";

export function readToolView(sp: Record<string, string | string[] | undefined>): ToolView {
  const v = Array.isArray(sp.vue) ? sp.vue[0] : sp.vue;
  return v === "detail" ? "detail" : "simple";
}
