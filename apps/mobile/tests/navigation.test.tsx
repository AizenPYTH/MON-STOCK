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
import TabsLayout from "~/app/(app)/(tabs)/_layout";
import Index from "~/app/index";

const routes = {
  index: Index,
  "(auth)/_layout": AuthLayout,
  "(auth)/login": () => <Text>Écran de connexion</Text>,
  "(app)/_layout": AppLayout,
  "(app)/(tabs)/_layout": TabsLayout,
  "(app)/(tabs)/intelligence": () => <Text>Aujourd'hui (écran)</Text>,
  "(app)/(tabs)/stock": () => <Text>Stock (écran)</Text>,
  "(app)/(tabs)/sales": () => <Text>Ventes (écran)</Text>,
  "(app)/(tabs)/sourcing": () => <Text>Sourcing (écran)</Text>,
  "(app)/settings": () => <Text>Réglages (écran)</Text>,
  "(app)/adjust": () => <Text>Ajuster (écran)</Text>,
};

const ready = (role = "member") => ({
  status: "ready",
  active: { role, organization: { id: "o1", name: "Org", currency: "EUR" } },
  permissions: { canWrite: role !== "viewer", isAdmin: false },
  memberships: [],
});

describe("navigation protégée", () => {
  it("sans session : toute page de l'application renvoie vers la connexion", async () => {
    mockSessionState.current = { status: "signedOut", session: null };
    const r = renderRouter(routes, { initialUrl: "/stock" });
    expect(await screen.findByText("Écran de connexion")).toBeTruthy();
    expect(r.getPathname()).toBe("/login");
  });

  it("session sans organisation : écran de création d'organisation", async () => {
    mockSessionState.current = { status: "signedIn", session: { user: { id: "u1" } } };
    mockOrgState.current = { status: "none", refresh: jest.fn() };
    renderRouter(routes, { initialUrl: "/stock" });
    expect(await screen.findByText("Créer votre organisation")).toBeTruthy();
  });

  it("l'application s'ouvre sur Intelligence › Aujourd'hui, avec 4 onglets", async () => {
    mockSessionState.current = { status: "signedIn", session: { user: { id: "u1" } } };
    mockOrgState.current = ready();
    const r = renderRouter(routes, { initialUrl: "/" });
    expect(await screen.findByText("Aujourd'hui (écran)")).toBeTruthy();
    expect(r.getPathname()).toBe("/intelligence");
    for (const tab of ["Stock", "Ventes", "Sourcing", "Intelligence"]) expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
    expect(screen.queryByText("Réglages")).toBeNull();
  });

  it("utilisateur connecté sur la page de connexion : renvoyé vers l'application", async () => {
    mockSessionState.current = { status: "signedIn", session: { user: { id: "u1" } } };
    mockOrgState.current = ready("viewer");
    renderRouter(routes, { initialUrl: "/login" });
    expect(await screen.findByText("Aujourd'hui (écran)")).toBeTruthy();
  });
});
