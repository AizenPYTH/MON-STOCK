import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origine Supabase (REST + Realtime) autorisée côté navigateur ; repli sur *.supabase.co. */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (raw) {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") {
        return [u.origin, `${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`];
      }
    }
  } catch {
    // URL invalide : repli ci-dessous (l'application affichera l'erreur de configuration).
  }
  return ["https://*.supabase.co", "wss://*.supabase.co"];
}

/**
 * Content-Security-Policy sans nonce (compatible avec le rendu Next.js sans proxy dédié) :
 * - scripts / styles : même origine + inline (hydratation Next / styles injectés) ; `unsafe-eval` en dev uniquement ;
 * - images : https (images produit et fournisseurs externes) + data/blob ;
 * - form-action : même origine + eBay (le POST /api/integrations/ebay/connect redirige vers auth.ebay.com) ;
 * - aucune intégration en iframe (anti-clickjacking).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins().join(" ")}${isDev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.ebay.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Rendu dynamique classique : l'application est entièrement authentifiée et
  // multi-tenant, chaque page dépend des cookies de session.
  cacheComponents: false,
  typedRoutes: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Les secrets ne sont jamais exposés : seules les variables NEXT_PUBLIC_* le sont.
  serverExternalPackages: ["pg"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
