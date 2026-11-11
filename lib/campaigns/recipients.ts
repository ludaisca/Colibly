import { normalizeManualPhone } from "@/lib/contacts/manual-phone";

// Destinatarios de una campaña: mismo criterio de teléfono que el alta de
// contactos (México por defecto; 10 dígitos → 52…, 521 + 10 → 52 + 10), sin
// duplicados por número equivalente, y un error claro con la fila del primero
// que no es un teléfono. Puro: lo usan el formulario y POST /api/whatsapp/campaigns.

export interface CampaignRecipientInput {
  phoneNumber: string;
  contactName?: string;
  parameters?: Record<string, string>;
}

export function invalidPhoneMessage(raw: string, row: number): string {
  return `El teléfono “${raw}” de la fila ${row} no es un número válido. Usa 10 dígitos de México o el número con lada, p. ej. 5512345678 o +52 55 1234 5678`;
}

export type NormalizedRecipients<T extends CampaignRecipientInput> =
  | { ok: true; recipients: T[]; duplicates: number }
  | { ok: false; error: string; row: number };

export function normalizeCampaignRecipients<T extends CampaignRecipientInput>(rows: T[]): NormalizedRecipients<T> {
  const seen = new Set<string>();
  const out: T[] = [];
  let duplicates = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = (rows[i].phoneNumber ?? "").trim();
    const jid = normalizeManualPhone(raw);
    if (!jid) return { ok: false, error: invalidPhoneMessage(raw, i + 1), row: i + 1 };
    if (seen.has(jid)) {
      duplicates++;
      continue;
    }
    seen.add(jid);
    out.push({ ...rows[i], phoneNumber: jid });
  }
  return { ok: true, recipients: out, duplicates };
}
