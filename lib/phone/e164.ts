// Teléfono en E.164 (`+` + código de país + número, sin espacios) para la API
// pública y los webhooks. Colibly guarda el `wa_id` de Meta tal cual
// (`Contact.remoteJid`, p. ej. "5215512345678") y el número de la cuenta como
// lo muestra Meta ("+52 1 55 1234 5678"); ninguno sirve para cruzar con un CRM.
//
// México: Meta sigue entregando el "1" de móvil antiguo (521 + 10 dígitos) en
// muchos wa_id, pero desde 2019 el número marcable y el E.164 correcto es
// +52 + 10 dígitos. Es la misma equivalencia que usa jidCandidates().
//
// Devuelve null si no parece un teléfono (ids de BSUID, visitantes web…).
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Un wa_id de grupo o un BSUID ("MX.123…") no es un teléfono.
  if (/[a-z]/i.test(raw) || raw.includes("@")) return null;
  const d = raw.replace(/\D/g, "");
  // E.164: hasta 15 dígitos; menos de 8 no es un número internacional completo.
  if (d.length < 8 || d.length > 15) return null;
  if (/^521\d{10}$/.test(d)) return `+52${d.slice(3)}`;
  return `+${d}`;
}
