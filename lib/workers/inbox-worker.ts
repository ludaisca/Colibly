import { processAutoResolveTick } from "@/lib/inbox/auto-resolve";
import { processAwayMessageJob, type AwayJob } from "@/lib/inbox/away-message";

// Cola `inbox`: un solo worker que enruta por nombre de job. Los jobs nuevos
// de la bandeja (aviso fuera de horario, transcripción…) se agregan aquí.
export async function processInboxJob(name: string, data: unknown): Promise<void> {
  switch (name) {
    case "tick":
      await processAutoResolveTick();
      return;
    case "away-message": {
      const outcome = await processAwayMessageJob(data as AwayJob);
      if (outcome !== "sent" && outcome !== "in_hours" && outcome !== "cooldown") {
        console.log(`[away] ${(data as AwayJob).chatId}: ${outcome}`);
      }
      return;
    }
    default:
      console.warn(`[inbox] job desconocido "${name}"`, data);
  }
}
