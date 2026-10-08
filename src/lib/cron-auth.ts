import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const CRON_SECRET_MIN_LENGTH = 16;

/**
 * Autorisation commune des routes /api/cron/* : `Authorization: Bearer ${CRON_SECRET}`.
 * Comparaison en temps constant ; 503 si le secret n'est pas configuré, 401 sinon.
 */
export function authorizeCron(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: `CRON_SECRET n'est pas configuré sur ce serveur (au moins ${CRON_SECRET_MIN_LENGTH} caractères) : les tâches planifiées sont désactivées. Voir .env.example.` }, { status: 503 }),
    };
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Comparaison des empreintes SHA-256 (longueur fixe) : ni le contenu ni la LONGUEUR du secret
  // ne fuient par le temps de réponse (timingSafeEqual exige deux tampons de même taille).
  const a = createHash("sha256").update(header, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  const valid = timingSafeEqual(a, b);
  if (!valid) return { ok: false, response: NextResponse.json({ ok: false, error: "Non autorisé : en-tête Authorization Bearer invalide." }, { status: 401 }) };
  return { ok: true };
}
