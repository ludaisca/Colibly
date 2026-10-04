import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { removeAccountMedia } from "@/lib/whatsapp/media-store";
import { notifyAccountAdmins } from "@/lib/whatsapp/coexistence/notify";

// Callbacks que Meta exige a las apps de plataforma: desautorización (el usuario
// quitó la app) y eliminación de datos (pidió borrar lo que la app guardó).
// El usuario se identifica con WAAccount.metaUserId, tomado al conectar.

export function newConfirmationCode(): string {
  return randomBytes(12).toString("hex");
}

export type DeletionDecision = "delete" | "none" | "manual_review";

// Salvaguarda: un usuario de Meta pertenece, en la práctica, a UNA organización.
// Si las cuentas que coinciden con ese user_id están repartidas en varias, el id
// no es confiable para borrar (p. ej. si fuera compartido) y no se borra nada:
// la solicitud queda para revisión manual.
export function decideDeletion(accounts: Array<{ organizationId: string }>): DeletionDecision {
  if (accounts.length === 0) return "none";
  return new Set(accounts.map((a) => a.organizationId)).size > 1 ? "manual_review" : "delete";
}

// El usuario quitó la app de Facebook: las cuentas conectadas por él dejan de
// poder usar su acceso. No se borran datos (eso es la otra solicitud).
export async function handleDeauthorization(metaUserId: string): Promise<number> {
  const accounts = await prisma.wAAccount.findMany({
    where: { metaUserId, connectionType: "EMBEDDED_SIGNUP", status: { not: "DISCONNECTED" } },
    select: { id: true, organizationId: true, name: true },
  });
  for (const a of accounts) {
    await prisma.wAAccount.update({
      where: { id: a.id },
      data: { status: "DISCONNECTED", disconnectedReason: "DEAUTHORIZED", errorMessage: "Se quitó el acceso de Colibly desde Facebook. Vuelve a conectar el número para usarlo." },
    });
    await notifyAccountAdmins(a.organizationId, {
      accountId: a.id,
      title: `"${a.name}" se desconectó de Colibly`,
      body: "Se quitó el acceso de Colibly desde la configuración de Facebook. Vuelve a conectar el número desde Cuentas WhatsApp.",
    });
  }
  return accounts.length;
}

// Borra las cuentas de WhatsApp (y todo lo que cuelga de ellas: chats, mensajes,
// contactos, plantillas… por cascada) que conectó ese usuario, y sus medios en
// disco. Deja constancia en MetaDataDeletionRequest para la URL de estado.
export async function handleDataDeletion(metaUserId: string): Promise<{ confirmationCode: string; accountsDeleted: number }> {
  const confirmationCode = newConfirmationCode();
  const request = await prisma.metaDataDeletionRequest.create({ data: { confirmationCode, metaUserId } });

  const accounts = await prisma.wAAccount.findMany({
    where: { metaUserId, connectionType: "EMBEDDED_SIGNUP" },
    select: { id: true, organizationId: true },
  });
  const decision = decideDeletion(accounts);
  if (decision === "manual_review") {
    console.error(`[data-deletion] ${confirmationCode}: el user_id coincide con cuentas de varias organizaciones — no se borró nada, requiere revisión manual`);
    await prisma.metaDataDeletionRequest.update({ where: { id: request.id }, data: { status: "MANUAL_REVIEW" } });
    return { confirmationCode, accountsDeleted: 0 };
  }
  let deleted = 0;
  for (const a of accounts) {
    await prisma.wAAccount.delete({ where: { id: a.id } });
    await removeAccountMedia(a.id).catch((err) => console.error("[data-deletion] no se pudo borrar la media de", a.id, err));
    deleted++;
  }
  await prisma.metaDataDeletionRequest.update({
    where: { id: request.id },
    data: { status: deleted > 0 ? "COMPLETED" : "NO_DATA", accountsDeleted: deleted, completedAt: new Date() },
  });
  return { confirmationCode, accountsDeleted: deleted };
}
