import { prisma } from "@/lib/prisma";
import { notifyAccountAdmins } from "./notify";
import { lifecycleActionFor } from "./state";

// Eventos `account_update` que cambian el estado de la CONEXIÓN (no restricciones
// ni baneos, que sigue manejando el webhook principal): el negocio se desconectó,
// cambió de teléfono o se reconectó. Devuelve true si el evento era de este tipo.
export async function applyConnectionLifecycle(
  account: { id: string; organizationId: string; name: string },
  value: { event?: string; disconnection_info?: { reason?: string; initiated_by?: string } } | null | undefined
): Promise<boolean> {
  const action = lifecycleActionFor(value);
  if (action.kind === "none") return false;

  if (action.kind === "disconnect") {
    await prisma.wAAccount.update({
      where: { id: account.id },
      data: { status: "DISCONNECTED", disconnectedReason: action.reason, errorMessage: action.detail },
    });
    await notifyAccountAdmins(account.organizationId, {
      accountId: account.id,
      title: `"${account.name}" se desconectó de Colibly`,
      body: `${action.detail} Vuelve a conectar el número desde Cuentas WhatsApp.`,
    });
  } else if (action.kind === "offboarded") {
    await prisma.wAAccount.update({
      where: { id: account.id },
      data: { status: "ERROR", errorMessage: "La conexión se pausó (cambio de teléfono o reinstalación de la app WhatsApp Business). Se restablece sola si el negocio acepta reconectar al volver a registrar su número." },
    });
    await notifyAccountAdmins(account.organizationId, {
      accountId: account.id,
      title: `"${account.name}": conexión en pausa`,
      body: "El negocio cambió de teléfono o reinstaló la app WhatsApp Business. Colibly se reconectará cuando termine de registrarse.",
    });
  } else {
    await prisma.wAAccount.update({ where: { id: account.id }, data: { status: "CONNECTED", errorMessage: null, disconnectedReason: null } });
    await notifyAccountAdmins(account.organizationId, {
      accountId: account.id,
      title: `"${account.name}" volvió a conectarse`,
      body: "La conexión con WhatsApp se restableció.",
    });
  }
  return true;
}
