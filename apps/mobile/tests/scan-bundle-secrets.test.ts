/// <reference types="node" />
/**
 * @jest-environment node
 *
 * M-22 : le scanner de bundle (scripts/scan-bundle-secrets.mjs) détecte les secrets serveur
 * (noms et valeurs) sans faux positif sur les textes d'interface légitimes.
 * Les faux secrets sont construits par concaténation : aucun motif de clé littéral dans ce fichier.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../scripts/scan-bundle-secrets.mjs");
const dirs: string[] = [];

function scan(content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "scan-bundle-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "index.js"), content);
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const fill = (n: number) => "aB3dE6gH9k".repeat(Math.ceil(n / 10)).slice(0, n);

describe("scan-bundle-secrets", () => {
  it("accepte un bundle sain, y compris le message d'interface qui cite OPENAI_API_KEY", () => {
    const r = scan(`var a="Non activé : clé OPENAI_API_KEY à ajouter dans les secrets de l'Edge Function.";var k="sb_publishable_${fill(24)}";var t="task-${fill(30)}";`);
    expect(r.out).toContain("aucun secret");
    expect(r.status).toBe(0);
  });

  it.each([
    ["SENDCLOUD_SECRET_KEY", `x.${"SENDCLOUD"}_SECRET_KEY`],
    ["SHIP24_API_KEY", `"${"SHIP24"}_API_KEY"`],
    ["DHL_API_KEY", `"${"DHL"}_API_KEY"`],
    ["LAPOSTE_OKAPI_KEY", `"${"LAPOSTE"}_OKAPI_KEY"`],
    ["PACKLINK_API_KEY", `"${"PACKLINK"}_API_KEY"`],
    ["BOXTAL_V1_PASSWORD", `"${"BOXTAL"}_V1_PASSWORD"`],
    ["SUPABASE_SERVICE_ROLE_KEY", `"${"SUPABASE"}_SERVICE_ROLE_KEY"`],
  ])("refuse le nom de secret serveur %s", (name, snippet) => {
    const r = scan(`var s=${snippet};`);
    expect(r.status).toBe(1);
    expect(r.out).toContain(name);
  });

  it.each([
    ["clé OpenAI (sk-…)", `"${"sk-"}proj-${fill(48)}"`],
    ["clé OpenAI (sk-…)", `'${"sk-"}${fill(48)}'`],
    ["clé OpenAI (marqueur T3BlbkFJ)", `${fill(20)}${"T3Blbk"}FJ${fill(20)}`],
    ["clé secrète Supabase", `"${"sb_"}secret_${fill(32)}"`],
    ["clé Ship24", `"${"apik_"}${fill(30)}"`],
    ["accès à un secret serveur", `process.env.${"OPENAI"}_API_KEY`],
  ])("refuse la valeur ou l'accès : %s", (label, snippet) => {
    const r = scan(`var s=${snippet};`);
    expect(r.status).toBe(1);
    expect(r.out).toContain(label);
  });

  it("refuse un JWT service_role mais accepte un JWT anon", () => {
    const jwt = (role: string) => {
      const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      return `${b({ alg: "HS256", typ: "JWT" })}.${b({ role, iss: "supabase" })}.${fill(20)}`;
    };
    expect(scan(`var k="${jwt("anon")}";`).status).toBe(0);
    const r = scan(`var k="${jwt("service_role")}";`);
    expect(r.status).toBe(1);
    expect(r.out).toContain("service_role");
  });
});
