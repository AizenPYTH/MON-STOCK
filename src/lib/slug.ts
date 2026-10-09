/**
 * Identifiants d'URL (slugs). Module PUR et PARTAGÉ (web + mobile).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";
}

/** Slug d'organisation : les organisations ne sont pas visibles avant adhésion, un suffixe aléatoire court évite les collisions. */
export function uniqueOrganizationSlug(name: string, random: () => number = Math.random): string {
  const suffix = random().toString(36).slice(2, 7);
  return `${slugify(name)}-${suffix}`;
}
