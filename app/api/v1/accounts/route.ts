import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, withApiErrors, methodNotAllowed } from "@/lib/api/respond";
import { toE164 } from "@/lib/phone/e164";

// Cuentas al alcance de la key (WhatsApp y demás canales) — los ids que piden
// los demás endpoints. Nunca devuelve credenciales.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req);
  const [wa, channels] = await Promise.all([
    prisma.wAAccount.findMany({
      where: { id: { in: ctx.accountIds } },
      select: { id: true, name: true, phoneNumber: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.channelAccount.findMany({
      where: { id: { in: ctx.channelAccountIds } },
      select: { id: true, name: true, channel: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return apiOk({
    data: [
      // phoneNumber = como lo muestra Meta ("+52 1 55 …"); phoneE164 = normalizado.
      ...wa.map((a) => ({ id: a.id, channel: "WHATSAPP", name: a.name, phoneNumber: a.phoneNumber, phoneE164: toE164(a.phoneNumber), status: a.status })),
      ...channels.map((a) => ({ id: a.id, channel: a.channel, name: a.name, phoneNumber: null, phoneE164: null, status: a.status })),
    ],
  });
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
