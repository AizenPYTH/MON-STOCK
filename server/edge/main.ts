/** Point d'entrée Deno de l'Edge Function `api` (voir api.ts). */
import { serve } from "./api";

(globalThis as unknown as { Deno: { serve: (h: (r: Request) => Promise<Response>) => void } }).Deno.serve(serve);
