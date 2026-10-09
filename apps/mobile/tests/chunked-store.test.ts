import { CHUNK_SIZE, createChunkedStore, type KeyValueStore } from "~/lib/chunked-store";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

describe("stockage de session découpé (trousseau / Keystore)", () => {
  it("restitue exactement une session plus grande que la limite d'un élément", async () => {
    const base = memoryStore();
    const store = createChunkedStore(base);
    const session = JSON.stringify({ access_token: "a".repeat(5000), refresh_token: "r".repeat(300), user: { id: "u" } });
    await store.setItem("sb-auth", session);
    expect(await store.getItem("sb-auth")).toBe(session);
    // Aucun morceau ne dépasse la taille fixée.
    for (const [k, v] of base.data) if (!k.endsWith(".n")) expect(v.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("une valeur absente vaut null", async () => {
    expect(await createChunkedStore(memoryStore()).getItem("absent")).toBeNull();
  });

  it("une réécriture plus courte ne laisse aucun ancien morceau", async () => {
    const base = memoryStore();
    const store = createChunkedStore(base, 10);
    await store.setItem("k", "x".repeat(55));
    await store.setItem("k", "court");
    expect(await store.getItem("k")).toBe("court");
    expect([...base.data.keys()].sort()).toEqual(["k.0", "k.n"]);
  });

  it("une écriture interrompue (morceau manquant) donne une session absente, jamais tronquée", async () => {
    const base = memoryStore();
    const store = createChunkedStore(base, 10);
    await store.setItem("k", "y".repeat(35));
    base.data.delete("k.2");
    expect(await store.getItem("k")).toBeNull();
  });

  it("la déconnexion supprime tous les morceaux", async () => {
    const base = memoryStore();
    const store = createChunkedStore(base, 10);
    await store.setItem("k", "z".repeat(42));
    await store.removeItem("k");
    expect(base.data.size).toBe(0);
  });
});
