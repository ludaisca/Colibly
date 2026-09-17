import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getWebchatCredentials, isOriginAllowed, corsHeaders } from "@/lib/webchat/account";
import { createWebchatToken, generateVisitorId, verifyWebchatToken, WEBCHAT_RENEW_WINDOW_SECONDS } from "@/lib/webchat/session-token";

// Roadmap P3-f — ruta PÚBLICA (sin sesión de NextAuth): el widget la llama
// desde el navegador del visitante para obtener un token de sesión antes de
// poder mandar/leer mensajes. El único portón real es el header Origin
// contra los dominios configurados en la cuenta — el accountId de la URL es
// público por diseño (va embebido en el script del sitio del cliente).

async function resolveAccount(accountId: string, origin: string | null) {
  const account = await prisma.channelAccount.findUnique({
    where: { id: accountId },
  });
  if (!account || account.channel !== "WEBCHAT" || account.status !== "CONNECTED") return null;

  const { allowedOrigins } = getWebchatCredentials(account);
  if (!isOriginAllowed(origin, allowedOrigins)) return null;

  return account;
}

export async function OPTIONS(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const origin = req.headers.get("origin");
  const { accountId } = await params;
  const account = await resolveAccount(accountId, origin);
  if (!account) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin!) });
}

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const origin = req.headers.get("origin");
    const { accountId } = await params;
    const account = await resolveAccount(accountId, origin);
    if (!account) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = await rateLimit(`webchat-session:${ip}`, 30, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders(origin!) });
    }

    // Visitante que vuelve: presenta su token anterior (aunque haya vencido,
    // dentro de la ventana de renovación) y conserva su visitorId. Un visitorId
    // mandado por el cliente ya no se acepta — ver generateVisitorId().
    const body = await req.json().catch(() => ({}));
    const renewToken = typeof body?.renewToken === "string" ? body.renewToken : null;
    const renewed = renewToken
      ? verifyWebchatToken(renewToken, accountId, { allowExpiredForSeconds: WEBCHAT_RENEW_WINDOW_SECONDS })
      : null;

    let visitorId: string;
    if (renewed) {
      visitorId = renewed.visitorId;
    } else {
      // Límite de visitantes NUEVOS por IP: rotar identidades desde una misma
      // IP era la forma de multiplicar mensajes (y respuestas de IA con costo).
      const newVisitor = await rateLimit(`webchat-new-visitor:${ip}`, 20, 3600);
      if (!newVisitor.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders(origin!) });
      }
      visitorId = generateVisitorId();
    }

    const token = createWebchatToken(visitorId, accountId);
    return NextResponse.json({ token, visitorId }, { headers: corsHeaders(origin!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
