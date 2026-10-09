import { Text } from "react-native";
import { renderRouter, screen } from "expo-router/testing-library";

const mockSessionState: { current: unknown } = { current: { status: "signedOut", session: null } };
const mockOrgState: { current: unknown } = { current: { status: "loading" } };

jest.mock("~/auth/session-provider", () => ({
  useSession: () => mockSessionState.current,
  useUser: () => ((mockSessionState.current as { status: string }).status === "signedIn" ? { id: "u1", email: "a@exemple.fr" } : null),
}));
jest.mock("~/org/org-provider", () => ({ useOrg: () => mockOrgState.current }));
jest.mock("~/features/onboarding", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { OnboardingScreen: () => <T>Créer votre organisation</T> };
});

import AuthLayout from "~/app/(auth)/_layout";
import AppLayout from "~/app/(app)/_layout";
import Index from "~/app/index";

const routes = {
  index: Index,
  "(auth)/_layout": AuthLayout,
  "(auth)/login": () => <Text>Écran de connexion</Text>,
  "(app)/_layout": AppLayout,
  "(app)/dashboard": () => <Text>Tableau de bord</Text>,
  "(app)/stock": () => <Text>Stock</Text>,
  "(app)/sales": () => <Text>Ventes</Text>,
  "(app)/sourcing": () => <Text>Sourcing</Text>,
  "(app)/settings": () => <Text>Réglages</Text>,
};

describe("navigation protégée", () => {
  it("sans session : toute page de l'application renvoie vers la connexion", async () => {
    mockSessionState.current = { status: "signedOut", session: null };
    const r = renderRouter(routes, { initialUrl: "/dashboard" });
    expect(await screen.findByText("Écran de connexion")).toBeTruthy();
    expect(r.getPathname()).toBe("/login");
  });

  it("session sans organisation : écran de création d'organisation", async () => {
    mockSessionState.current = { status: "signedIn", session: { user: { id: "u1" } } };
    mockOrgState.current = { status: "none", refresh: jest.fn() };
    renderRouter(routes, { initialUrl: "/dashboard" });
    expect(await screen.findByText("Créer votre organisation")).toBeTruthy();
  });

  it("session et organisation : le tableau de bord s'affiche avec les onglets", async () => {
    mockSessionState.current = { status: "signedIn", session: { user: { id: "u1" } } };
    mockOrgState.current = { status: "ready", active: { role: "member", organization: { id: "o1", name: "Org", currency: "EUR" } }, permissions: { canWrite: true, isAdmin: false }, memberships: [] };
    renderRouter(routes, { initialUrl: "/" });
    expect(await screen.findByText("Tableau de bord")).toBeTruthy();
    expect(screen.getByLabelText("Tableau de bord")).toBeTruthy();
    expect(screen.getAllByText("Stock").length).toBeGreaterThan(0);
  });

  it("utilisateur connecté sur la page de connexion : renvoyé vers l'application", async () => {
    mockSessionState.current = { status: "signedIn", session: { user: { id: "u1" } } };
    mockOrgState.current = { status: "ready", active: { role: "viewer", organization: { id: "o1", name: "Org", currency: "EUR" } }, permissions: { canWrite: false, isAdmin: false }, memberships: [] };
    renderRouter(routes, { initialUrl: "/login" });
    expect(await screen.findByText("Tableau de bord")).toBeTruthy();
  });
});
