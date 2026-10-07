import "server-only";
import { AppError } from "@/lib/errors";

// Remplacé par le vrai générateur de données DEMO (voir plus bas dans le projet).
export async function seedDemoData(_organizationId: string): Promise<void> {
  throw new AppError("NOT_IMPLEMENTED", "Le seed de démonstration n'est pas encore disponible.");
}
