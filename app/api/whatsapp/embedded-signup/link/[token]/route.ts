import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { publicErrorMessage } from "@/lib/api-errors";
import { getMetaPlatformApp } from "@/lib/meta/platform-app";
import { GRAPH_API_VERSION } from "@/lib/meta/graph";
import { completeOnboardingLink, findOnboardingLinkByToken, onboardingLinkBlocker, OnboardingLinkError, redirectWithResult } from "@/lib/whatsapp/onboarding-links";

type Params = { params: Promise<{ token: string }> };

const bodySchema = z.object({
  code: z.string().min(10).max(4000),
  wabaId: z.string().regex(/^\d{5,25}$/, "waba_id inválido"),
  phoneNumberId: z.string().regex(/^\d{5,25}$/, "phone_number_id inválido").nullable().optional(),
  coexistence: z.boolean().optional().default(false),
});

// Rutas públicas de /conectar/<token> (enlace de conexión, sin sesión): el
// token es la credencial. GET = datos para abrir el diálogo de Meta (mismos
// que /embedded-signup/config); POST = cerrar el alta.
export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  const link = await findOnboardingLinkByToken(token);
  if (!link) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  const app = await getMetaPlatformApp();
  const available = !!(app.appId && app.appSecret && app.embeddedSignupConfigId);
  return NextResponse.json({
    available,
    appId: available ? app.appId : null,
    configId: available ? app.embeddedSignupConfigId : null,
    graphVersion: GRAPH_API_VERSION,
    coexistenceAllowed: !!link.organization.whatsappCoexistenceEnabled,
    blocker: await onboardingLinkBlocker(link),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  const [byIp, byLink] = await Promise.all([rateLimit(`onboarding-link-ip:${clientIp(req)}`, 20, 60), rateLimit(`onboarding-link:${token.slice(0, 24)}`, 10, 60)]);
  if (!byIp.allowed || !byLink.allowed) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const result = await completeOnboardingLink(token, { ...parsed.data, phoneNumberId: parsed.data.phoneNumberId ?? null });
    return NextResponse.json(
      {
        coexistence: result.coexistence,
        redirectUrl: result.redirectUrl ? redirectWithResult(result.redirectUrl, { status: "connected", accountId: result.accountId, reference: result.reference }) : null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof OnboardingLinkError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo conectar el número de WhatsApp") }, { status: 500 });
  }
}
