import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformApiKey } from "@/lib/ai/platform";
import { OPENCODE_MODELS_URL } from "@/lib/ai/providers/opencode";
import { AI_MODELS } from "@/lib/billing/plans";

const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;

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

  try {
    const res = await fetch(OPENCODE_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "Colibly/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return NextResponse.json({ models: fallbackModels(), source: "fallback", error: "OpenCode no aceptó la API key" });
    }
    const parsed = await res.json();
    const list = Array.isArray(parsed) ? parsed : parsed.data ?? [];
    const models = list
      .map((m: { id?: unknown }) => (typeof m?.id === "string" ? m.id : ""))
      .filter((id: string) => MODEL_ID.test(id))
      .sort()
      .map((id: string) => ({ id, label: id }));
    if (models.length === 0) {
      return NextResponse.json({ models: fallbackModels(), source: "fallback", error: "OpenCode no devolvió modelos" });
    }
    return NextResponse.json({ models, source: "opencode" });
  } catch {
    return NextResponse.json({ models: fallbackModels(), source: "fallback", error: "No se pudo consultar OpenCode" });
  }
}
