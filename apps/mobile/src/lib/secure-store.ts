import * as SecureStore from "expo-secure-store";
import { createChunkedStore, type KeyValueStore } from "~/lib/chunked-store";

/** Accessible après le premier déverrouillage : le renouvellement de session fonctionne en arrière-plan. */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** Clés autorisées par SecureStore : alphanumérique, « . », « - », « _ ». */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

const secureBase: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(safeKey(key), OPTIONS),
  setItem: (key, value) => SecureStore.setItemAsync(safeKey(key), value, OPTIONS),
  removeItem: (key) => SecureStore.deleteItemAsync(safeKey(key), OPTIONS),
};

/** Magasin de session Supabase : trousseau iOS / Keystore Android, découpé en morceaux. */
export const secureSessionStorage = createChunkedStore(secureBase);

/** Préférences non sensibles mais propres à l'utilisateur (organisation active). */
export const securePreferences = secureBase;
