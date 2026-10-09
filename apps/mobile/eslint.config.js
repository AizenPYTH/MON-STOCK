// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "node_modules/*", "android/*", "ios/*"],
  },
  {
    // Les jest.mock() sont hissés par babel-jest : l'ordre des imports des tests est voulu.
    files: ["tests/**"],
    rules: { "import/first": "off" },
  },
  {
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
    },
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
]);
