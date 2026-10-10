import "server-only";
import { BOXTAL_DEFAULT_URL } from "@/integrations/shipping/boxtal";
import { PACKLINK_BASE_URL } from "@/integrations/shipping/packlink";
import { LAPOSTE_SUIVI_URL } from "@/integrations/tracking/laposte";
import { SHIP24_TRACK_URL } from "@/integrations/tracking/ship24";

/**
 * Contrôle réel, SANS identifiants, des API d'expédition et de suivi : chaque point d'accès doit
 * exister et exiger une authentification (401/403). Prouve que l'adresse et la méthode sont
 * bonnes ; les prix et statuts réels restent à tester avec les clés.
 */
export interface ProbeResult {
  id: string;
  url: string;
  httpStatus: number | null;
  /** l'API répond et demande une authentification (comportement attendu sans clé) */
  authRequired: boolean;
  bodyHint: string | null;
  error: string | null;
  durationMs: number;
}

const TARGETS: { id: string; url: string; init: RequestInit }[] = [
  { id: "packlink", url: `${PACKLINK_BASE_URL}services?from[country]=FR&from[zip]=75001&to[country]=FR&to[zip]=33000&source=PRO&packages[0][height]=10&packages[0][width]=15&packages[0][length]=20&packages[0][weight]=1`, init: { method: "GET", headers: { Accept: "application/json" } } },
  { id: "boxtal", url: `${BOXTAL_DEFAULT_URL}cotation?shipper.pays=FR&shipper.code_postal=75001&recipient.pays=FR&recipient.code_postal=33000&colis_1.poids=1&colis_1.longueur=20&colis_1.largeur=15&colis_1.hauteur=10`, init: { method: "GET", headers: { Accept: "application/xml" } } },
  { id: "laposte-suivi", url: `${LAPOSTE_SUIVI_URL}6A18987970674?lang=fr_FR`, init: { method: "GET", headers: { Accept: "application/json" } } },
  { id: "ship24", url: SHIP24_TRACK_URL, init: { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" }, body: JSON.stringify({ trackingNumber: "6A18987970674" }) } },
];

export async function probeToolConnectors(fetchImpl: typeof fetch = fetch): Promise<ProbeResult[]> {
  return Promise.all(
    TARGETS.map(async (t) => {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetchImpl(t.url, { ...t.init, redirect: "manual", signal: controller.signal });
        const text = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
        return { id: t.id, url: t.url.split("?")[0]!, httpStatus: res.status, authRequired: res.status === 401 || res.status === 403, bodyHint: text || null, error: null, durationMs: Date.now() - started };
      } catch (e) {
        return { id: t.id, url: t.url.split("?")[0]!, httpStatus: null, authRequired: false, bodyHint: null, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
