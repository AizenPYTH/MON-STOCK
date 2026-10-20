import { SUPPLIER_LOGO_DOMAINS } from "@/data/supplier-logos.web";

/** Mêmes règles que l'application iPhone (apps/mobile/src/components/supplier-logo.tsx). */
const AVAILABLE = new Set(SUPPLIER_LOGO_DOMAINS);

/** Logo embarqué pour un domaine (ou son domaine racine), sinon null. */
export function logoForDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const d = domain.toLowerCase().replace(/^www\./, "");
  const root = d.split(".").slice(-2).join(".");
  const hit = AVAILABLE.has(d) ? d : AVAILABLE.has(root) ? root : null;
  return hit ? `/supplier-logos/${hit}.png` : null;
}

function shortName(name: string): string {
  return (name.split(/\s+[—–-]\s+/)[0] ?? name).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Sans domaine connu : logo dont le PREMIER libellé de domaine est exactement le nom (« Foxway » → foxway.*). */
export function logoForName(name: string | null | undefined): string | null {
  const slug = shortName(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (slug.length < 3) return null;
  for (const d of SUPPLIER_LOGO_DOMAINS) if ((d.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "") === slug) return `/supplier-logos/${d}.png`;
  return null;
}

export function supplierLogoUrl(domain: string | null | undefined, name: string): string | null {
  return logoForDomain(domain) ?? logoForName(name);
}
