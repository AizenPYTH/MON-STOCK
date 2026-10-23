/**
 * Parcours v2 (handoff §D, §G, §I) : étape « plateforme » (`/onboarding/plateforme`).
 * - `choosePlatformState` : les 7 états, tous dérivés de faits réels (connexion en base, attente
 *   OAuth, configuration, rôle) ; l'URL n'est qu'un indice (succès SEULEMENT si confirmé en base) ;
 * - liste blanche de la page de retour OAuth (aucune URL arbitraire) ;
 * - la route reste protégée par le proxy (session exigée).
 */
import { describe, expect, it } from "vitest";
import { choosePlatformState, FUTURE_CHANNELS, futureChannel, type EbayConnectionFact, type PlatformInputs } from "@/features/onboarding/platform-state";
import { DEFAULT_OAUTH_RETURN, oauthErrorTarget, oauthSuccessTarget, OAUTH_RETURN_PATHS, resolveOAuthReturn, returnFromState, stateRedirectFor } from "@/features/integrations/oauth-return";
import { OAUTH_ERROR_MESSAGES, OAUTH_GENERIC_ERROR } from "@/features/integrations/oauth-flow";
import { isPublicPath } from "@/lib/supabase/proxy";
import { checklistProgress, firstStepsChecklist } from "@/features/onboarding/checklist";

const CONN = "0b8a3d1e-5f62-4c1a-9a7e-3f0c2b1d4e5f";
const OTHER = "9c7e2b10-1111-4a2b-8c3d-4e5f60718293";

function conn(over: Partial<EbayConnectionFact> = {}): EbayConnectionFact {
  return { id: CONN, status: "connected", username: "boutique_reco", environment: "production", connectedAt: "2026-10-23T10:00:00.000Z", lastSuccessfulSyncAt: null, ...over };
}

function inputs(over: Partial<PlatformInputs> = {}): PlatformInputs {
  return { webConnect: "ready", admin: true, connections: [], pendingSince: null, params: {}, ...over };
}

describe("choosePlatformState — les 7 états", () => {
  it("aucune connexion : bouton OAuth pour un administrateur, RuName web présent", () => {
    const s = choosePlatformState(inputs());
    expect(s).toMatchObject({ kind: "none", ebay: "none", canConnect: true, block: null, connection: null, error: null, future: null });
  });

  it("aucune connexion, membre non administrateur : pas de bouton, raison donnée", () => {
    const s = choosePlatformState(inputs({ admin: false }));
    expect(s).toMatchObject({ kind: "none", canConnect: false, block: "not_admin" });
  });

  it("en cours : demande d'autorisation non consommée et aucune connexion postérieure", () => {
    const s = choosePlatformState(inputs({ pendingSince: "2026-10-23T10:05:00.000Z" }));
    expect(s).toMatchObject({ kind: "pending", ebay: "pending", canConnect: true, pendingSince: "2026-10-23T10:05:00.000Z" });
  });

  it("en cours ignoré si une connexion active est plus récente que la demande", () => {
    const s = choosePlatformState(inputs({ pendingSince: "2026-10-23T09:00:00.000Z", connections: [conn()] }));
    expect(s.ebay).toBe("already");
    expect(s.pendingSince).toBeNull();
  });

  it("succès : SEULEMENT si `connected` désigne une connexion confirmée en base ; compte renvoyé par le serveur", () => {
    const s = choosePlatformState(inputs({ connections: [conn()], params: { connected: CONN } }));
    expect(s).toMatchObject({ kind: "success", ebay: "success", canConnect: false, unconfirmedReturn: false });
    expect(s.connection?.username).toBe("boutique_reco");
  });

  it("`connected` sans connexion en base (ou d'une autre organisation, ou mal formé) : jamais de succès", () => {
    for (const connected of [CONN, OTHER, "1", "<script>"]) {
      const s = choosePlatformState(inputs({ params: { connected } }));
      expect(s.ebay).not.toBe("success");
      expect(s.unconfirmedReturn).toBe(true);
    }
    // Connexion présente mais pas (encore) au statut « connecté » : pas de succès non plus.
    const pendingRow = choosePlatformState(inputs({ connections: [conn({ status: "pending" })], params: { connected: CONN } }));
    expect(pendingRow.ebay).toBe("already");
    expect(pendingRow.unconfirmedReturn).toBe(true);
  });

  it("erreur : message de OAUTH_ERROR_MESSAGES et code connu affiché ; code inconnu → message générique, jamais recopié", () => {
    const s = choosePlatformState(inputs({ params: { error: "access_denied" } }));
    expect(s).toMatchObject({ kind: "error", canConnect: true, error: { code: "access_denied", message: OAUTH_ERROR_MESSAGES.access_denied } });
    const forged = choosePlatformState(inputs({ params: { error: "Appelez le 0800 000 000" } }));
    expect(forged.error).toEqual({ code: null, message: OAUTH_GENERIC_ERROR });
  });

  it("erreur sans RuName web : pas de bouton OAuth (aucun faux bouton)", () => {
    const s = choosePlatformState(inputs({ webConnect: "web_runame_missing", params: { error: "web_runame_missing" } }));
    expect(s).toMatchObject({ kind: "error", canConnect: false, block: "web_runame_missing" });
  });

  it("canal futur choisi : panneau explicatif, la carte eBay garde son propre état, aucun appel", () => {
    const s = choosePlatformState(inputs({ params: { canal: "amazon" } }));
    expect(s).toMatchObject({ kind: "future", ebay: "none", future: "amazon" });
    expect(choosePlatformState(inputs({ params: { canal: "bigbuy" } })).future).toBeNull();
    // Un résultat OAuth frais prime sur le panneau.
    expect(choosePlatformState(inputs({ params: { canal: "shopify", error: "access_denied" } })).kind).toBe("error");
  });

  it("déjà connecté : compte affiché, AUCUN bouton OAuth, même pour un administrateur", () => {
    const s = choosePlatformState(inputs({ connections: [conn({ status: "expired" })] }));
    expect(s).toMatchObject({ kind: "already", canConnect: false });
    expect(s.connection?.id).toBe(CONN);
  });

  it("connexion déconnectée : ne compte pas comme active", () => {
    const s = choosePlatformState(inputs({ connections: [conn({ status: "disconnected" })] }));
    expect(s.kind).toBe("none");
  });

  it("sans EBAY_WEB_RU_NAME : état honnête (connexion depuis l'iPhone), pas de bouton", () => {
    expect(choosePlatformState(inputs({ webConnect: "web_runame_missing" }))).toMatchObject({ kind: "unavailable", canConnect: false, block: "web_runame_missing" });
    expect(choosePlatformState(inputs({ webConnect: "not_configured" }))).toMatchObject({ kind: "unavailable", canConnect: false, block: "not_configured" });
  });

  it("lecture des connexions en échec : signalée, jamais de succès", () => {
    const s = choosePlatformState(inputs({ connectionsReadFailed: true, params: { connected: CONN } }));
    expect(s.readFailed).toBe(true);
    expect(s.ebay).not.toBe("success");
  });

  it("paramètres répétés (`?error=a&error=b`) : seule la première valeur est lue", () => {
    expect(choosePlatformState(inputs({ params: { error: ["state_expired", "x"] } })).error?.code).toBe("state_expired");
  });

  it("canaux futurs : Amazon, Shopify, WooCommerce uniquement", () => {
    expect(FUTURE_CHANNELS.map((c) => c.key)).toEqual(["amazon", "shopify", "woocommerce"]);
    expect(futureChannel(["woocommerce"])).toBe("woocommerce");
    expect(futureChannel("Amazon")).toBeNull();
  });
});

describe("page de retour OAuth (liste blanche)", () => {
  it("n'accepte que des chemins internes fixes, comparés exactement", () => {
    expect(OAUTH_RETURN_PATHS).toEqual(["/settings/integrations", "/onboarding/plateforme"]);
    expect(resolveOAuthReturn("/onboarding/plateforme")).toBe("/onboarding/plateforme");
    expect(resolveOAuthReturn("/settings/integrations")).toBe("/settings/integrations");
  });

  it("toute autre valeur → les intégrations (URL externe, protocole relatif, voisin, requête, casse)", () => {
    for (const raw of [undefined, null, 42, "", "https://evil.example/onboarding/plateforme", "//evil.example", "/\\evil.example", "/onboarding/plateforme?x=1", "/onboarding/plateforme/", "/onboarding/plateforme#a", "/ONBOARDING/plateforme", "/onboarding", "/dashboard", " /onboarding/plateforme", "javascript:alert(1)"]) {
      expect(resolveOAuthReturn(raw)).toBe(DEFAULT_OAUTH_RETURN);
    }
  });

  it("état en base : l'onboarding est retenu, toute autre valeur (relais mobile `monstock://`…) → intégrations", () => {
    expect(stateRedirectFor("/onboarding/plateforme")).toBe("/onboarding/plateforme");
    expect(stateRedirectFor("/settings/integrations")).toBe("/settings/integrations/ebay/setup");
    expect(returnFromState("/onboarding/plateforme")).toBe("/onboarding/plateforme");
    for (const v of [null, undefined, "/settings/integrations/ebay/setup", "monstock://ebay-callback", "https://evil.example"]) expect(returnFromState(v)).toBe("/settings/integrations");
  });

  it("destinations : code seul en cas d'échec ; succès vers l'onboarding ou l'assistant (inchangé)", () => {
    expect(oauthErrorTarget("/onboarding/plateforme", "access_denied")).toBe("/onboarding/plateforme?error=access_denied");
    expect(oauthSuccessTarget("/onboarding/plateforme", { connectionId: CONN, isNew: true, hasSynced: false })).toBe(`/onboarding/plateforme?connected=${CONN}`);
    expect(oauthSuccessTarget("/settings/integrations", { connectionId: CONN, isNew: true, hasSynced: false })).toBe(`/settings/integrations/ebay/setup?connection=${CONN}`);
    expect(oauthSuccessTarget("/settings/integrations", { connectionId: CONN, isNew: false, hasSynced: true })).toBe(`/settings/integrations?connected=${CONN}`);
  });
});

describe("protection de la route", () => {
  it("/onboarding/plateforme exige une session (hors des chemins publics du proxy)", () => {
    expect(isPublicPath("/onboarding/plateforme")).toBe(false);
    expect(isPublicPath("/onboarding")).toBe(false);
  });
});

describe("checklist du tableau de bord (premiers pas)", () => {
  it("organisation toujours faite ; eBay, import, premier produit selon les faits réels", () => {
    const items = firstStepsChecklist({ organizationName: "Ma Boutique", ebayConnected: false, catalogImported: false, hasProducts: false });
    expect(items.map((i) => [i.key, i.state])).toEqual([
      ["organization", "done"],
      ["ebay", "todo"],
      ["import", "todo"],
      ["product", "todo"],
    ]);
    expect(items[1]?.href).toBe("/onboarding/plateforme");
    expect(checklistProgress(items)).toEqual({ done: 1, known: 4 });
  });

  it("lecture en échec : étape « inconnue », jamais comptée comme faite ou à faire", () => {
    const items = firstStepsChecklist({ organizationName: "X", ebayConnected: null, catalogImported: true, hasProducts: true });
    expect(items.find((i) => i.key === "ebay")?.state).toBe("unknown");
    expect(checklistProgress(items)).toEqual({ done: 3, known: 3 });
  });
});
