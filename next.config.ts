import type { NextConfig } from "next";
import { SERVER_ACTION_BODY_LIMIT_BYTES } from "./src/lib/upload-limits";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy sans nonce (compatible avec le rendu Next.js sans proxy dédié) :
 * - scripts / styles : même origine + inline (hydratation Next / styles injectés) ; `unsafe-eval` en dev uniquement ;
 * - connexions (W-33) : même origine uniquement. Le navigateur ne parle jamais directement à Supabase
 *   (aucun client Supabase navigateur, aucun Realtime : sessions et données passent par le serveur web) ;
 *   conseiller (`/api/advisor/chat`, `/api/advisor/speech`), imports de fichiers et Server Actions sont
 *   sur le site. La dictée (Web Speech API) est un service du navigateur, hors CSP ;
 * - images : https (photos produit au domaine du fournisseur, imprévisible : pas de liste fermée
 *   possible) + data ; `blob:` retiré (aucune image locale créée par le site) ;
 * - médias : même origine (voix du conseiller) + data (son muet qui débloque la lecture audio) ;
 * - form-action : même origine + eBay (le POST /api/integrations/ebay/connect redirige vers auth.ebay.com) ;
 * - aucune intégration en iframe (anti-clickjacking).
 * CSP à nonce (Q-22) non retenue pour l'instant : voir docs/WEB-DEPLOY.md (« Sécurité du navigateur »).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "media-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
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
  // Micro autorisé pour ce site seulement : dictée du conseiller (jamais pour un contenu tiers intégré).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()" },
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
  // (W-23 : `serverExternalPackages: ["pg"]` retiré — `pg` n'est importé que par les scripts et les
  // tests d'intégration, jamais par le code servi par Next.)
  experimental: {
    // W-09 : Server Actions recevant un fichier de flux (1 Mo par défaut chez Next) alignées sur la
    // limite pratique d'un envoi au site hébergé (~4,5 Mo chez Vercel), annoncée dans l'interface.
    serverActions: { bodySizeLimit: SERVER_ACTION_BODY_LIMIT_BYTES },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
