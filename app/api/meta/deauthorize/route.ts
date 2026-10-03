import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getMetaPlatformApp } from "@/lib/meta/platform-app";
import { parseSignedRequest } from "@/lib/meta/signed-request";
import { handleDeauthorization } from "@/lib/meta/data-deletion";

// Callback firmado de Meta (Inicio de sesión para empresas → Configurar). Meta
// manda `signed_request` como application/x-www-form-urlencoded. La autenticación
// es la firma con el App Secret de la plataforma.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`meta-deauthorize:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const signedRequest = typeof form?.get("signed_request") === "string" ? (form.get("signed_request") as string) : null;
  const app = await getMetaPlatformApp();
  const payload = parseSignedRequest(signedRequest, app.appSecret);
  if (!payload?.user_id) return NextResponse.json({ error: "signed_request inválido" }, { status: 400 });

  const affected = await handleDeauthorization(payload.user_id);
  console.log(`[meta] desautorización: ${affected} cuenta(s) desconectada(s)`);
  return NextResponse.json({ success: true });
}
