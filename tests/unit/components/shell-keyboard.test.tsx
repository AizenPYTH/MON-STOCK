// @vitest-environment happy-dom
/**
 * W-25 : clavier de la coquille dans un vrai DOM — menu « organisation » (motif menu button) et
 * palette ⌘K (motif combobox). La logique de déplacement elle-même est testée dans keyboard-nav.test.ts.
 */
import "./setup-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ pushed: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => nav.pushed.push(href), replace: () => {}, prefetch: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/dashboard",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/organizations/actions", () => ({ switchOrganizationAction: async () => {} }));

const { OrgSwitcher } = await import("@/components/layout/org-switcher");
const { CommandPalette } = await import("@/components/layout/command-palette");

const OPTIONS = [
  { id: "o1", name: "Atelier Martin", isDemo: false },
  { id: "o2", name: "Boutique Lyon", isDemo: false },
  { id: "o3", name: "Démo", isDemo: true },
];

beforeEach(() => {
  nav.pushed = [];
});

describe("OrgSwitcher : motif menu button", () => {
  function setup() {
    const user = userEvent.setup();
    render(<OrgSwitcher options={OPTIONS} currentId="o1" roleLabel="Propriétaire" currency="EUR" />);
    const trigger = screen.getByRole("button", { name: /Organisation active : Atelier Martin/ });
    return { user, trigger };
  }
  const items = () => screen.getAllByRole("menuitem");

  it("ouverture au clic : menu nommé, focus sur le premier élément, bouton aria-expanded + aria-controls", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Mes organisations" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(items()).toHaveLength(4);
    expect(document.activeElement).toBe(items()[0]);
  });

  it("↓ ↑ en boucle, Fin / Début, première lettre", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items()[1]);
    await user.keyboard("{End}");
    expect(document.activeElement?.textContent).toContain("Nouvelle organisation");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items()[0]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items()[3]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(items()[0]);
    await user.keyboard("d");
    expect(document.activeElement?.textContent).toContain("Démo");
  });

  it("Échap referme et rend le focus au bouton", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("↑ sur le bouton ouvre sur le dernier élément ; Tab referme", async () => {
    const { user, trigger } = setup();
    trigger.focus();
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toContain("Nouvelle organisation");
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("CommandPalette : motif combobox", () => {
  function setup() {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Recherche";
    document.body.appendChild(opener);
    opener.focus();
    const view = render(<CommandPalette onClose={onClose} readOnly={false} />);
    const input = screen.getByRole("combobox");
    return { user, onClose, input, opener, view };
  }
  const activeOption = (input: HTMLElement) => document.getElementById(input.getAttribute("aria-activedescendant") ?? "");

  it("le champ est un combobox relié à la liste ; le focus y reste ; option active annoncée", () => {
    const { input } = setup();
    expect(document.activeElement).toBe(input);
    const list = screen.getByRole("listbox", { name: "Résultats" });
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const first = activeOption(input);
    expect(first?.getAttribute("role")).toBe("option");
    expect(first?.getAttribute("aria-selected")).toBe("true");
    // Options groupées et nommées par leur en-tête.
    expect(screen.getAllByRole("group").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("group", { name: "Actions" })).toBeTruthy();
  });

  it("↓ déplace l'option active (aria-activedescendant), ↵ ouvre la page choisie", async () => {
    const { user, input, onClose } = setup();
    const first = activeOption(input);
    await user.keyboard("{ArrowDown}");
    const second = activeOption(input);
    expect(second).not.toBe(first);
    expect(second?.getAttribute("aria-selected")).toBe("true");
    expect(first?.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(input);
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalled();
    expect(nav.pushed).toEqual(["/sourcing/imports/new"]);
  });

  it("saisie : recherches proposées en tête, nombre de résultats annoncé", async () => {
    const { user, input } = setup();
    await user.type(input, "iphone");
    expect(activeOption(input)?.textContent).toContain("« iphone » dans le stock");
    expect(screen.getByRole("status").textContent).toMatch(/\d+ résultats?/);
    await user.keyboard("{Enter}");
    expect(nav.pushed).toEqual(["/stock?q=iphone"]);
  });

  it("Échap ferme ; à la fermeture le focus revient à l'élément d'origine", async () => {
    const { user, onClose, opener, view } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    await Promise.resolve();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
