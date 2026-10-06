import { digitsOnly, jidCandidates } from "@/lib/phone";

// Lógica PURA de identidad de un contacto de WhatsApp (sin base de datos), para
// poder probarla. `lib/contacts/resolve.ts` la usa con lo que encuentra en la base.

// ¿El identificador remoto de WhatsApp es un teléfono (solo dígitos)? Los
// grupos ("…@g.us") y cualquier otra forma no se normalizan.
export function isPhoneJid(remoteJid: string): boolean {
  return /^\d{7,15}$/.test(remoteJid);
}

// Devuelve el identificador con el que debe guardarse/buscarse la persona.
// Si la base ya conoce a esa persona bajo una de las formas equivalentes
// (52… o 521… en México) se usa ESA, para no crear un segundo contacto ni un
// segundo chat; si no, se usa el que llegó. `known` va en orden de prioridad
// (primero el del contacto, luego el del chat).
export function canonicalRemoteJid(raw: string, known: ReadonlyArray<string | null | undefined>): string {
  const clean = raw.trim();
  if (!isPhoneJid(clean)) return clean;
  const candidates = jidCandidates(clean);
  for (const k of known) {
    if (k && candidates.includes(k)) return k;
  }
  return digitsOnly(clean);
}

// Formas equivalentes bajo las que puede estar guardado un identificador, para
// usar en `remoteJid: { in: … }`. Solo los teléfonos se expanden; un grupo
// ("…@g.us") u otro id se busca tal cual (jidCandidates descartaría las letras).
export function remoteJidCandidates(raw: string): string[] {
  const clean = raw.trim();
  return isPhoneJid(clean) ? jidCandidates(clean) : [clean];
}

// ¿Este "nombre" es en realidad el teléfono del contacto (en cualquiera de sus
// formas equivalentes)? Sirve para no tratar "525500000992" como nombre real de
// alguien guardado como "5215500000992": un teléfono nunca pisa un nombre.
export function isPhoneNameOf(name: string | null | undefined, remoteJid: string): boolean {
  if (!name) return false;
  const clean = name.trim();
  return isPhoneJid(clean) && remoteJidCandidates(clean).includes(remoteJid);
}
