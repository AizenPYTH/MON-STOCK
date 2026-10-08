import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fromPostgrestError, SQL_ERROR_MESSAGES } from "@/lib/errors";

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
});
