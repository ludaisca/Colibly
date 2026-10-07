import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Herramientas y pruebas de desarrollo (scripts de Node en CommonJS), fuera
  // del código del producto.
  // app/components/kit/** es código generado por scripts/coss-sync.mjs (coss ui, MIT).
  { ignores: ["dev/**", "app/components/kit/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
];

export default eslintConfig;
