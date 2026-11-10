// Soporte por WhatsApp: SUPPORT_WHATSAPP (variable de entorno opcional, solo
// dígitos con lada, p. ej. 5215512345678). Sin ella el botón no aparece.

export function supportWhatsappNumber(raw: string | undefined | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function supportWhatsappUrl(number: string, orgName: string | null | undefined): string {
  const text = `Hola, necesito ayuda con Colibly (org: ${orgName?.trim() || "sin nombre"})`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
