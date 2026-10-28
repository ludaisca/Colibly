import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformApiKey } from "@/lib/ai/platform";
import { fetchOpenCodeModelCatalog } from "@/lib/ai/providers/opencode";
import { AI_MODELS } from "@/lib/billing/plans";

function fallbackModels() {
  return AI_MODELS.filter((m) => m.provider === "opencode").map((m) => ({ id: m.id, label: m.label }));
}

// Catálogo en vivo de OpenCode Go para los selectores de /plataforma.
// Nunca devuelve la API key. Si OpenCode no responde, quedan los recomendados.
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const apiKey = await getPlatformApiKey("opencode");
  if (!apiKey) {
    return NextResponse.json({ models: fallbackModels(), source: "fallback", error: "Falta la API key de OpenCode" });
  }

  const models = await fetchOpenCodeModelCatalog(apiKey);
  if (!models) {
    return NextResponse.json({ models: fallbackModels(), source: "fallback", error: "No se pudo consultar el catálogo de OpenCode" });
  }
  return NextResponse.json({ models, source: "opencode" });
}
