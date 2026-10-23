// @vitest-environment happy-dom
/**
 * Parcours v2 (handoff §D) : formulaire d'inscription.
 * - erreurs du SERVEUR (`signUpAction`) annoncées (`role=alert`) et champs `aria-invalid` reliés ;
 * - jauge de robustesse INDICATIVE : elle suit la saisie mais ne bloque rien (seule règle : 8 caractères,
 *   portée par `minLength` et par le serveur) ;
 * - afficher / masquer le mot de passe ; confirmation par e-mail inchangée.
 */
import "./setup-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  signUp: vi.fn(),
}));
vi.mock("@/features/auth/actions", () => ({
  signUpAction: actions.signUp,
  signInAction: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  updatePasswordAction: vi.fn(),
}));

const { SignupForm } = await import("@/features/auth/components");
const { passwordStrength } = await import("@/features/auth/password-strength");

beforeEach(() => {
  actions.signUp.mockReset();
});

async function fill(password: string) {
  await userEvent.type(screen.getByLabelText("Nom complet"), "Camille Martin");
  await userEvent.type(screen.getByLabelText("E-mail"), "camille@exemple.fr");
  await userEvent.type(screen.getByLabelText("Mot de passe"), password);
}

describe("SignupForm", () => {
  it("jauge indicative : suit la saisie, n'ajoute aucune contrainte, le bouton reste actif", async () => {
    render(<SignupForm />);
    const pwd = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "Créer mon compte" });
    await userEvent.type(pwd, "abc");
    expect(screen.getByText(/Trop court : 3 \/ 8 caractères/)).toBeTruthy();
    expect(submit).toHaveProperty("disabled", false);
    // Seule règle réelle : 8 caractères (aucun motif imposé, aucune longueur supplémentaire).
    expect(pwd.minLength).toBe(8);
    expect(pwd.getAttribute("pattern")).toBeNull();
    await userEvent.type(pwd, "defgh");
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(submit).toHaveProperty("disabled", false);
    // La jauge est reliée au champ (aria-describedby) mais ne le marque jamais invalide.
    expect(pwd.getAttribute("aria-describedby")).toContain("password-strength");
    expect(pwd.getAttribute("aria-invalid")).toBeNull();
  });

  it("8 caractères suffisent à l'envoi, même avec une jauge « Correct »", async () => {
    actions.signUp.mockResolvedValue({ ok: true, data: { needsConfirmation: true } });
    render(<SignupForm />);
    await fill("abcdefgh");
    await userEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
    await waitFor(() => expect(actions.signUp).toHaveBeenCalledTimes(1));
    const fd = actions.signUp.mock.calls[0]![1] as FormData;
    expect(fd.get("password")).toBe("abcdefgh");
    expect(fd.get("full_name")).toBe("Camille Martin");
    // Confirmation par e-mail : écran inchangé dans son principe.
    expect(await screen.findByText("Vérifiez votre boîte mail")).toBeTruthy();
  });

  it("erreur du serveur : message annoncé (role=alert), champ en erreur aria-invalid et relié à son message", async () => {
    actions.signUp.mockResolvedValue({ ok: false, error: "Vérifiez les champs du formulaire.", fieldErrors: { email: ["Adresse email invalide."] } });
    render(<SignupForm next="/invite/abc" />);
    await fill("unMotDePasse!2026");
    await userEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Vérifiez les champs du formulaire."), expect.stringContaining("Adresse email invalide.")]));
    const email = screen.getByLabelText("E-mail");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(email.getAttribute("aria-describedby")!)?.textContent).toContain("Adresse email invalide.");
    expect(screen.getByLabelText("Nom complet").getAttribute("aria-invalid")).toBeNull();
    // `next` transmis tel quel à l'action (le serveur le valide).
    expect((actions.signUp.mock.calls[0]![1] as FormData).get("next")).toBe("/invite/abc");
  });

  it("afficher / masquer le mot de passe", async () => {
    render(<SignupForm />);
    const pwd = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    await userEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(pwd.type).toBe("text");
    await userEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(pwd.type).toBe("password");
  });
});

describe("passwordStrength (indicatif)", () => {
  it("échelle 0–4, règle réelle = 8 caractères", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("1234567")).toMatchObject({ score: 1, meetsRule: false });
    expect(passwordStrength("12345678")).toMatchObject({ score: 2, meetsRule: true });
    expect(passwordStrength("abcdefghijkl")).toMatchObject({ score: 3 });
    expect(passwordStrength("Abcdefgh1!xy")).toMatchObject({ score: 4, label: "Robuste" });
  });
});
