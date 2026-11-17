import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";
import { emitDomainEvent } from "@/lib/events/emit";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { ApiError } from "@/lib/api/respond";
import type { ApiContext } from "@/lib/api/auth";

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "CUSTOMER" | "LOST";

/**
 * Contacto de WhatsApp por teléfono para la API pública: lo encuentra (52… y
 * 521… son el mismo número en México) o lo crea con los topes del plan y el
 * evento contact.created. Lo usan POST /contacts y POST /messages con
 * accountId + to. `created: false` = ya existía (no se modifica).
 */
export async function findOrCreateApiWhatsAppContact(
  ctx: ApiContext,
  input: { accountId: string; phone: string; name?: string; leadStatus?: LeadStatus },
  // POST /contacts emite el evento después de validar customFields (si no son
  // válidos borra el contacto, y no debe haber salido un contact.created).
  opts: { deferEvent?: boolean } = {}
): Promise<{ id: string; created: boolean; accountId: string; channelAccountId: string | null }> {
  if (ctx.channelAccountIds.includes(input.accountId)) {
    // WhatsApp por QR se presenta como WhatsApp, pero no admite contactos en
    // frío (es lo que más suspensiones causa): el mensaje no lo delata.
    const qr = await prisma.channelAccount.count({ where: { id: input.accountId, channel: "WHATSAPP_WEB" } });
    throw new ApiError(
      400,
      "invalid_request",
      qr > 0 ? "Esta cuenta no permite crear contactos por la API: el contacto se crea cuando te escribe" : "Solo se pueden crear contactos en cuentas de WhatsApp"
    );
  }
  if (!ctx.accountIds.includes(input.accountId)) {
    throw new ApiError(404, "not_found", "Cuenta no encontrada");
  }

  const existing = await prisma.contact.findFirst({
    where: { accountId: input.accountId, remoteJid: { in: jidCandidates(input.phone) } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false, accountId: input.accountId, channelAccountId: null };

  const exceeded = await evaluatePlanLimit(ctx.organizationId, "contacts");
  if (exceeded) throw new ApiError(402, "plan_limit", exceeded.message);
  const status = input.leadStatus ?? "NEW";
  if (status !== "CUSTOMER" && status !== "LOST") {
    const leads = await evaluatePlanLimit(ctx.organizationId, "activeLeads");
    if (leads) throw new ApiError(402, "plan_limit", leads.message);
  }

  let created;
  try {
    created = await prisma.contact.create({
      data: {
        accountId: input.accountId,
        remoteJid: input.phone,
        name: input.name ?? input.phone,
        nameSource: input.name ? "user" : null,
        leadStatus: status,
      },
      select: { id: true },
    });
  } catch (err) {
    // Carrera entre dos altas del mismo teléfono: la otra ganó.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.contact.findUniqueOrThrow({
        where: { accountId_remoteJid: { accountId: input.accountId, remoteJid: input.phone } },
        select: { id: true },
      });
      return { id: winner.id, created: false, accountId: input.accountId, channelAccountId: null };
    }
    throw err;
  }

  if (!opts.deferEvent) await emitApiContactCreated(input.accountId, created.id);
  return { id: created.id, created: true, accountId: input.accountId, channelAccountId: null };
}

export async function emitApiContactCreated(accountId: string, contactId: string): Promise<void> {
  await emitDomainEvent({
    type: "contact.created",
    account: { kind: "whatsapp", id: accountId },
    chat: null,
    contactId,
    data: { origin: "ORGANIC", source: "api" },
  });
}
