import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Paquetes aparte (nodo de n8n…): tienen su propio lint.
  // .claude/: skills de terceros guardados tal cual (Impeccable); no son código de la app.
  // rediseno-astryx/: prototipo de referencia (importa Astryx, que la app aún no instala).
  // themes/ y src/themes/ + src/astryx-themes.ts: los genera el editor de temas de Astryx.
  { ignores: ["integrations/**", ".claude/**", "rediseno-astryx/**", "themes/**", "src/themes/**", "src/astryx-themes.ts"] },
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
