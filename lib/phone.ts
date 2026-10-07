// Normalización de teléfono compartida por cualquier ingesta que necesite
// usar un número como `remoteJid` de WhatsApp sin haber recibido todavía un
// mensaje real (LeadSheetSource, Instant Forms) — mismo criterio en los dos
// sitios para que no diverjan: solo dígitos, sin "+", espacios ni guiones.
//
// El remoteJid real que un teléfono mexicano usa al escribir por WhatsApp a
// veces difiere en un dígito (el "1" extra tras "52" para móviles) del número
// que llega por otra vía (Instant Form, CSV, API). `normalizePhone` solo limpia
// el formato; la equivalencia 52…/521… la resuelve `jidCandidates` y el punto
// único de alta de contactos (`lib/contacts/resolve.ts`).
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Meta ha usado dos formas para los móviles de México: 52 + 10 dígitos y
// 521 + 10 dígitos. Un mensaje, un eco, un CSV o un Instant Form pueden traer
// una y el chat/contacto existir con la otra; al buscar se prueban ambas.
export function jidCandidates(phoneDigits: string): string[] {
  const d = digitsOnly(phoneDigits);
  if (!d) return [];
  const out = new Set<string>([d]);
  if (/^521\d{10}$/.test(d)) out.add("52" + d.slice(3));
  else if (/^52\d{10}$/.test(d)) out.add("521" + d.slice(2));
  return [...out];
}

// Para mostrar un número en pantalla: "525511110001" → "+52 55 1111 0001".
// Los móviles mexicanos (52… / 521…) llevan formato; cualquier otro número se
// muestra tal cual con su "+".
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  const national = /^521\d{10}$/.test(d) ? d.slice(3) : /^52\d{10}$/.test(d) ? d.slice(2) : null;
  if (national) return `+52 ${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
  return `+${d}`;
}
