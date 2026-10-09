import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fromPostgrestError, SQL_ERROR_MESSAGES, toUserMessage } from "@/lib/errors";

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

function sqlCodes(): string[] {
  const codes = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(path.join(MIGRATIONS, f), "utf8");
    for (const m of sql.matchAll(/raise exception '([A-Z][A-Z0-9_]+)/g)) if (m[1]) codes.add(m[1]);
  }
  return [...codes].sort();
}

describe("fromPostgrestError", () => {
  it("traduit chaque code métier levé par les migrations", () => {
    const missing = sqlCodes().filter((c) => !(c in SQL_ERROR_MESSAGES));
    expect(missing).toEqual([]);
  });
  it("utilise le code en tête du message", () => {
    const e = fromPostgrestError({ message: "LAST_OWNER", code: "P0001" });
    expect(e.code).toBe("CONFLICT");
    expect(e.message).toContain("propriétaire");
  });
  it("ne confond pas un code avec un préfixe d'un autre", () => {
    expect(fromPostgrestError({ message: "PURCHASE_ORDER_NOT_SENT" }).message).toContain("envoyée");
    expect(fromPostgrestError({ message: "PURCHASE_ORDER_NOT_FOUND" }).message).toContain("introuvable");
  });
  it("donne un message clair pour une session expirée et une base injoignable", () => {
    expect(fromPostgrestError({ code: "PGRST301", message: "JWT expired" }).code).toBe("AUTH_REQUIRED");
    expect(fromPostgrestError({ message: "TypeError: fetch failed" }).message).toContain("injoignable");
  });

  it("n'affiche jamais le message SQL brut d'une erreur inconnue : message générique + référence, journalisé côté serveur", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = 'relation "public.channel_connection_secrets" violates constraint "secret_fk" Bearer abcdefghijklmnop';
    const e = fromPostgrestError({ code: "XX000", message: raw, details: "Key (id)=(42)", hint: null });
    expect(e.code).toBe("INTERNAL");
    expect(e.message).toMatch(/^Une erreur inattendue est survenue côté base de données\. Réessayez ou contactez le support \(réf\. [0-9A-F]{8}\)\.$/);
    expect(e.message).not.toContain("channel_connection_secrets");
    expect(e.message).not.toContain("secret_fk");
    expect(e.details).toMatchObject({ pg: "XX000", ref: expect.stringMatching(/^[0-9A-F]{8}$/) });
    // Journal serveur : message brut (secrets masqués) et même référence.
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0]!.map(String).join(" ");
    expect(logged).toContain("channel_connection_secrets");
    expect(logged).toContain((e.details as { ref: string }).ref);
    expect(logged).not.toContain("abcdefghijklmnop");
    // Deux erreurs → deux références distinctes.
    expect(fromPostgrestError({ code: "XX000", message: raw }).details?.ref).not.toBe((e.details as { ref: string }).ref);
  });

  it("ne classe en « injoignable » que les vraies erreurs réseau", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const m of ["fetch failed", "connect ECONNREFUSED 127.0.0.1:5432", "getaddrinfo ENOTFOUND db.example", "ETIMEDOUT", "getaddrinfo EAI_AGAIN db", "socket hang up"]) {
      expect(fromPostgrestError({ message: m }).message, m).toContain("injoignable");
    }
    // Un message SQL qui contient « network » (nom de table, de colonne…) n'est PAS une panne réseau.
    for (const m of ['column "network_id" does not exist', 'relation "social_network" does not exist']) {
      const e = fromPostgrestError({ code: "42703", message: m });
      expect(e.message, m).not.toContain("injoignable");
      expect(e.message, m).not.toContain("network");
    }
  });

  it("traduit les SQLSTATE courants", () => {
    expect(fromPostgrestError({ code: "23514", message: 'new row violates check constraint "x"' })).toMatchObject({ code: "VALIDATION", message: "Valeur invalide (contrainte de validation)." });
    expect(fromPostgrestError({ code: "22001", message: "value too long for type character varying(64)" })).toMatchObject({ code: "VALIDATION", message: expect.stringContaining("Valeur trop longue") });
    expect(fromPostgrestError({ code: "22003", message: "numeric field overflow" })).toMatchObject({ code: "VALIDATION", message: expect.stringContaining("Nombre hors limites") });
    for (const code of ["40001", "40P01"]) {
      expect(fromPostgrestError({ code, message: "could not serialize access" })).toMatchObject({ code: "CONFLICT", message: "Conflit d'accès simultané, réessayez." });
    }
  });

  it("toUserMessage ne laisse pas passer le message brut d'une erreur PostgREST", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    class PostgrestError extends Error {
      code = "XX000";
      constructor(m: string) {
        super(m);
        this.name = "PostgrestError";
      }
    }
    expect(toUserMessage(new PostgrestError('relation "secret_table" x'))).toContain("Une erreur inattendue");
    expect(toUserMessage({ code: "23505", message: 'duplicate key value violates unique constraint "skus_org_code_uidx"', details: null })).toBe("Cet enregistrement existe déjà (doublon).");
    expect(toUserMessage(new Error("Erreur métier lisible"))).toBe("Erreur métier lisible");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
