import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { deleteWebhook } from "@/lib/telegram";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";
import { invalidateAccountScopes } from "@/lib/shared-accounts";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Mismo criterio que POST /api/telegram/accounts: "ejecutivo" tiene la
    // página bloqueada en proxy.ts, este 403 cierra la API directa.
    if (session.user.role === "ejecutivo") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;

    const existing = await prisma.channelAccount.findFirst({
      where: { id, ...(await accountManageWhere(session.user.id)) },
    });
    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // Best-effort: si Telegram no responde (token revocado, red caída) igual
    // se elimina la cuenta local — dejar el registro colgado sería peor que
    // dejar un webhook apuntando a un accountId que ya no existe, que de
    // todas formas responde 404.
    try {
      const { botToken } = JSON.parse(decrypt(existing.credentials)) as { botToken: string };
      await deleteWebhook(botToken);
    } catch (err) {
      console.error("[telegram] No se pudo desregistrar el webhook al eliminar la cuenta:", err);
    }

    await prisma.channelAccount.delete({ where: { id } });
    invalidateAccountScopes();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
