import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { availableModels, enabledProviders } from "@/lib/ai/platform";

// Modelos que se pueden elegir para bots y calificadores: la lista curada de
// lib/billing/plans.ts, filtrada a los proveedores con key de plataforma.
// Abierta a todos los roles (los formularios de bots y calificadores la usan).
// Sin ?provider= devuelve { providers, models } para que el formulario sepa
// qué proveedores ofrecer.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const provider = new URL(req.url).searchParams.get("provider");
  const models = availableModels().map((m) => ({ id: m.id, name: m.label, provider: m.provider, description: m.description }));
  if (!provider) return NextResponse.json({ providers: enabledProviders(), models });
  if (provider !== "openrouter" && provider !== "google") {
    return NextResponse.json({ error: "Proveedor inválido" }, { status: 400 });
  }
  return NextResponse.json(models.filter((m) => m.provider === provider));
}
