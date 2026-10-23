import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Textes en français : les apostrophes dans le JSX sont volontaires.
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    // Q-20 : les shims de l'Edge reproduisent la SIGNATURE des modules qu'ils remplacent
    // (`NextResponse<Body>` générique de next/server, export par défaut objet de `react`) : le
    // paramètre de type inutilisé et l'export par défaut anonyme y sont voulus.
    files: ["server/edge/shims/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/db/database.types.ts",
    // Application mobile Expo : projet séparé (son propre tsconfig, ESLint et Jest).
    "apps/**",
    // Edge Function : bundle généré par scripts/build-edge.mjs (source : server/edge + src).
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
