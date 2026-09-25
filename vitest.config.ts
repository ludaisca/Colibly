import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests solo para lógica pura con reglas delicadas (motor de automatizaciones,
// guardas de red). El resto del proyecto se verifica con tsc + lint + build.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["lib/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
