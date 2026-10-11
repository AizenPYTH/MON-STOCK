import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AdvisorCardDTO, AdvisorStreamEvent } from "@/features/mobile-api/contract";

/**
 * Écran du conseiller (données et voix simulées) : conversation écrite diffusée au fil de l'eau,
 * cartes de résultats, conversation vocale (micro sur appui uniquement, lecture de la réponse,
 * arrêt), permissions refusées, erreurs réseau, confirmations obligatoires des actions.
 */
const mockListeners: Record<string, ((e: unknown) => void)[]> = {};
const mockStart = jest.fn();
const mockStop = jest.fn();
let mockPermission = true;
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => true,
    requestPermissionsAsync: () => Promise.resolve({ granted: mockPermission }),
    start: (...a: unknown[]) => mockStart(...a),
    stop: () => mockStop(),
    addListener: (event: string, fn: (e: unknown) => void) => {
      (mockListeners[event] ??= []).push(fn);
      return { remove: () => (mockListeners[event] = (mockListeners[event] ?? []).filter((f) => f !== fn)) };
    },
  },
}));
const emit = (event: string, payload: unknown = {}) => act(() => (mockListeners[event] ?? []).forEach((f) => f(payload)));

const mockSpeak = jest.fn(async (_t: string, h: { onDone?: () => void }) => {
  h.onDone?.();
  return true;
});
const mockStopSpeaking = jest.fn(async () => undefined);
jest.mock("~/lib/tts", () => ({ ...jest.requireActual("~/lib/tts"), ttsAvailable: () => true, speak: (t: string, h: object) => mockSpeak(t, h as never), stopSpeaking: () => mockStopSpeaking() }));

const mockStream = jest.fn();
const mockConfirm = jest.fn();
const mockCancel = jest.fn();
const mockStatus = jest.fn();
jest.mock("~/data/advisor", () => ({
  ...jest.requireActual("~/data/advisor"),
  streamAdvisorChat: (...a: unknown[]) => mockStream(...a),
  confirmAdvisorAction: (...a: unknown[]) => mockConfirm(...a),
  cancelAdvisorAction: (...a: unknown[]) => mockCancel(...a),
  fetchAdvisorStatus: (...a: unknown[]) => mockStatus(...a),
  fetchConversationMessages: jest.fn(async () => []),
}));
jest.mock("~/org/org-provider", () => ({ useActiveOrg: () => ({ active: { organization: { id: "org-1", name: "Boutique", currency: "EUR" } }, permissions: { canWrite: true } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), setParams: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}) }));
jest.mock("~/lib/supabase", () => ({ requireSupabase: () => ({}) }));
let mockNetListener: ((s: { isConnected: boolean; isInternetReachable: boolean }) => void) | null = null;
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: (fn: never) => ((mockNetListener = fn), () => undefined) }));

jest.setTimeout(30_000);

function wrap(node: React.ReactElement) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
  const { ToastProvider } = jest.requireActual("~/components/ui");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 568 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const kpis: AdvisorCardDTO = { kind: "kpis", title: "Bilan des ventes", subtitle: "cette semaine", rows: [{ label: "Chiffre d'affaires", value: "830,00 €", detail: "+12 % vs semaine précédente", tone: "neutral" }], warnings: ["Prix d'achat inconnu pour 1 ligne."], action: null, text: null };
const actionCard: AdvisorCardDTO = {
  kind: "action",
  title: "Ajustement de stock à confirmer",
  subtitle: "Rien n'est modifié sans votre confirmation.",
  rows: [],
  warnings: [],
  text: null,
  action: { id: "a-1", type: "adjust_stock", status: "pending", summary: "Ajouter 2 unité(s) au stock de iPhone 13 (IP13) : 3 → 5 disponible(s).", amount: null, currency: null, expiresAt: new Date(Date.now() + 600_000).toISOString(), outcome: null },
};

function replyWith(answer: string, cards: AdvisorCardDTO[] = [], sources: string[] = []) {
  return async (_org: string, _req: unknown, onEvent: (e: AdvisorStreamEvent) => void) => {
    onEvent({ type: "conversation", conversationId: "c1" });
    onEvent({ type: "status", label: "Bilan de l'activité" });
    for (const part of answer.match(/.{1,10}/g) ?? []) onEvent({ type: "text", delta: part });
    for (const c of cards) onEvent({ type: "card", card: c });
    const reply = { conversationId: "c1", messageId: "m1", answer, cards, sources, interrupted: false, model: "gpt-5.4-mini" };
    onEvent({ type: "done", reply });
    return reply;
  };
}

beforeEach(() => {
  for (const k of Object.keys(mockListeners)) delete mockListeners[k];
  mockStart.mockReset();
  mockStop.mockReset();
  mockSpeak.mockClear();
  mockStopSpeaking.mockClear();
  mockStream.mockReset();
  mockConfirm.mockReset();
  mockCancel.mockReset();
  mockStatus.mockReset().mockResolvedValue({ configured: true, model: "gpt-5.4-mini", limits: { perUserPerHour: 40, perOrganizationPerDay: 400, maxMessageChars: 2000 } });
  mockPermission = true;
});

const Screen = () => {
  const S = jest.requireActual("~/app/(app)/advisor/index").default;
  return <S />;
};

describe("conversation écrite", () => {
  it("question → réponse diffusée, cartes calculées et données consultées ; aucune lecture vocale", async () => {
    mockStream.mockImplementation(replyWith("Votre chiffre d'affaires est de 830,00 € cette semaine.", [kpis], ["Bilan de l'activité"]));
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("advisor-input"), "Quel est mon CA cette semaine ?");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(screen.getByText("Votre chiffre d'affaires est de 830,00 € cette semaine.")).toBeTruthy());
    expect(mockStream).toHaveBeenCalledWith("org-1", { conversationId: null, message: "Quel est mon CA cette semaine ?", voice: false }, expect.any(Function), expect.objectContaining({ signal: expect.anything() }));
    expect(screen.getByText("Chiffre d'affaires")).toBeTruthy();
    expect(screen.getByText("830,00 €")).toBeTruthy();
    expect(screen.getByText("Prix d'achat inconnu pour 1 ligne.")).toBeTruthy();
    expect(screen.getByText("Données consultées : Bilan de l'activité")).toBeTruthy();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("suggestion → envoyée telle quelle ; la conversation suivante garde le même fil", async () => {
    mockStream.mockImplementation(replyWith("Voici votre bilan."));
    render(wrap(<Screen />));
    fireEvent.press(screen.getByText("Fais-moi un bilan de mon activité ce mois-ci."));
    await waitFor(() => expect(screen.getByText("Voici votre bilan.")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("advisor-input"), "Et le mois dernier ?");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2));
    expect(mockStream.mock.calls[1]![1]).toMatchObject({ conversationId: "c1", message: "Et le mois dernier ?" });
  });

  it("erreur réseau / serveur : message réel affiché, aucune réponse inventée", async () => {
    const { UserFacingError } = jest.requireActual("~/lib/errors");
    mockStream.mockRejectedValueOnce(new UserFacingError("Connexion internet indisponible. Vérifiez votre réseau puis réessayez.", "OFFLINE"));
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("advisor-input"), "bilan");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(screen.getByText(/Connexion internet indisponible/)).toBeTruthy());
  });

  it("hors ligne : aucune requête envoyée", async () => {
    render(wrap(<Screen />));
    act(() => mockNetListener?.({ isConnected: false, isInternetReachable: false }));
    expect(screen.getByText(/Hors ligne : le conseiller est indisponible/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("advisor-input"), "bilan");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(mockStream).not.toHaveBeenCalled());
    act(() => mockNetListener?.({ isConnected: true, isInternetReachable: true }));
  });

  it("serveur sans clé IA : bandeau explicite", async () => {
    mockStatus.mockResolvedValueOnce({ configured: false, model: null, limits: { perUserPerHour: 40, perOrganizationPerDay: 400, maxMessageChars: 2000 } });
    render(wrap(<Screen />));
    await waitFor(() => expect(screen.getByText(/pas encore activé sur le serveur/)).toBeTruthy());
  });
});

describe("conversation vocale", () => {
  it("micro sur appui seulement → transcription → envoi « voice » → réponse lue à voix haute", async () => {
    mockStream.mockImplementation(replyWith("Vous avez vendu 12 téléphones cette semaine."));
    render(wrap(<Screen />));
    expect(mockStart).not.toHaveBeenCalled(); // jamais d'écoute sans appui
    fireEvent.press(screen.getByTestId("advisor-mic"));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ lang: "fr-FR", continuous: false })));
    emit("start");
    expect(screen.getByText("J'écoute…")).toBeTruthy();
    emit("result", { isFinal: true, results: [{ transcript: "Combien de téléphones ai-je vendus cette semaine ?" }] });
    emit("end");
    await waitFor(() => expect(mockSpeak).toHaveBeenCalledWith("Vous avez vendu 12 téléphones cette semaine.", expect.anything()));
    expect(mockStream.mock.calls[0]![1]).toMatchObject({ message: "Combien de téléphones ai-je vendus cette semaine ?", voice: true });
    expect(screen.getByText("Vous avez vendu 12 téléphones cette semaine.")).toBeTruthy();
  });

  it("permission du micro refusée : message clair, aucune écoute", async () => {
    mockPermission = false;
    render(wrap(<Screen />));
    fireEvent.press(screen.getByTestId("advisor-mic"));
    await waitFor(() => expect(screen.getByText(/Micro ou reconnaissance vocale refusés/)).toBeTruthy());
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("interruption : le bouton d'arrêt coupe la lecture et l'écoute", async () => {
    mockSpeak.mockImplementationOnce(async () => true); // lecture en cours (pas de fin)
    mockStream.mockImplementation(replyWith("Réponse longue."));
    render(wrap(<Screen />));
    fireEvent.press(screen.getByTestId("advisor-mic"));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    emit("start");
    emit("result", { isFinal: true, results: [{ transcript: "bilan" }] });
    emit("end");
    await waitFor(() => expect(screen.getByLabelText("Arrêter la lecture")).toBeTruthy());
    fireEvent.press(screen.getByTestId("advisor-stop"));
    expect(mockStopSpeaking).toHaveBeenCalled();
  });

  it("écoute sans parole : rien n'est envoyé, le mode conversation se coupe", async () => {
    render(wrap(<Screen />));
    fireEvent(screen.getByTestId("advisor-conversation-mode"), "valueChange", true);
    fireEvent.press(screen.getByTestId("advisor-mic"));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    emit("start");
    emit("end");
    expect(mockStream).not.toHaveBeenCalled();
    expect(screen.getByTestId("advisor-conversation-mode").props.value).toBe(false);
  });
});

describe("actions : confirmation obligatoire", () => {
  it("action préparée : rien n'est exécuté avant l'appui sur « Confirmer » ; résultat réel affiché", async () => {
    mockStream.mockImplementation(replyWith("J'ai préparé l'ajustement : confirmez-le pour l'appliquer.", [actionCard]));
    mockConfirm.mockResolvedValueOnce({ action: { ...actionCard.action!, status: "executed", outcome: "Stock de IP13 mis à jour : 5 disponible(s)." }, message: "Stock de IP13 mis à jour : 5 disponible(s)." });
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("advisor-input"), "Ajoute 2 IP13 au stock");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(screen.getByText(actionCard.action!.summary)).toBeTruthy());
    expect(screen.getByText("À confirmer")).toBeTruthy();
    expect(mockConfirm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("advisor-confirm-a-1"));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith("org-1", "a-1"));
    await waitFor(() => expect(screen.getByText("Fait")).toBeTruthy());
    expect(screen.getAllByText("Stock de IP13 mis à jour : 5 disponible(s).").length).toBeGreaterThan(0);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it("annuler : l'action n'est jamais exécutée", async () => {
    mockStream.mockImplementation(replyWith("Préparé.", [actionCard]));
    mockCancel.mockResolvedValueOnce({ action: { ...actionCard.action!, status: "cancelled" }, message: "Action annulée : rien n'a été modifié." });
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("advisor-input"), "Ajoute 2 IP13");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(screen.getByTestId("advisor-cancel-a-1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("advisor-cancel-a-1"));
    await waitFor(() => expect(screen.getByText("Action annulée : rien n'a été modifié.")).toBeTruthy());
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("refus serveur (droits) : message affiché, statut inchangé", async () => {
    const { UserFacingError } = jest.requireActual("~/lib/errors");
    mockStream.mockImplementation(replyWith("Préparé.", [actionCard]));
    mockConfirm.mockRejectedValueOnce(new UserFacingError("Votre rôle (lecture seule) ne permet pas d'exécuter cette action.", "FORBIDDEN"));
    render(wrap(<Screen />));
    fireEvent.changeText(screen.getByTestId("advisor-input"), "Ajoute 2 IP13");
    fireEvent.press(screen.getByTestId("advisor-send"));
    await waitFor(() => expect(screen.getByTestId("advisor-confirm-a-1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("advisor-confirm-a-1"));
    await waitFor(() => expect(screen.getByText(/lecture seule/)).toBeTruthy());
    expect(screen.getByText("À confirmer")).toBeTruthy();
  });
});
