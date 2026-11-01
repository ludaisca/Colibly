import { processAutoResolveTick } from "@/lib/inbox/auto-resolve";

// Cola `inbox`: un solo worker que enruta por nombre de job. Los jobs nuevos
// de la bandeja (aviso fuera de horario, transcripción…) se agregan aquí.
export async function processInboxJob(name: string, data: unknown): Promise<void> {
  switch (name) {
    case "tick":
      await processAutoResolveTick();
      return;
    default:
      console.warn(`[inbox] job desconocido "${name}"`, data);
  }
}
