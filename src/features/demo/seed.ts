import "server-only";
import { AppError } from "@/lib/errors";

/**
 * Remplissage d'une organisation DEMO. Implémenté dans src/features/demo/seed-data.ts
 * (chargé dynamiquement pour ne pas embarquer les données fictives dans le code de production courant).
 */
export async function seedDemoOrganization(organizationId: string): Promise<void> {
  const mod = await import("@/features/demo/seed-data");
  if (!mod.seedDemoData) throw new AppError("NOT_IMPLEMENTED", "Le seed de démonstration n'est pas disponible.");
  await mod.seedDemoData(organizationId);
}
