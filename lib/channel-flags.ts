import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Canales adicionales a WhatsApp. Están habilitados por defecto desde el alta
// (el usuario conecta cada uno con sus credenciales); el operador puede
// desactivarlos por organización desde /plataforma como medida de excepción
// (Organization.channel*Enabled). Desactivar un canal ya en uso NO apaga las
// cuentas existentes (siguen recibiendo/enviando) — solo bloquea crear cuentas
// nuevas de ese canal.
export type FeatureChannel = "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";

const FIELD: Record<FeatureChannel, "channelTelegramEnabled" | "channelMessengerEnabled" | "channelInstagramEnabled" | "channelWebchatEnabled"> = {
  TELEGRAM: "channelTelegramEnabled",
  MESSENGER: "channelMessengerEnabled",
  INSTAGRAM: "channelInstagramEnabled",
  WEBCHAT: "channelWebchatEnabled",
};

export async function isChannelEnabled(organizationId: string, channel: FeatureChannel): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { [FIELD[channel]]: true },
  });
  return !!org?.[FIELD[channel]];
}

// Para las rutas POST .../accounts de cada canal — mismo patrón que
// checkPlanLimit() (lib/billing/gates.ts): devuelve la respuesta 403 lista
// para retornar, o null si puede seguir.
export async function assertChannelEnabled(organizationId: string, channel: FeatureChannel): Promise<NextResponse | null> {
  if (await isChannelEnabled(organizationId, channel)) return null;
  return NextResponse.json(
    { error: "Este canal está desactivado para tu organización. Escríbenos si necesitas reactivarlo.", code: "channel_disabled" },
    { status: 403 }
  );
}
