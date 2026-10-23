// @vitest-environment happy-dom
/**
 * W-16 : composants du kit — `Button` en attente (`loading`) et `StatusBadge` (statut jamais porté par
 * la seule couleur : icône décorative + texte).
 */
import "./setup-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

describe("Button", () => {
  it("au repos : actif, sans aria-busy, libellé affiché, type button par défaut", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);
    const b = screen.getByRole("button", { name: "Enregistrer" });
    expect(b).toHaveProperty("disabled", false);
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect(b.getAttribute("type")).toBe("button");
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("loading : désactivé, aria-busy, indicateur décoratif, texte d'attente, clic sans effet", async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingText="Enregistrement…" onClick={onClick}>
        Enregistrer
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Enregistrement…" });
    expect(b).toHaveProperty("disabled", true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    const spinner = b.querySelector("svg");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.getAttribute("class")).toContain("animate-spin");
    expect(screen.queryByText("Enregistrer")).toBeNull();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading sans loadingText : le libellé reste (jamais de succès anticipé)", () => {
    render(<Button loading>Synchroniser</Button>);
    expect(screen.getByRole("button", { name: "Synchroniser" }).getAttribute("aria-busy")).toBe("true");
  });

  it("bouton-icône en attente : le nom accessible vient d'aria-label, aucun texte ajouté", () => {
    render(<Button iconOnly loading aria-label="Actualiser" loadingText="ne doit pas apparaître" />);
    const b = screen.getByRole("button", { name: "Actualiser" });
    expect(b.textContent).toBe("");
  });
});

describe("StatusBadge", () => {
  const tones: StatusTone[] = ["success", "warning", "danger", "info", "neutral", "pending"];

  it.each(tones)("ton %s : texte lisible et icône décorative (aria-hidden)", (tone) => {
    const { container } = render(<StatusBadge tone={tone}>Libellé {tone}</StatusBadge>);
    expect(screen.getByText(`Libellé ${tone}`)).toBeTruthy();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("tons distincts portés par des jetons (aucune couleur littérale)", () => {
    const { container: ok } = render(<StatusBadge tone="success">OK</StatusBadge>);
    const { container: ko } = render(<StatusBadge tone="danger">Rupture</StatusBadge>);
    const okClass = ok.firstElementChild?.getAttribute("class") ?? "";
    const koClass = ko.firstElementChild?.getAttribute("class") ?? "";
    expect(okClass).toContain("text-success-ink");
    expect(koClass).toContain("text-danger-ink");
    expect(`${okClass} ${koClass}`).not.toMatch(/#[0-9a-f]{3,8}\b|text-(red|green|white)-?/i);
  });

  it("icon={false} masque l'icône, le texte reste porteur ; variante plain sans fond", () => {
    const { container } = render(
      <StatusBadge tone="warning" icon={false} variant="plain">
        À vérifier
      </StatusBadge>,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("À vérifier")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("class")).not.toContain("bg-warning-soft");
  });
});
