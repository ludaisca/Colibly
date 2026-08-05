import type { LeadStatus } from "@prisma/client";
import { sendLeadConversionEvent } from "@/lib/meta/send-conversion";

interface MetaConversionsJobData {
  contactId: string;
  leadStatus: LeadStatus;
}

// Worker delgado — toda la lógica de negocio vive en
// lib/meta/send-conversion.ts, mismo patrón que lead-scoring-worker.ts/
// lib/whatsapp/lead-scoring.ts.
export async function processMetaConversionsJob(data: MetaConversionsJobData): Promise<void> {
  await sendLeadConversionEvent(data.contactId, data.leadStatus);
}
