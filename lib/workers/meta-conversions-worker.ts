import { sendLeadConversionEvent } from "@/lib/meta/send-conversion";

interface MetaConversionsJobData {
  dealId: string;
  stageId: string;
}

// Worker delgado — toda la lógica de negocio vive en
// lib/meta/send-conversion.ts, mismo patrón que lead-scoring-worker.ts/
// lib/whatsapp/lead-scoring.ts.
export async function processMetaConversionsJob(data: MetaConversionsJobData): Promise<void> {
  // Jobs encolados antes del giro a negocios traían {contactId, leadStatus}.
  if (!data.dealId || !data.stageId) return;
  await sendLeadConversionEvent(data.dealId, data.stageId);
}
