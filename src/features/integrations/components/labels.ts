/** Libellés d'affichage des intégrations (module pur, utilisable côté serveur et client). */

/** Intervalle de synchronisation : « 30 min », « 2 h ». */
export function intervalLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
}

export type ConnectionTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Couleur du statut d'une connexion de canal (point + libellé). */
export function connectionTone(status: string): ConnectionTone {
  if (status === "connected") return "success";
  if (status === "error") return "warning";
  if (status === "expired") return "danger";
  if (status === "pending") return "info";
  return "neutral";
}
