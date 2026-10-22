/**
 * W-09 (limites d'envoi cohérentes), W-21 (diagnostic d'un envoi de catalogue) et W-19 (seules les
 * AppError montrent leur message ; le reste : message générique + référence journalisée).
 */
import { describe, expect, it, vi } from "vitest";
import { describeUploadResponse, SESSION_EXPIRED_UPLOAD, TOO_LARGE_ONLINE } from "@/features/catalog-imports/upload-response";
import { SERVER_ACTION_BODY_LIMIT_BYTES, WEB_UPLOAD_MAX_BYTES, webUploadTooLargeMessage } from "@/lib/upload-limits";
import { AppError, toUserMessage } from "@/lib/errors";
import { EdgeApiError } from "@/lib/edge-api";

vi.mock("@/features/auth/dal", () => ({ requireOrgContextForAction: async () => ({ organization: { id: "org" }, supabase: {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const res = (over: Partial<{ redirected: boolean; url: string; status: number; contentType: string | null }>) => ({
  redirected: false,
  url: "https://app.example/sourcing/imports/new/preview",
  status: 200,
  contentType: "application/json",
  ...over,
});

describe("W-21 : réponse d'un envoi de catalogue", () => {
  it("JSON de l'application : exploité tel quel", () => {
    expect(describeUploadResponse(res({}))).toBeNull();
    expect(describeUploadResponse(res({ status: 400 }))).toBeNull();
  });
  it("redirection vers /login (proxy) ou 401 : session expirée, avec reconnexion", () => {
    expect(describeUploadResponse(res({ redirected: true, url: "https://app.example/login?next=%2Fsourcing", contentType: "text/html" }))).toMatchObject({ error: SESSION_EXPIRED_UPLOAD, action: { href: "/login" } });
    expect(describeUploadResponse(res({ status: 401 }))).toMatchObject({ error: SESSION_EXPIRED_UPLOAD });
  });
  it("413 : fichier trop gros pour le site (jamais « session expirée »)", () => {
    const r = describeUploadResponse(res({ status: 413, contentType: "text/plain" }));
    expect(r).toMatchObject({ error: TOO_LARGE_ONLINE });
    expect(r && "action" in r ? r.action : undefined).toBeUndefined();
  });
  it("504 / 500 HTML de la plateforme : délai dépassé / erreur serveur", () => {
    expect(describeUploadResponse(res({ status: 504, contentType: "text/html" }))?.ok === false && describeUploadResponse(res({ status: 504, contentType: "text/html" }))).toMatchObject({ error: expect.stringContaining("délai") });
    expect(describeUploadResponse(res({ status: 500, contentType: "text/html" }))).toMatchObject({ error: expect.stringContaining("HTTP 500") });
    expect(JSON.stringify(describeUploadResponse(res({ status: 502, contentType: "text/html" })))).not.toContain("session");
  });
});

describe("W-09 : limites d'envoi", () => {
  it("une seule limite annoncée et appliquée ; corps des Server Actions aligné", async () => {
    expect(webUploadTooLargeMessage(WEB_UPLOAD_MAX_BYTES)).toBeNull();
    expect(webUploadTooLargeMessage(WEB_UPLOAD_MAX_BYTES + 1)).toContain("4 Mo");
    const { default: config } = await import("../../next.config");
    expect((config.experimental?.serverActions as { bodySizeLimit?: number } | undefined)?.bodySizeLimit).toBe(SERVER_ACTION_BODY_LIMIT_BYTES);
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBeGreaterThan(WEB_UPLOAD_MAX_BYTES);
    // Limite de la plateforme (~4,5 Mo) respectée, marge multipart comprise.
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBeLessThanOrEqual(4.5 * 1024 * 1024);
  });

  it("fichier de flux trop gros : message clair (AppError), aucun traitement", async () => {
    const { previewFeedAction } = await import("@/features/suppliers/actions");
    const fd = new FormData();
    fd.set("supplier_id", "00000000-0000-4000-8000-000000000001");
    fd.set("name", "Flux");
    fd.set("format", "csv");
    fd.set("file", new File([new Uint8Array(WEB_UPLOAD_MAX_BYTES + 10)], "gros.csv", { type: "text/csv" }));
    const r = await previewFeedAction(null, fd);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("4 Mo maximum") });
  });
});

describe("W-19 : messages d'erreur montrés à l'utilisateur", () => {
  it("AppError et erreurs rédigées pour l'utilisateur : message conservé", () => {
    expect(toUserMessage(new AppError("VALIDATION", "Nom requis."))).toBe("Nom requis.");
    expect(toUserMessage(new EdgeApiError("Le serveur met trop de temps à répondre.", "TIMEOUT"))).toBe("Le serveur met trop de temps à répondre.");
  });
  it("erreur technique (réseau, TypeError, bibliothèque) : générique + référence, jamais le texte brut", () => {
    for (const e of [new TypeError("fetch failed"), new Error("ECONNRESET socket hang up"), new Error("Cannot read properties of undefined (reading 'x')"), "boom"]) {
      const m = toUserMessage(e);
      expect(m).toMatch(/^Une erreur inattendue s'est produite\. .*\(réf\. [0-9A-F]{8}\)\.$/);
      expect(m).not.toMatch(/fetch failed|ECONNRESET|undefined|boom/);
    }
  });
});
