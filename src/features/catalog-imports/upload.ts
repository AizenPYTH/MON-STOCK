import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { isCrossSiteRequest } from "@/features/integrations/oauth-flow";
import { fail, ok, type ActionResult } from "@/lib/result";
import { isAppError, toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { catalogImportSchema, catalogPreviewSchema, importCatalogFile, previewCatalogFileForOrg } from "@/services/sourcing/catalog-import";
import type { CatalogImportDTO, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { assertContentLength, buildCatalogBody, CatalogRequestError, fileToCatalogInput, parseOptions, validationMessage } from "@/features/catalog-imports/request";

const log = createLogger("WEB_CATALOG_IMPORT");

/**
 * Aperçu / import d'un catalogue depuis le site web. Équivalent des routes Edge
 * POST /sourcing/import/preview et POST /sourcing/import : rôle rédacteur, même schéma, même
 * taille maximale (15 Mo), mêmes services. Un route handler (et non une Server Action, bornée à
 * 1 Mo par défaut) reçoit le fichier en multipart ; il refuse toute requête inter-sites.
 */
export async function handleCatalogRequest(request: Request, kind: "preview" | "import"): Promise<NextResponse<ActionResult<CatalogPreviewDTO | CatalogImportDTO>>> {
  const reply = (r: ActionResult<CatalogPreviewDTO | CatalogImportDTO>, status = 200) => NextResponse.json(r, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const selfOrigin = new URL(request.url).origin;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (isCrossSiteRequest(request.headers, [selfOrigin, ...(appUrl ? [appUrl] : [])])) return reply(fail("Requête refusée : elle ne provient pas de MON STOCK."), 403);
    assertContentLength(request.headers.get("content-length"));
    const ctx = await requireOrgContextForAction({ write: true });
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      // Au-delà de 10 Mo, le proxy Next.js ne transmet qu'un corps tronqué (proxyClientMaxBodySize par défaut).
      const big = Number(request.headers.get("content-length") ?? 0) > 10 * 1024 * 1024;
      return reply(fail(big ? "Fichier non reçu en entier par le serveur web (plus de 10 Mo) : découpez-le ou importez-le depuis l'application iPhone (15 Mo maximum)." : "Fichier non reçu : réessayez (15 Mo maximum)."), 400);
    }
    const options = parseOptions(form.get("options"));
    const file = await fileToCatalogInput(form.get("file"), form.get("sheet"), options.fileSize);
    const body = buildCatalogBody(kind, file, options);
    if (kind === "preview") {
      const parsed = catalogPreviewSchema.safeParse(body);
      if (!parsed.success) return reply(fail(validationMessage(parsed.error.issues)), 400);
      return reply(ok(await previewCatalogFileForOrg(ctx, parsed.data)));
    }
    const parsed = catalogImportSchema.safeParse(body);
    if (!parsed.success) return reply(fail(validationMessage(parsed.error.issues)), 400);
    const result = await importCatalogFile(ctx, parsed.data);
    revalidatePath("/sourcing/imports");
    revalidatePath("/sourcing/sources");
    revalidatePath("/suppliers/directory", "layout");
    return reply(ok(result));
  } catch (e) {
    if (e instanceof CatalogRequestError) return reply(fail(e.message), e.status);
    if (isAppError(e)) return reply(fail(e.message, { code: e.code, ...(e.action ? { action: e.action } : {}) }), e.status);
    log.error("import de catalogue (web) en échec", { kind, message: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    return reply(fail(toUserMessage(e)), 500);
  }
}
