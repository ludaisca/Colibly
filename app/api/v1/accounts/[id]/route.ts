import { prisma } from "@/lib/prisma";
import { publicChannel } from "@/lib/api/public-channel";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { toE164 } from "@/lib/phone/e164";
import { refreshPhoneHealth } from "@/lib/whatsapp/phone-health";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/accounts/{id} — la cuenta con el estado del número en Meta
// (WhatsApp): calidad, límite de envío, estado del nombre y si puede enviar.
// La salud se vuelve a leer de Meta como mucho cada 10 minutos (la misma caché
// que la ficha de la cuenta en Colibly); `health.checkedAt` dice de cuándo es.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req);
  const { id } = await params;

  if (ctx.accountIds.includes(id)) {
    await refreshPhoneHealth(id);
    const a = await prisma.wAAccount.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true, name: true, phoneNumber: true, status: true, wabaId: true, phoneNumberId: true, coexistence: true,
        qualityRating: true, qualityEvent: true, messagingTier: true, nameStatus: true, canSendMessage: true, healthNotices: true, healthCheckedAt: true,
        createdAt: true,
      },
    });
    if (a) {
      return apiOk({
        id: a.id,
        channel: "WHATSAPP",
        name: a.name,
        phoneNumber: a.phoneNumber,
        phoneE164: toE164(a.phoneNumber),
        status: a.status,
        // Ids de Meta, para cruzarlos con el Administrador de WhatsApp.
        wabaId: a.wabaId,
        phoneNumberId: a.phoneNumberId,
        // Conectada por coexistencia: el número sigue usándose en la app WhatsApp Business.
        coexistence: a.coexistence,
        health: {
          qualityRating: a.qualityRating, // GREEN | YELLOW | RED | UNKNOWN
          lastQualityEvent: a.qualityEvent, // FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE…
          messagingTier: a.messagingTier, // TIER_250, TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED
          nameStatus: a.nameStatus, // APPROVED, PENDING_REVIEW, DECLINED…
          canSendMessage: a.canSendMessage, // AVAILABLE | LIMITED | BLOCKED
          notices: Array.isArray(a.healthNotices) ? a.healthNotices : [],
          checkedAt: a.healthCheckedAt,
        },
        createdAt: a.createdAt,
      });
    }
  }

  if (ctx.channelAccountIds.includes(id)) {
    const a = await prisma.channelAccount.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, name: true, channel: true, status: true, createdAt: true, externalAccountId: true },
    });
    if (a) {
      const phone = a.channel === "WHATSAPP_WEB" ? a.externalAccountId : null;
      return apiOk({ id: a.id, channel: publicChannel(a.channel), name: a.name, phoneNumber: phone ? `+${phone}` : null, phoneE164: phone ? toE164(phone) : null, status: a.status, wabaId: null, phoneNumberId: null, coexistence: false, health: null, createdAt: a.createdAt });
    }
  }
  throw new ApiError(404, "not_found", "Cuenta no encontrada");
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
