import { groupOrdersByDay, ORDER_CHIP } from "~/data/sales";

describe("ventes groupées par jour (Europe/Paris)", () => {
  it("Aujourd'hui / Hier / date, dans l'ordre reçu", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const sections = groupOrdersByDay(
      [
        { placed_at: "2026-10-09T07:12:00Z" },
        { placed_at: "2026-10-08T22:30:00Z" }, // 00:30 le 9 à Paris → aujourd'hui
        { placed_at: "2026-10-08T15:00:00Z" },
        { placed_at: "2026-10-01T15:00:00Z" },
        { placed_at: null },
      ],
      now,
      () => "1 octobre",
    );
    expect(sections.map((s) => [s.title, s.data.length])).toEqual([
      ["Aujourd'hui", 2],
      ["Hier", 1],
      ["1 octobre", 1],
      ["Date inconnue", 1],
    ]);
  });

  it("une commande payée est « À expédier » (accent = demande une action)", () => {
    expect(ORDER_CHIP.paid).toEqual({ label: "À expédier", tone: "accent" });
    expect(ORDER_CHIP.refunded!.tone).toBe("danger");
  });
});
