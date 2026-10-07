import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendu dynamique classique : l'application est entièrement authentifiée et
  // multi-tenant, chaque page dépend des cookies de session.
  cacheComponents: false,
  typedRoutes: true,
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
};

export default nextConfig;
