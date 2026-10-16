import { fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Accueil « centre de pilotage » et sourcing : tâches actionnables, valeur du stock, compteurs de la
 * bibliothèque et filtre d'origine. Uniquement des données fournies (aucun chiffre supposé).
 */
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}) }));
jest.mock("~/lib/api", () => ({ callApi: jest.fn() }));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: true } }) }));

const NOW = new Date("2026-10-16T09:00:00Z");
const counts = { read: 100, valid: 90, created: 10, updated: 70, unchanged: 10, duplicates: 2, invalid: 6, rejected: 0, unrecognized: 2, expired: 0 };
const job = (over: Record<string, unknown>) => ({ id: "j", supplierId: "s1", supplierName: "Foxway", sourceId: null, origin: "file", fileName: "stock.xlsx", fileSize: 1, format: "xlsx", mode: "snapshot", status: "completed", counts, truncated: false, message: null, createdBy: null, startedAt: "2026-10-15T08:00:00Z", finishedAt: null, ...over });

const sku = (qty: number, cost: number | null, stockValue: number | null) => ({ row: { quantity_available: qty, cost_price: cost, stock_value: stockValue } });

describe("buildTasks", () => {
  it("classe les tâches par gravité et mène chacune à sa résolution", () => {
    const { buildTasks } = jest.requireActual("~/components/dashboard");
    const tasks = buildTasks({
      now: NOW,
      today: { toShip: 2, pendingSales: 1 },
      catalog: { counts: { all: 10, out: 1, low: 3, unlisted: 0 } },
      jobs: [job({ id: "j-fail", supplierId: "s2", supplierName: "Mobilax", status: "failed", message: "Aucune colonne de prix" }), job({ id: "j-part", status: "partial" })],
      accounts: { accounts: [{ key: "bigbuy", name: "BigBuy", status: "error", lastError: "HTTP 401" }], publicSources: [], totals: { account: 0, public: 0, marketplace: 0 } },
      alerts: [],
    });
    expect(tasks.map((t: { key: string }) => t.key)).toEqual(["job-j-fail", "acc-bigbuy", "out", "ship", "job-j-part", "low", "pending"]);
    expect(tasks[0].title).toBe("Import échoué · Mobilax");
    expect(tasks[0].cta).toBe("Rapport");
    tasks[0].go();
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith({ pathname: "/sourcing-imports/[id]", params: { id: "j-fail" } });
    expect(tasks.find((t: { key: string }) => t.key === "job-j-part").detail).toBe("8 lignes ignorées sur 100");
  });

  it("un échec corrigé par un import plus récent du même fournisseur n'est plus à traiter ; les vieux imports sont ignorés", () => {
    const { buildTasks } = jest.requireActual("~/components/dashboard");
    const tasks = buildTasks({ now: NOW, jobs: [job({ id: "old-fail", status: "failed", startedAt: "2026-10-14T08:00:00Z" }), job({ id: "fixed", status: "completed", startedAt: "2026-10-15T08:00:00Z" }), job({ id: "ancient", supplierId: "s9", status: "failed", startedAt: "2026-09-01T08:00:00Z" })] });
    expect(tasks).toEqual([]);
  });
});

describe("stockSummary", () => {
  it("valorise au coût connu et signale les SKU sans coût (jamais supposé)", () => {
    const { stockSummary } = jest.requireActual("~/data/catalog");
    const s = stockSummary({ products: [{ skus: [sku(2, 100, 200), sku(3, 50, null), sku(4, null, null), sku(0, null, null)] }] });
    expect(s).toEqual({ value: 350, skusWithoutCost: 1, skus: 4, units: 9 });
  });
});

describe("bibliothèque et sourcing", () => {
  const entry = (key: string, status: string, methods: string[], pro: boolean | null = null, integrationStatus = "file_import") => ({ key, proAccountRequired: pro, org: { status }, registry: { accessMethods: methods, integrationStatus } });

  it("compteurs réels : connecté sur preuve, connectables hors connectés et écartés", () => {
    const { libraryStats } = jest.requireActual("~/app/(app)/supplier-directory/index");
    const s = libraryStats(
      [entry("a", "connected", ["official_api"], true), entry("b", "not_connected", ["manual_import"], true), entry("c", "error", ["catalog_feed"]), entry("d", "not_connected", ["not_automatable"]), entry("e", "not_connected", ["manual_import"], null, "abandoned")],
      new Set(["a", "zz"]),
    );
    expect(s).toEqual({ total: 5, connected: 1, connectable: 2, pro: 2, errors: 1, favorites: 1 });
  });

  it("filtre d'origine des prix", () => {
    const { byOrigin } = jest.requireActual("~/app/(app)/(tabs)/sourcing");
    const offers = [{ id: "1", access: "account" }, { id: "2", access: "public" }, { id: "3" }, { id: "4", access: "marketplace" }];
    expect(byOrigin(offers, "all")).toHaveLength(4);
    expect(byOrigin(offers, "public").map((o: { id: string }) => o.id)).toEqual(["2", "3"]);
    expect(byOrigin(offers, "account").map((o: { id: string }) => o.id)).toEqual(["1"]);
  });
});

describe("rendu", () => {
  function wrap(node: React.ReactElement) {
    const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
    return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>{node}</SafeAreaProvider>;
  }

  it("aucune tâche : état « Tout est à jour », pas de liste vide", () => {
    const { TaskList } = jest.requireActual("~/components/dashboard");
    render(wrap(<TaskList tasks={[]} />));
    expect(screen.getByText("Tout est à jour")).toBeTruthy();
  });

  it("scène du stock : valeur partielle marquée « ≈ », part des ventes en rupture ; un appui ouvre le filtre des ruptures", () => {
    const { TodayStage } = jest.requireActual("~/components/dashboard");
    const view = (qty: number, units: number, level = "normal") => ({ row: { sku_id: `s${qty}${units}`, quantity_available: qty, units_30d: units }, classification: { level } });
    const catalog = { products: [{ productId: "p", skus: [view(0, 3), view(5, 9), view(1, 0, "low")] }], truncated: false, counts: { all: 3, out: 1, low: 1, unlisted: 0 } };
    render(wrap(<TodayStage today={undefined} catalog={catalog} summary={{ value: 350, skusWithoutCost: 1, skus: 3, units: 6 }} currency="EUR" onAnalysis={() => {}} />));
    expect(screen.getByLabelText(/^Valeur du stock au coût : ≈ 350/)).toBeTruthy();
    // 3 ventes sur 12 portent sur la référence en rupture
    expect(screen.getByText(/^25 % de vos ventes sur 30 jours/)).toBeTruthy();
    expect(screen.getByLabelText(/Stock : 3 références, 1 en rupture représentant 25 % des ventes/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("pulse-out"));
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith({ pathname: "/stock", params: { filter: "out" } });
  });

  it("à faire maintenant : la rupture qui coûte le plus et sa meilleure offre rapprochée ; masquée sans offre", () => {
    const { pickPriority } = jest.requireActual("~/components/dashboard");
    const restock = (skuId: string, qty: number, units: number, price: number | null, offer: string | null) => ({ skuId, code: skuId, name: skuId, quantityAvailable: qty, units30d: units, daysOfCover: null, bestOfferId: offer, bestPrice: price, bestSupplier: "Foxway" });
    expect(pickPriority({ items: [], restock: [restock("a", 0, 3, null, null)] })).toBeNull();
    const pick = pickPriority({ items: [], restock: [restock("low", 2, 50, 300, "o1"), restock("a", 0, 2, 100, "o2"), restock("b", 0, 7, 199, "o3")] });
    expect(pick.restock.skuId).toBe("b");
  });

  it("à traiter : 5 lignes visibles, puis « N autres points »", () => {
    const { TaskList } = jest.requireActual("~/components/dashboard");
    const { CheckCircle2 } = jest.requireActual("lucide-react-native");
    const tasks = Array.from({ length: 7 }, (_, i) => ({ key: `t${i}`, icon: CheckCircle2, tone: "neutral", title: `Tâche ${i}`, cta: "Voir", go: () => {}, rank: i }));
    render(wrap(<TaskList tasks={tasks} />));
    expect(screen.queryByText("Tâche 6")).toBeNull();
    fireEvent.press(screen.getByText("2 autres points"));
    expect(screen.getByText("Tâche 6")).toBeTruthy();
  });

  it("configuration guidée : seules les étapes réellement manquantes, progression affichée", () => {
    const { SetupChecklist } = jest.requireActual("~/components/dashboard");
    render(wrap(<SetupChecklist hasProducts hasChannel={false} hasSupplier hasCosts={null} />));
    expect(screen.getByText("Connecter eBay")).toBeTruthy();
    expect(screen.queryByText("Ajouter vos produits")).toBeNull();
    expect(screen.queryByText("Régler vos coûts")).toBeNull();
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();
  });
});
