import { processSequenceTick } from "@/lib/sequences";

// Wrapper delgado — toda la lógica real vive en lib/sequences.ts
// (processSequenceTick), compartida por Worker (aquí) e inaccesible
// directamente desde rutas HTTP, mismo criterio que el resto de los ticks
// autogestionados (lead-recovery, lead-scoring, appointment-reminders).
export async function processSequenceTickJob(): Promise<void> {
  await processSequenceTick();
}
