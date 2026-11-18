import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";
import { invalidateAccountScopes } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { releaseGowaDevice } from "@/lib/gowa/lifecycle";
import { readGowaCredentials, gowaWebhookUrl } from "@/lib/gowa/account";
import { setDeviceWebhook } from "@/lib/gowa/client";
import { z } from "zod";

const patchSchema = z.object({ groupsEnabled: z.boolean() });

// Interruptor de grupos del número (mismo permiso que borrarla: admin o dueño).
// Al encenderlo se vuelve a registrar el webhook del device para que GoWA
// mande también group.info (nombre del grupo), que los devices creados antes
// no tenían. Si GoWA no responde, el interruptor se guarda igual: los
// mensajes de grupo llegan con la lista vieja; solo falta el cambio de nombre.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;

    const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Falta groupsEnabled (true o false)" }, { status: 400 });

    const { id } = await params;
    const existing = await prisma.channelAccount.findFirst({
      where: { id, channel: "WHATSAPP_WEB", ...(await accountManageWhere(session.user.id)) },
    });
    if (!existing) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    const updated = await prisma.channelAccount.update({
      where: { id },
      data: { groupsEnabled: parsed.data.groupsEnabled },
      select: { id: true, groupsEnabled: true },
    });
    if (parsed.data.groupsEnabled) {
      const creds = readGowaCredentials(existing);
      await setDeviceWebhook(creds.deviceId, { webhookUrl: gowaWebhookUrl(existing.id), webhookSecret: creds.webhookSecret })
        .catch((err) => console.error("[gowa] no se pudo actualizar el webhook del device:", err instanceof Error ? err.message : err));
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

// Borrar la cuenta cierra la sesión de WhatsApp y elimina el device en GoWA
// (best effort: si GoWA no responde, la cuenta se borra igual y el device
// huérfano ya no tiene adónde mandar eventos — su webhook responde 404).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;

    const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const { id } = await params;
    const existing = await prisma.channelAccount.findFirst({
      where: { id, channel: "WHATSAPP_WEB", ...(await accountManageWhere(session.user.id)) },
    });
    if (!existing) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    await releaseGowaDevice(existing);
    await prisma.channelAccount.delete({ where: { id } });
    invalidateAccountScopes();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
