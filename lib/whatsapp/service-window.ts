import { prisma } from "@/lib/prisma";
import { isWithinServiceWindow, SERVICE_WINDOW_MS } from "@/lib/whatsapp/lead-recovery";

export interface ServiceWindowState {
  open: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
}

// Ventana de 24 h de Meta para un chat de WhatsApp: cualquier entrante cuenta,
// también los importados del historial. El llamador ya validó el acceso al chat.
export async function getChatServiceWindow(chatId: string, now = new Date()): Promise<ServiceWindowState> {
  const lastInbound = await prisma.wAMessage.findFirst({
    where: { chatId, direction: "INBOUND" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  return serviceWindowFrom(lastInbound?.timestamp ?? null, now);
}

export function serviceWindowFrom(lastInboundAt: Date | null, now: Date): ServiceWindowState {
  if (!lastInboundAt) return { open: false, lastInboundAt: null, expiresAt: null };
  return {
    open: isWithinServiceWindow(lastInboundAt, now),
    lastInboundAt: lastInboundAt.toISOString(),
    expiresAt: new Date(lastInboundAt.getTime() + SERVICE_WINDOW_MS).toISOString(),
  };
}
