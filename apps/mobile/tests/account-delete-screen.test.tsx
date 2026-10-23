/**
 * M-01 : écran « Supprimer mon compte » — explication, confirmation saisie, chargement, erreur
 * lisible, puis déconnexion et purge locale SEULEMENT après la confirmation du serveur.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "~/components/ui";
import { UserFacingError } from "~/lib/errors";
import AccountDeleteScreen from "~/app/account-delete";

const mockReplace = jest.fn();
const mockDelete = jest.fn();
const mockPurge = jest.fn(async () => undefined);
let mockOnline = true;
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true, push: jest.fn() }, Redirect: () => null }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock("~/auth/session-provider", () => ({ useSession: () => ({ status: "signedIn" }), useUser: () => ({ id: "u1", email: "alice@example.com" }) }));
jest.mock("~/org/org-provider", () => ({ useOrg: () => ({ status: "ready", memberships: [{ role: "owner", organization: { id: "o1", name: "Atelier" } }] }) }));
jest.mock("~/data/account", () => ({ deleteMyAccount: (...a: unknown[]) => mockDelete(...a) }));
jest.mock("~/auth/sign-out", () => ({ signOutAndPurge: (...a: unknown[]) => mockPurge(...(a as [])) }));
jest.mock("~/lib/use-online", () => ({ useOnline: () => mockOnline }));

function renderScreen() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ToastProvider>
          <AccountDeleteScreen />
        </ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockDelete.mockReset();
  mockPurge.mockClear();
  mockOnline = true;
});

it("explique ce qui est supprimé ; bouton inactif tant que SUPPRIMER n'est pas saisi ; succès → purge puis connexion", async () => {
  mockDelete.mockResolvedValue({ deleted: true, organizationsDeleted: 1, organizationsLeft: 0, channelConnectionsDisconnected: 0, remoteRevocationIncomplete: false });
  renderScreen();
  expect(screen.getByText(/Chaque organisation dont vous êtes le seul membre/)).toBeTruthy();
  expect(screen.getByText(/Atelier · Propriétaire/)).toBeTruthy();
  expect(screen.getByTestId("account-delete-submit").props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByTestId("account-delete-submit"));
  expect(mockDelete).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId("account-delete-confirmation"), "SUPPRIMER");
  fireEvent.press(screen.getByTestId("account-delete-submit"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(mockDelete).toHaveBeenCalledWith("SUPPRIMER");
  expect(mockPurge).toHaveBeenCalledWith(expect.anything(), { userId: "u1", forget: true });
  expect(mockDelete.mock.invocationCallOrder[0]!).toBeLessThan(mockPurge.mock.invocationCallOrder[0]!);
});

it("refus du serveur : erreur lisible, rien n'est purgé, l'utilisateur reste connecté", async () => {
  mockDelete.mockRejectedValue(new UserFacingError("Suppression impossible : vous êtes le seul propriétaire de « Équipe ».", "CONFLICT"));
  renderScreen();
  fireEvent.changeText(screen.getByTestId("account-delete-confirmation"), "SUPPRIMER");
  fireEvent.press(screen.getByTestId("account-delete-submit"));
  await waitFor(() => expect(screen.getByTestId("account-delete-error")).toBeTruthy());
  expect(screen.getByText(/seul propriétaire de « Équipe »/)).toBeTruthy();
  expect(mockPurge).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it("hors ligne : suppression impossible, explication affichée", () => {
  mockOnline = false;
  renderScreen();
  fireEvent.changeText(screen.getByTestId("account-delete-confirmation"), "SUPPRIMER");
  expect(screen.getByText(/Hors ligne/)).toBeTruthy();
  expect(screen.getByTestId("account-delete-submit").props.accessibilityState).toMatchObject({ disabled: true });
});
