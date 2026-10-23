import { describe, expect, it } from "vitest";
import { activeSettingsSection, SETTINGS_SECTIONS } from "@/features/organizations/components/settings-sections";
import { connectionTone, intervalLabel } from "@/features/integrations/components/labels";

describe("sous-navigation des Réglages", () => {
  it("suit l'ordre du handoff, « Coûts du radar » pointe vers /radar/settings", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual(["Organisation", "Membres et invitations", "Intégrations", "Synchronisation", "Coûts du radar", "Facturation", "Mon compte"]);
    expect(SETTINGS_SECTIONS.find((s) => s.id === "radar-costs")).toMatchObject({ href: "/radar/settings", external: true });
  });

  it("active la section des routes imbriquées", () => {
    expect(activeSettingsSection("/settings/integrations")).toBe("integrations");
    expect(activeSettingsSection("/settings/integrations/mapping")).toBe("integrations");
    expect(activeSettingsSection("/settings/integrations/ebay/setup")).toBe("integrations");
    expect(activeSettingsSection("/settings/sync/0b6f1c1e-0000-4000-8000-000000000000")).toBe("sync");
    expect(activeSettingsSection("/settings/users/")).toBe("users");
    expect(activeSettingsSection("/radar/settings")).toBe("radar-costs");
    expect(activeSettingsSection("/settings/account")).toBe("account");
  });

  it("n'active rien hors des réglages ni sur un préfixe trompeur", () => {
    expect(activeSettingsSection("/settings")).toBeNull();
    expect(activeSettingsSection("/settings/synchro")).toBeNull();
    expect(activeSettingsSection("/radar")).toBeNull();
  });
});

describe("libellés des intégrations", () => {
  it("formate l'intervalle de synchronisation", () => {
    expect(intervalLabel(15)).toBe("15 min");
    expect(intervalLabel(60)).toBe("1 h");
    expect(intervalLabel(1440)).toBe("24 h");
  });

  it("colore le statut de connexion sans inventer d'état", () => {
    expect(connectionTone("connected")).toBe("success");
    expect(connectionTone("error")).toBe("warning");
    expect(connectionTone("expired")).toBe("danger");
    expect(connectionTone("pending")).toBe("info");
    expect(connectionTone("disconnected")).toBe("neutral");
    expect(connectionTone("inconnu")).toBe("neutral");
  });
});
