// @vitest-environment happy-dom
/**
 * W-16 : section « Supprimer mon compte » (Q-04 / M-01) — la suppression exige la saisie du mot de
 * confirmation ; rien n'est envoyé avant ; le succès ne s'affiche qu'après la réponse du serveur ; un
 * refus du serveur reste affiché dans la boîte de dialogue.
 */
import "./setup-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionResult } from "@/lib/result";
import type { AccountDeletionResultDTO } from "@/features/mobile-api/contract";

const server = vi.hoisted(() => ({
  calls: [] as string[],
  reply: null as null | ActionResult<AccountDeletionResultDTO>,
}));

vi.mock("@/features/account/actions", () => ({
  deleteMyAccountAction: async (_prev: unknown, formData: FormData) => {
    server.calls.push(String(formData.get("confirmation")));
    return server.reply;
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { DeleteAccountSection } = await import("@/app/(app)/settings/account/delete-account-section");
const { ACCOUNT_DELETE_CONFIRMATION } = await import("@/features/mobile-api/contract");

// happy-dom : <dialog> natif pris en charge ; repli défensif si showModal manquait.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}

const ORGS = [
  { name: "Atelier Martin", roleLabel: "Propriétaire", isDemo: false },
  { name: "Démo", roleLabel: "Propriétaire", isDemo: true },
];

async function openDialog() {
  const user = userEvent.setup();
  render(<DeleteAccountSection email="vous@exemple.test" organizations={ORGS} />);
  await user.click(screen.getByRole("button", { name: /Supprimer mon compte/ }));
  const confirm = await screen.findByRole("button", { name: "Supprimer définitivement", hidden: true });
  const input = screen.getByLabelText(/pour confirmer/, { selector: "input" });
  return { user, confirm, input };
}

beforeEach(() => {
  server.calls = [];
  server.reply = null;
});

describe("DeleteAccountSection", () => {
  it("affiche l'avertissement et l'adresse du compte ; aucune boîte de dialogue au départ", () => {
    render(<DeleteAccountSection email="vous@exemple.test" organizations={ORGS} />);
    expect(screen.getByText("vous@exemple.test")).toBeTruthy();
    expect(screen.getByText(/ne peut pas être annulée/)).toBeTruthy();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("bouton définitif désactivé tant que le mot exact n'est pas saisi ; rien n'est envoyé", async () => {
    const { user, confirm, input } = await openDialog();
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(screen.getByText("Atelier Martin")).toBeTruthy();
    expect(confirm).toHaveProperty("disabled", true);
    expect(confirm.getAttribute("title")).toContain(ACCOUNT_DELETE_CONFIRMATION);
    await user.type(input, "supprime");
    expect(confirm).toHaveProperty("disabled", true);
    await user.click(confirm);
    expect(server.calls).toEqual([]);
  });

  it("mot saisi : envoi au serveur ; succès affiché seulement après sa réponse", async () => {
    server.reply = { ok: true, data: { deleted: true, organizationsDeleted: 1, organizationsLeft: 1, channelConnectionsDisconnected: 0, remoteRevocationIncomplete: false } };
    const { user, confirm, input } = await openDialog();
    expect(screen.queryByText("Votre compte a été supprimé")).toBeNull();
    await user.type(input, ACCOUNT_DELETE_CONFIRMATION);
    expect(confirm).toHaveProperty("disabled", false);
    await user.click(confirm);
    await waitFor(() => expect(screen.getByText("Votre compte a été supprimé")).toBeTruthy());
    expect(server.calls).toEqual([ACCOUNT_DELETE_CONFIRMATION]);
    expect(screen.getByRole("status").textContent).toContain("Organisations supprimées avec leurs données : 1");
  });

  it("refus du serveur (seul propriétaire…) : message affiché, compte non présenté comme supprimé", async () => {
    server.reply = { ok: false, error: "Désignez d'abord un autre propriétaire pour « Atelier Martin »." };
    const { user, confirm, input } = await openDialog();
    await user.type(input, ACCOUNT_DELETE_CONFIRMATION);
    await user.click(confirm);
    await waitFor(() => expect(screen.getByRole("alert", { hidden: true }).textContent).toContain("Désignez d'abord un autre propriétaire pour « Atelier Martin »."));
    expect(server.calls).toEqual([ACCOUNT_DELETE_CONFIRMATION]);
    expect(screen.queryByText("Votre compte a été supprimé")).toBeNull();
  });
});
