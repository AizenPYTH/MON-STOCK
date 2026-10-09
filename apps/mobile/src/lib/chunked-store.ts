/**
 * Stockage clé/valeur découpé en morceaux.
 *
 * Le trousseau iOS / Keystore Android (expo-secure-store) déconseille les valeurs de plus de
 * 2 048 octets ; une session Supabase (JWT d'accès + jeton de rafraîchissement + profil) les
 * dépasse souvent. La valeur est donc découpée en morceaux, TOUS stockés dans le magasin
 * sécurisé (jamais en clair dans AsyncStorage).
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 64;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

export function createChunkedStore(base: KeyValueStore, chunkSize = CHUNK_SIZE): KeyValueStore {
  async function removeChunks(key: string): Promise<void> {
    const raw = await base.getItem(countKey(key));
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    const count = Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_CHUNKS) : 0;
    for (let i = 0; i < count; i++) await base.removeItem(chunkKey(key, i));
    await base.removeItem(countKey(key));
  }

  return {
    async getItem(key) {
      const raw = await base.getItem(countKey(key));
      if (raw === null) return null;
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0 || n > MAX_CHUNKS) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await base.getItem(chunkKey(key, i));
        // Morceau manquant (écriture interrompue) : session illisible → considérée absente.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },
    async setItem(key, value) {
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += chunkSize) chunks.push(value.slice(i, i + chunkSize));
      if (chunks.length > MAX_CHUNKS) throw new Error("Valeur trop volumineuse pour le stockage sécurisé.");
      await removeChunks(key);
      for (let i = 0; i < chunks.length; i++) await base.setItem(chunkKey(key, i), chunks[i] ?? "");
      // Le compteur est écrit en dernier : une écriture interrompue laisse une valeur absente, pas tronquée.
      await base.setItem(countKey(key), String(chunks.length));
    },
    async removeItem(key) {
      await removeChunks(key);
    },
  };
}
