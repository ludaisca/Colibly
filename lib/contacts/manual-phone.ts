import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";

// Teléfonos escritos a mano o traídos de un CSV → el `remoteJid` con el que se
// guardan los contactos creados en Colibly (solo dígitos, como el wa_id de
// Meta). México por defecto: un número de 10 dígitos es +52; el "521" antiguo
// de móvil se lleva a 52 + 10 dígitos. Así "5512345678", "+52 55 1234 5678",
// "52 55 1234 5678" y "5215512345678" son el mismo contacto.
export function normalizeManualPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/[a-z@]/i.test(raw)) return null;
  let d = raw.replace(/\D/g, "");
  if (/^521\d{10}$/.test(d)) d = "52" + d.slice(3);
  else if (/^\d{10}$/.test(d)) d = "52" + d;
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

/** Formas equivalentes del mismo número para buscar duplicados (52… y 521…). */
export function phoneLookupJids(jid: string): string[] {
  return jidCandidates(jid);
}

/**
 * Filas de un CSV importado SIN canal: normaliza cada teléfono como el alta
 * manual, descarta los que no son teléfono y deja la primera aparición de cada
 * número (52… y 521… y 10 dígitos cuentan como el mismo).
 */
export function normalizeChannellessRows<T extends { phone: string }>(rows: T[]): T[] {
  const byJid = new Map<string, T>();
  for (const row of rows) {
    const jid = normalizeManualPhone(row.phone);
    if (jid && !byJid.has(jid)) byJid.set(jid, { ...row, phone: jid });
  }
  return [...byJid.values()];
}
