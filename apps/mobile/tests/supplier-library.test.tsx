import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

/**
 * Bibliothèque des fournisseurs et fiche fournisseur : logos officiels embarqués, méthodes d'accès
 * réelles, état de connexion, favoris, filtres, actions cohérentes. Réponses serveur SIMULÉES.
 */
const mockCallApi = jest.fn();
jest.mock("~/lib/api", () => ({ callApi: (...a: unknown[]) => mockCallApi(...a) }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Snowolff", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: true } }) }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => mockParams.current }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.setTimeout(30_000);
beforeEach(() => {
  mockCallApi.mockReset();
  mockParams.current = {};
  jest.requireMock("expo-router").router.push.mockReset();
});

function wrap(node: React.ReactElement) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const email = { fr: { subject: "Demande — Snowolff", body: "Bonjour" }, en: { subject: "Request", body: "Hello" } };
const entry = (over: Record<string, unknown>) => ({
  segment: "A_refurb", country: "EE", deliveryZones: ["EU"], website: "https://www.foxway.com", catalogUrl: null, apiDocsUrl: null, categories: ["smartphones"], brands: ["Apple"], productTypes: ["refurbished"], sales: "B2B", proAccountRequired: true, accessConditions: "Compte revendeur", accessModes: ["pro_portal", "manual_download"], pricesTax: "HT", currency: "EUR", moq: null, shipping: null, warranty: null, partQuality: null, whyUseful: "Gros fournisseur européen.", howToGetCatalog: "Exporter la liste de stock.", researchVerified: "Extraits", verificationLevel: "official_page_snippet", sources: [], researchedAt: "2026-10-15", integration: { kind: "file_import" }, activeInOrg: false, stages: ["identified"], primaryStage: "identified", tier: "identified", nextAction: "…", check: null, email, b2b: null,
  registry: { accessMethods: ["portal_export", "manual_import", "pro_account_first"], integrationStatus: "pro_account_required", priority: { score: 80, tier: "A", reasons: ["Acteur de référence"] }, reliability: "announced", abandonedReason: null, primaryAction: { kind: "get_pro_access", label: "Obtenir l'accès professionnel", outcome: "Ouvrez votre compte revendeur." }, domain: "foxway.com", libraryKey: null },
  org: { status: "not_connected", supplierId: null, connectionId: null, accountOffers: 0, publicOffers: 0, lastSyncAt: null, lastError: null },
  connector: null,
  ...over,
});
const fox = entry({ key: "foxway", name: "Foxway (Reseller Portal / Wholesale)" });
const big = entry({
  key: "bigbuy", name: "BigBuy", country: "ES", segment: "E_specialist", website: "https://www.bigbuy.eu/fr/",
  registry: { accessMethods: ["official_api", "manual_import", "pro_account_first"], integrationStatus: "in_progress", priority: { score: 70, tier: "A", reasons: [] }, reliability: "confirmed", abandonedReason: null, primaryAction: { kind: "sync", label: "Synchroniser mes prix", outcome: "Récupère vos prix." }, domain: "bigbuy.eu", libraryKey: null },
  org: { status: "error", supplierId: "s-big", connectionId: "c-big", accountOffers: 0, publicOffers: 0, lastSyncAt: "2026-10-15T07:00:00Z", lastError: "Clé API refusée (401)." },
  connector: { key: "bigbuy", label: "BigBuy (API)", fields: [{ name: "api_key", label: "Clé API BigBuy", secret: true, placeholder: null }] },
});
const lcd = entry({ key: "lcd-phone", name: "LCD-Phone", country: "FR", segment: "B_parts", website: "https://lcd-phone.com/", registry: { ...fox.registry, domain: "lcd-phone.com", priority: { score: 75, tier: "A", reasons: [] } }, org: { status: "connected", supplierId: "s-lcd", connectionId: null, accountOffers: 42, publicOffers: 0, lastSyncAt: "2026-10-15T08:00:00Z", lastError: null } });
const directory = { entries: [fox, big, lcd], researchDate: "2026-10-15", lastCheckAt: null };

it("bibliothèque : logos officiels, connectés d'abord, filtres, favoris, action cohérente", async () => {
  mockCallApi.mockImplementation((path: string) => Promise.resolve(path === "/sourcing/directory" ? directory : {}));
  const Screen = jest.requireActual("~/app/(app)/supplier-directory/index").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByTestId("library-count")).toBeTruthy(), { timeout: 5000 });
  // logos officiels embarqués (aucun service tiers) : Foxway et BigBuy ; LCD-Phone (pas d'icône exploitable) → initiales
  expect(screen.getAllByTestId("supplier-logo-image", { includeHiddenElements: true }).length).toBe(2);
  expect(screen.getAllByTestId("supplier-logo-initials", { includeHiddenElements: true }).length).toBe(1);
  // tri par pertinence : connecté d'abord, puis en erreur, puis non connecté
  const cards = screen.getAllByTestId(/^library-card-/).map((n) => n.props.testID);
  expect(cards).toEqual(["library-card-lcd-phone", "library-card-bigbuy", "library-card-foxway"]);
  expect(screen.getByText("Connecté")).toBeTruthy();
  expect(screen.getByText("Clé API refusée (401).")).toBeTruthy();
  // vue « Connectés »
  fireEvent.press(screen.getByRole("button", { name: /^Connectés · / }));
  expect(screen.getByTestId("library-count").props.children.join("")).toBe("1 fournisseur");
  fireEvent.press(screen.getByRole("button", { name: "Tous" }));
  // favoris : l'étoile ajoute, la vue Favoris le retrouve
  fireEvent.press(screen.getByLabelText("Ajouter Foxway (Reseller Portal / Wholesale) aux favoris"));
  await waitFor(() => expect(screen.getByLabelText("Retirer Foxway (Reseller Portal / Wholesale) des favoris")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: /^Favoris · / }));
  await waitFor(() => expect(screen.getAllByTestId(/^library-card-/).map((n) => n.props.testID)).toEqual(["library-card-foxway"]));
  fireEvent.press(screen.getByRole("button", { name: "Tous" }));
  // recherche texte
  fireEvent.changeText(screen.getByPlaceholderText("Nom, marque, pays, catégorie…"), "lcd");
  expect(screen.getAllByTestId(/^library-card-/)).toHaveLength(1);
  fireEvent.changeText(screen.getByPlaceholderText("Nom, marque, pays, catégorie…"), "");
  // action principale : compte pro requis → site d'ouverture de compte (jamais une fausse connexion)
  fireEvent.press(screen.getByTestId("library-action-foxway"));
  expect(jest.requireMock("expo-web-browser").openBrowserAsync).toHaveBeenCalledWith("https://www.foxway.com/");
  // ouverture de la fiche
  fireEvent.press(screen.getByTestId("library-card-lcd-phone"));
  expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith({ pathname: "/supplier-directory/[key]", params: { key: "lcd-phone" } });
});

it("bibliothèque : filtres par méthode d'accès et pays", async () => {
  mockCallApi.mockImplementation((path: string) => Promise.resolve(path === "/sourcing/directory" ? directory : {}));
  const Screen = jest.requireActual("~/app/(app)/supplier-directory/index").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByTestId("library-count")).toBeTruthy(), { timeout: 5000 });
  fireEvent.press(screen.getByTestId("library-filters"));
  fireEvent.press(screen.getAllByRole("button", { name: "API officielle intégrée" }).at(-1)!);
  await waitFor(() => expect(screen.getAllByTestId(/^library-card-/).map((n) => n.props.testID)).toEqual(["library-card-bigbuy"]));
  fireEvent.press(screen.getAllByRole("button", { name: "API officielle intégrée" }).at(-1)!);
  fireEvent.press(screen.getByRole("button", { name: /FR$/ }));
  await waitFor(() => expect(screen.getAllByTestId(/^library-card-/).map((n) => n.props.testID)).toEqual(["library-card-lcd-phone"]));
});

it("fiche : identité, méthodes réelles, connexion, produits récupérés, actions", async () => {
  mockParams.current = { key: "lcd-phone" };
  mockCallApi.mockImplementation((path: string) => {
    if (path === "/sourcing/directory") return Promise.resolve(directory);
    if (path === "/sourcing/supplier-offers") return Promise.resolve({ total: 42, offers: [{ id: "o1", title: "Écran iPhone 13 OLED", price: 89, currency: "EUR", priceConverted: 89, taxType: "ht", stock: "in_stock", quantity: 7, url: "https://lcd-phone.com/p/1", seenAt: "2026-10-15T08:00:00Z", access: "account" }] });
    if (path === "/sourcing/imports") return Promise.resolve([{ id: "j1", supplierId: "s-lcd", supplierName: "LCD-Phone", sourceId: "x", origin: "file", fileName: "stock.xlsx", fileSize: 1, format: "xlsx", mode: "snapshot", status: "completed", counts: { read: 50, valid: 45, created: 40, updated: 2, unchanged: 3, duplicates: 1, invalid: 2, rejected: 2, unrecognized: 0, expired: 0 }, truncated: false, message: null, createdBy: null, startedAt: "2026-10-15T08:00:00Z", finishedAt: null }]);
    return Promise.resolve({});
  });
  const Screen = jest.requireActual("~/app/(app)/supplier-directory/[key]").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByText("LCD-Phone")).toBeTruthy());
  expect(screen.getAllByTestId("supplier-logo-initials", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByTestId("entry-connection-facts").props.children.join("")).toMatch(/42 offres de votre compte/);
  expect(await screen.findByText(/Dernier import : .*40 créées, 2 mises à jour, 4 ignorées/)).toBeTruthy();
  await waitFor(() => expect(screen.getByText("Écran iPhone 13 OLED")).toBeTruthy());
  expect(screen.getByText(/Produits récupérés \(42\)/)).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Accès" }));
  expect(screen.getByText("Export depuis l'espace client")).toBeTruthy();
  expect(screen.getByText(/Il faut d'abord VOTRE compte revendeur/)).toBeTruthy();
  expect(screen.getByText(/aucun partenariat/)).toBeTruthy();
});

it("fiche : connexion API (BigBuy en erreur) — synchroniser, déconnecter", async () => {
  mockParams.current = { key: "bigbuy" };
  mockCallApi.mockImplementation((path: string) => {
    if (path === "/sourcing/directory") return Promise.resolve(directory);
    if (path === "/sourcing/supplier-offers") return Promise.resolve({ total: 0, offers: [] });
    if (path === "/sourcing/imports") return Promise.resolve([]);
    if (path === "/sourcing/accounts/sync") return Promise.resolve({ status: "failed", message: "Clé API refusée (401)." });
    if (path === "/sourcing/accounts/disconnect") return Promise.resolve({ message: "Compte déconnecté." });
    return Promise.resolve({});
  });
  const Screen = jest.requireActual("~/app/(app)/supplier-directory/[key]").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByTestId("entry-primary-action")).toBeTruthy());
  expect(screen.getByText(/Dernière erreur : Clé API refusée/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("entry-primary-action"));
  await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith("/sourcing/accounts/sync", expect.objectContaining({ body: { connectionId: "c-big" } })));
  fireEvent.press(screen.getByTestId("entry-disconnect"));
  // confirmation avant l'action destructive
  expect(mockCallApi).not.toHaveBeenCalledWith("/sourcing/accounts/disconnect", expect.anything());
  fireEvent.press(screen.getByTestId("entry-disconnect-confirm"));
  await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith("/sourcing/accounts/disconnect", expect.objectContaining({ body: { connectionId: "c-big" } })));
});

it("rapport d'erreurs d'import : CSV échappé, compatible Excel", () => {
  const { issuesCsv } = jest.requireActual("~/data/sourcing-b2b");
  const csv: string = issuesCsv({ fileName: "a.csv", supplierName: "X", startedAt: "2026-10-15", issues: [{ line: 3, kind: "invalid", reference: "A;1", message: 'Prix "abc" illisible', excerpt: null }] });
  expect(csv.startsWith("﻿ligne;type;reference;message\n")).toBe(true);
  expect(csv).toContain('3;');
  expect(csv).toContain('"A;1";"Prix ""abc"" illisible"');
});

it("écran principal : vos sources avec leur état réel et daté ; erreurs d'abord ; import en échec", async () => {
  const src = (id: string, name: string, status: string, over: Record<string, unknown> = {}) => ({ id, name, supplierId: id, supplierName: name, country: "FR", kind: "file_import", methodLabel: "Liste de stock importée", status, statusLabel: status === "error" ? "Erreur" : "À jour", activeOffers: 12, lastSyncAt: null, lastSuccessfulSyncAt: "2026-10-14T08:00:00Z", nextRunAt: null, lastError: null, consecutiveFailures: 0, frequency: "manual", frequencyLabel: "Manuelle", schedulable: false, canSyncNow: false, primaryAction: "import_file", ...over });
  const failed = { id: "j1", supplierId: "m", supplierName: "Mobilax", sourceId: null, origin: "file", fileName: "m.csv", fileSize: 1, format: "csv", mode: "partial", status: "failed", counts: { read: 0, valid: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, invalid: 0, rejected: 0, unrecognized: 0, expired: 0 }, truncated: false, message: "Aucune colonne de prix", createdBy: null, startedAt: "2026-10-15T08:00:00Z", finishedAt: null };
  mockCallApi.mockImplementation((path: string) =>
    Promise.resolve(path === "/sourcing/sources" ? [src("f", "Foxway", "connected"), src("b", "BigBuy", "error", { methodLabel: "API", lastError: "Clé API refusée (HTTP 401)", consecutiveFailures: 3 })] : path === "/sourcing/imports" ? [failed] : path === "/sourcing/directory" ? directory : {}),
  );
  const Screen = jest.requireActual("~/app/(app)/(tabs)/sourcing").default;
  render(wrap(<Screen />));
  await waitFor(() => expect(screen.getByTestId("sources-list")).toBeTruthy());
  const rows = screen.getAllByLabelText(/^(Foxway|BigBuy), /);
  expect(rows[0]!.props.accessibilityLabel).toMatch(/^BigBuy, API, Erreur/);
  expect(screen.getByText("Clé API refusée (HTTP 401)")).toBeTruthy();
  expect(screen.getByText("3 échecs")).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("hub-failed-imports")).toBeTruthy());
  fireEvent.press(screen.getByTestId("hub-failed-imports"));
  expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith({ pathname: "/sourcing-imports/[id]", params: { id: "j1" } });
  fireEvent.press(rows[0]!);
  expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/sourcing-connections");
});

it("configuration API : étapes, échec affiché sans fermer, succès seulement après confirmation du serveur", async () => {
  let attempt = 0;
  mockCallApi.mockImplementation((path: string) => {
    if (path === "/sourcing/accounts/connect") {
      attempt += 1;
      return Promise.resolve(attempt === 1 ? { connectionId: "c1", ok: false, message: "Clé API refusée (401)." } : { connectionId: "c1", ok: true, message: "Compte BigBuy connecté : 1 250 produits accessibles." });
    }
    return Promise.resolve({});
  });
  const { ConnectApiSheet } = jest.requireActual("~/components/supplier-library");
  const onClose = jest.fn();
  render(wrap(<ConnectApiSheet entry={{ key: "bigbuy", name: "BigBuy", connector: { key: "bigbuy", label: "BigBuy", fields: [{ name: "api_key", label: "Clé API", secret: true, placeholder: null }] } }} onClose={onClose} />));
  expect(screen.getByText("Identifiants de VOTRE compte")).toBeTruthy();
  expect(screen.getByTestId("pro-field-api_key").props.secureTextEntry).toBe(true);
  fireEvent.changeText(screen.getByTestId("pro-field-api_key"), "mauvaise");
  fireEvent.press(screen.getByTestId("pro-connect-submit"));
  expect(await screen.findByText("Le fournisseur a refusé la connexion")).toBeTruthy();
  expect(screen.queryByText("Connexion vérifiée par le serveur")).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId("pro-field-api_key"), "bonne");
  fireEvent.press(screen.getByTestId("pro-connect-submit"));
  expect(await screen.findByText("Connexion vérifiée par le serveur")).toBeTruthy();
  fireEvent.press(screen.getByTestId("pro-connect-done"));
  expect(onClose).toHaveBeenCalled();
});
