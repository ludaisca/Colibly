import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { verifyNudgeUnsubscribe } from "@/lib/activation/unsubscribe";
import { BRAND_NAME } from "@/lib/brand";
import { BRAND_COLORS } from "@/lib/brand-colors";

export const dynamic = "force-dynamic";

// Baja de los consejos de la prueba (enlace firmado de lib/activation/unsubscribe.ts).
// GET muestra una página con un botón (los antivirus de correo abren los
// enlaces solos: un GET no debe dar de baja a nadie); POST da de baja, y es
// también lo que manda el cliente de correo con List-Unsubscribe-Post (RFC 8058).

function page(title: string, body: string, form?: { o: string; s: string }): Response {
  const button = form
    ? `<form method="post" action="?o=${encodeURIComponent(form.o)}&s=${encodeURIComponent(form.s)}"><button type="submit" style="background:${BRAND_COLORS.accent};color:${BRAND_COLORS.onAccent};border:0;border-radius:12px;padding:12px 22px;font-weight:600;font-size:15px;cursor:pointer">Ya no quiero consejos</button></form>`
    : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · ${BRAND_NAME}</title></head>
<body style="margin:0;padding:24px;background:${BRAND_COLORS.background};font-family:Helvetica,Arial,sans-serif;color:${BRAND_COLORS.ink}">
<main style="max-width:480px;margin:48px auto;background:#fff;border-radius:16px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;color:${BRAND_COLORS.accentInk}">${BRAND_NAME}</p>
<h1 style="margin:0 0 12px;font-size:22px">${title}</h1>
<p style="margin:0 0 24px;line-height:1.6">${body}</p>${button}
</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function read(req: Request): { o: string; s: string } | null {
  const url = new URL(req.url);
  const o = url.searchParams.get("o") ?? "";
  const s = url.searchParams.get("s") ?? "";
  if (!o || !s || o.length > 64 || s.length > 64) return null;
  return verifyNudgeUnsubscribe(o, s) ? { o, s } : null;
}

const INVALID = () => page("Enlace no válido", "Este enlace de baja no es válido. Si sigues recibiendo correos que no quieres, respóndenos y lo arreglamos.");

export async function GET(req: Request) {
  const { allowed } = await rateLimit(`nudge-unsub:${clientIp(req)}`, 30, 60);
  if (!allowed) return new Response("Demasiadas solicitudes", { status: 429 });
  const params = read(req);
  if (!params) return INVALID();
  const current = await prisma.orgActivation.findUnique({ where: { organizationId: params.o }, select: { nudgesOptOut: true } });
  if (current?.nudgesOptOut) return page("Ya no recibirás consejos", "Ya estabas dado de baja. Los avisos de tu cuenta y de facturación siguen llegando.");
  return page(
    "¿Dejar de recibir consejos?",
    `Son los correos con recomendaciones para sacarle provecho a ${BRAND_NAME} durante tu prueba. Los avisos de tu cuenta y de facturación seguirán llegando.`,
    params
  );
}

export async function POST(req: Request) {
  const { allowed } = await rateLimit(`nudge-unsub:${clientIp(req)}`, 30, 60);
  if (!allowed) return new Response("Demasiadas solicitudes", { status: 429 });
  const params = read(req);
  if (!params) return INVALID();
  const org = await prisma.organization.findUnique({ where: { id: params.o }, select: { id: true } });
  if (org) {
    await prisma.orgActivation.upsert({
      where: { organizationId: org.id },
      create: { organizationId: org.id, nudgesOptOut: true },
      update: { nudgesOptOut: true },
    });
  }
  return page("Listo, ya no recibirás consejos", "Los avisos de tu cuenta y de facturación seguirán llegando.");
}
