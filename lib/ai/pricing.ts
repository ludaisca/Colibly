import type { AIProvider } from "./types";

interface ModelPricing {
  input: number;
  output: number;
}

// Google entries reflect the <=200k-context standard tier from
// https://ai.google.dev/gemini-api/docs/pricing — Gemini has no pricing API,
// so this table has to be kept in sync by hand. Verified 2026-09-28.
//
// OpenCode Go es una suscripción plana ($10/mes, no cobra por token) — sus
// modelos quedan en $0 aquí a propósito, para no mostrar un costo por-token
// engañoso en el dashboard. El gasto real de la suscripción no se prorratea
// por llamada.
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-2.5-flash":             { input: 0.30,  output: 2.50 },
  "gemini-2.5-flash-lite":        { input: 0.10,  output: 0.40 },
  "gemini-2.5-pro":               { input: 1.25,  output: 10.00 },
  "gemini-3.8-flash":             { input: 0.75,  output: 3.75 },
  "opencode-go/glm-5.3-flash":              { input: 0, output: 0 },
  "opencode-go/deepseek-v4-flash-vision-exp": { input: 0, output: 0 },
};

export async function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider?: AIProvider
): Promise<number> {
  // Google aplica tarifa introductoria hasta el 31/12/2026. Los registros
  // históricos ya guardan su costo estimado, así que el cambio solo afecta
  // llamadas futuras.
  const pricing: ModelPricing | undefined = model === "gemini-3.8-flash" && Date.now() >= Date.UTC(2027, 0, 1)
    ? { input: 1.50, output: 7.50 }
    : MODEL_PRICING[model];

  if (!pricing) {
    // Surface this instead of silently logging $0 forever — a model missing
    // from the static table should be noticeable, not indistinguishable from
    // "this model is actually free."
    console.warn(`[pricing] Sin precio conocido para el modelo "${model}" (provider: ${provider ?? "?"}) — costo registrado como $0`);
    return 0;
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
