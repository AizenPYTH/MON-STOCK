// @vitest-environment happy-dom
/**
 * Accueil v2 (handoff §C0, §F) : vente d'exemple du hero et de la démo (étapes, rejouer, filtres,
 * onglets) et moteur de défilement (un seul écouteur `scroll` pour tous les abonnés).
 */
import "./setup-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeScroll } from "@/components/marketing/motion";
import { ProductDemo } from "@/components/public/home/product-demo";
import { HeroStage } from "@/components/public/home/hero-stage";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

describe("Démo produit", () => {
  it("la vente d'exemple suit les étapes et se rejoue (bouton, ligne iPhone 13, onglet Ventes)", async () => {
    render(<ProductDemo />);
    const button = screen.getByRole("button", { name: "Simuler une vente eBay" });
    // iPhone 13 sélectionné par défaut (fiche SKU).
    expect(screen.getByRole("button", { name: /iPhone 13 128 Go Noir/, pressed: true })).toBeTruthy();
    fireEvent.click(button);
    await advance(600);
    expect(screen.getByRole("button", { name: "Vente en cours…" })).toBeTruthy();
    await advance(3500);
    expect(screen.getByRole("button", { name: "Rejouer la vente" })).toBeTruthy();
    // Onglet Ventes : la commande d'exemple est importée.
    fireEvent.click(screen.getByRole("tab", { name: /Ventes/ }));
    expect(screen.getByRole("tab", { name: /Ventes/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("#E-10483")).toBeTruthy();
    expect(screen.getByText("Importée · stock −1")).toBeTruthy();
    // Pas de boucle : l'état final reste.
    await advance(12_000);
    expect(screen.getByRole("button", { name: "Rejouer la vente" })).toBeTruthy();
  });

  it("filtres : un seul actif à la fois, la liste suit le filtre", () => {
    render(<ProductDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Ruptures" }));
    expect(screen.getByRole("button", { name: "Ruptures" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Tous" }).getAttribute("aria-pressed")).toBe("false");
    const list = screen.getByRole("list", { name: "Références (exemple)" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Faibles" }));
    expect(list.querySelectorAll("li")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Tous" }));
    expect(list.querySelectorAll("li")).toHaveLength(7);
  });
});

describe("Hero vivant", () => {
  it("le bouton lance la vente puis devient « Rejouer » ; un double-clic (< 400 ms) est ignoré", async () => {
    render(<HeroStage dockCenter={62} />);
    expect(screen.getByText("Aperçu illustratif", { exact: false })).toBeTruthy();
    const b = screen.getByRole("button", { name: "▶ Simuler une vente" });
    fireEvent.click(b);
    fireEvent.click(b);
    await advance(600);
    expect(screen.getByRole("button", { name: "● Vente en cours" })).toBeTruthy();
    await advance(3500);
    expect(screen.getByRole("button", { name: "↻ Rejouer" })).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/1\s965/);
  });
});

describe("Moteur de défilement", () => {
  it("un seul écouteur `scroll` passif pour plusieurs abonnés, retiré au dernier désabonnement", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeScroll(a);
    const offB = subscribeScroll(b);
    const scrollAdds = add.mock.calls.filter(([t]) => t === "scroll");
    expect(scrollAdds).toHaveLength(1);
    expect(scrollAdds[0]![2]).toEqual({ passive: true });
    vi.advanceTimersByTime(20);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    offA();
    expect(remove.mock.calls.filter(([t]) => t === "scroll")).toHaveLength(0);
    offB();
    expect(remove.mock.calls.filter(([t]) => t === "scroll")).toHaveLength(1);
  });
});
