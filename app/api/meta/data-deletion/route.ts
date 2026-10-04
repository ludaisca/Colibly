import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getMetaPlatformApp } from "@/lib/meta/platform-app";
import { parseSignedRequest } from "@/lib/meta/signed-request";
import { handleDataDeletion } from "@/lib/meta/data-deletion";
import { appUrl } from "@/lib/app-url";

// Callback firmado de Meta (Inicio de sesión para empresas → Configurar). Meta
// manda `signed_request` como application/x-www-form-urlencoded. La autenticación
// es la firma con el App Secret de la plataforma.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`meta-data-deletion:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const signedRequest = typeof form?.get("signed_request") === "string" ? (form.get("signed_request") as string) : null;
  const app = await getMetaPlatformApp();
  const payload = parseSignedRequest(signedRequest, app.appSecret);
  if (!payload?.user_id) return NextResponse.json({ error: "signed_request inválido" }, { status: 400 });

  const { confirmationCode, accountsDeleted } = await handleDataDeletion(payload.user_id);
  console.log(`[meta] eliminación de datos ${confirmationCode}: ${accountsDeleted} cuenta(s) borrada(s)`);
  // Meta espera exactamente { url, confirmation_code }.
  return NextResponse.json({ url: appUrl(`/eliminacion-de-datos/${confirmationCode}`), confirmation_code: confirmationCode });
}
