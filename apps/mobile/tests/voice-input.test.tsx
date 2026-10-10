import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { VoiceInput } from "~/components/voice-input";

/** Dictée disponible (module natif simulé) : début → résultats provisoires → fin → envoi du texte. */
const mockListeners: Record<string, ((e: unknown) => void)[]> = {};
const mockStart = jest.fn();
const mockStop = jest.fn();
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => true,
    requestPermissionsAsync: () => Promise.resolve({ granted: true }),
    start: (...a: unknown[]) => mockStart(...a),
    stop: () => mockStop(),
    addListener: (event: string, fn: (e: unknown) => void) => {
      (mockListeners[event] ??= []).push(fn);
      return { remove: () => (mockListeners[event] = (mockListeners[event] ?? []).filter((f) => f !== fn)) };
    },
  },
}));
const emit = (event: string, payload: unknown = {}) => act(() => (mockListeners[event] ?? []).forEach((f) => f(payload)));

function Harness({ onSubmit }: { onSubmit: (t: string) => void }) {
  const React = jest.requireActual("react");
  const [v, setV] = React.useState("");
  return <VoiceInput value={v} onChangeText={setV} onSubmit={onSubmit} placeholder="Décrivez le produit…" testID="vi" />;
}

it("dicte en français puis envoie le texte reconnu à la fin de la dictée", async () => {
  const onSubmit = jest.fn();
  render(<Harness onSubmit={onSubmit} />);
  fireEvent.press(screen.getByLabelText("Dicter"));
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ lang: "fr-FR", interimResults: true })));
  emit("start");
  expect(screen.getByLabelText("Arrêter la dictée")).toBeTruthy();
  emit("result", { isFinal: false, results: [{ transcript: "trois iPhone 13" }] });
  expect(screen.getByTestId("vi").props.value).toBe("trois iPhone 13");
  emit("result", { isFinal: false, results: [{ transcript: "trois iPhone 13 128 gigas noir" }] });
  fireEvent.press(screen.getByLabelText("Arrêter la dictée"));
  expect(mockStop).toHaveBeenCalled();
  emit("end");
  expect(onSubmit).toHaveBeenCalledWith("trois iPhone 13 128 gigas noir");
});

it("micro refusé : explication, rien n'est envoyé", async () => {
  const onSubmit = jest.fn();
  render(<Harness onSubmit={onSubmit} />);
  emit("error", { error: "not-allowed" });
  await waitFor(() => expect(screen.getByText(/autorisez-les dans Réglages/)).toBeTruthy());
  expect(onSubmit).not.toHaveBeenCalled();
});
