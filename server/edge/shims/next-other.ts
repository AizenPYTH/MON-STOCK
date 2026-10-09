/** `next/navigation`, `next/headers`, `next/cache` : jamais appelés par l'API (contexte mobile par jeton). */
export function redirect(): never {
  throw new Error("redirect() indisponible hors Next.js");
}
export function notFound(): never {
  throw new Error("notFound() indisponible hors Next.js");
}
export async function cookies(): Promise<never> {
  throw new Error("cookies() indisponible hors Next.js");
}
export async function headers(): Promise<never> {
  throw new Error("headers() indisponible hors Next.js");
}
export function revalidatePath(): void {}
export function revalidateTag(): void {}
