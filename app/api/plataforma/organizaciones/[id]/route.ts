import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateUserSessionCache } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { invalidateOrgBilling } from "@/lib/billing/gates";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS, statusAfterSuspension } from "@/lib/billing/state";
import { isStripeConfigured, syncSubscription } from "@/lib/billing/stripe";
import { publicErrorMessage } from "@/lib/api-errors";

const MAX_BONUS_CREDITS = 100_000;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend_trial"), days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS) }),
  z.object({ action: z.literal("grant_credits"), credits: z.number().int().min(1).max(MAX_BONUS_CREDITS) }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("set_internal"), internal: z.boolean() }),
  // Coexistencia de WhatsApp (conectar el número de la app WhatsApp Business):
  // bandera por organización durante la beta, apagada por defecto.
  z.object({ action: z.literal("set_whatsapp_coexistence"), enabled: z.boolean() }),
  z.object({
    action: z.literal("set_channels"),
    telegram: z.boolean(),
    messenger: z.boolean(),
    instagram: z.boolean(),
    webchat: z.boolean(),
  }),
]);

// Acciones del operador sobre una organización (panel /plataforma). Cada una
// queda en el log con el correo del operador.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  try {
    const org = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        isInternal: true,
        trialEndsAt: true,
        canceledAt: true,
        stripeSubscriptionId: true,
        members: { select: { id: true } },
      },
    });
    if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    const now = new Date();

    if (input.action === "extend_trial") {
      const result = extendTrial(org, input.days, now);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
      await prisma.organization.update({ where: { id }, data: { ...result, lastBillingNotice: null } });
    } else if (input.action === "grant_credits") {
      if (org.isInternal) return NextResponse.json({ error: "Una organización interna no tiene límite de créditos" }, { status: 400 });
      await prisma.organization.update({
        where: { id },
        // Sin reiniciar el nivel de aviso, un 80/100 % ya enviado no se repetiría
        // aunque el nuevo tope lo vuelva a cruzar.
        data: { aiCreditsBonus: { increment: input.credits }, aiCreditsAlertLevel: 0 },
      });
    } else if (input.action === "suspend") {
      if (org.isInternal) return NextResponse.json({ error: "Una organización interna no se puede suspender" }, { status: 400 });
      if (org.members.some((m) => m.id === admin.userId)) {
        return NextResponse.json({ error: "No puedes suspender tu propia organización" }, { status: 400 });
      }
      if (org.status === "SUSPENDED") return NextResponse.json({ error: "Ya está suspendida" }, { status: 400 });
      await prisma.organization.update({ where: { id }, data: { status: "SUSPENDED" } });
      // Las escrituras se cortan en cuanto expira el caché de facturación (15 s:
      // accessMode "suspended"); la sesión cae en su próxima revalidación (el
      // token se revisa cada 60 s y el estado del usuario tiene otro caché de 60 s).
      for (const m of org.members) invalidateUserSessionCache(m.id);
    } else if (input.action === "reactivate") {
      if (org.status !== "SUSPENDED") return NextResponse.json({ error: "No está suspendida" }, { status: 400 });
      if (org.stripeSubscriptionId && (await isStripeConfigured())) {
        // syncSubscription no toca a una SUSPENDED: se saca primero a un estado
        // neutro y Stripe decide el real (activa, impago, cancelada…).
        await prisma.organization.update({ where: { id }, data: { status: "READ_ONLY" } });
        invalidateOrgBilling(id);
        await syncSubscription(org.stripeSubscriptionId, id);
      } else {
        await prisma.organization.update({ where: { id }, data: { status: statusAfterSuspension(org, now) } });
      }
      for (const m of org.members) invalidateUserSessionCache(m.id);
    } else if (input.action === "set_internal") {
      if (input.internal && org.stripeSubscriptionId) {
        return NextResponse.json({ error: "Cancela la suscripción de Stripe antes de marcarla interna" }, { status: 400 });
      }
      if (org.isInternal !== input.internal) {
        await prisma.organization.update({ where: { id }, data: { isInternal: input.internal } });
      }
    } else if (input.action === "set_whatsapp_coexistence") {
      await prisma.organization.update({ where: { id }, data: { whatsappCoexistenceEnabled: input.enabled } });
    } else {
      // set_channels: feature por organización, no toca facturación ni sesiones.
      await prisma.organization.update({
        where: { id },
        data: {
          channelTelegramEnabled: input.telegram,
          channelMessengerEnabled: input.messenger,
          channelInstagramEnabled: input.instagram,
          channelWebchatEnabled: input.webchat,
        },
      });
    }

    invalidateOrgBilling(id);
    console.log(`[plataforma] ${admin.email} → ${JSON.stringify(input)} en "${org.name}" (${id})`);
    const updated = await prisma.organization.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        isInternal: true,
        trialEndsAt: true,
        aiCreditsBonus: true,
        channelTelegramEnabled: true,
        channelMessengerEnabled: true,
        channelInstagramEnabled: true,
        channelWebchatEnabled: true,
        whatsappCoexistenceEnabled: true,
      },
    });
    return NextResponse.json({ organization: updated });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo aplicar la acción") }, { status: 500 });
  }
}
