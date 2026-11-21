// Portado de Colibly (lib/whatsapp/lead-recovery.ts + service-window.ts), parte pura.
// Ventana de atención de 24 h de Meta: se cuenta desde el ÚLTIMO mensaje
// ENTRANTE del cliente, no desde nuestra última respuesta.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ServiceWindowState {
  open: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
}

export function isWithinServiceWindow(lastInboundAt: Date, now: Date): boolean {
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

export function serviceWindowFrom(lastInboundAt: Date | null, now: Date): ServiceWindowState {
  if (!lastInboundAt) return {open: false, lastInboundAt: null, expiresAt: null};
  return {
    open: isWithinServiceWindow(lastInboundAt, now),
    lastInboundAt: lastInboundAt.toISOString(),
    expiresAt: new Date(lastInboundAt.getTime() + SERVICE_WINDOW_MS).toISOString(),
  };
}
