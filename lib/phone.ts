// Normalización de teléfono compartida por cualquier ingesta que necesite
// usar un número como `remoteJid` de WhatsApp sin haber recibido todavía un
// mensaje real (LeadSheetSource, Instant Forms) — mismo criterio en los dos
// sitios para que no diverjan: solo dígitos, sin "+", espacios ni guiones.
//
// Nota conocida (no resuelta aquí, ver plan de Fase 1 / comentario en
// Contact.metaAdsAccountId): el remoteJid real que un teléfono mexicano usa al
// escribir por WhatsApp a veces difiere en un dígito (el "1" extra tras "52"
// para móviles) del número que Meta reporta en un Instant Form. Esta función
// no intenta adivinar esa variante — un merge de duplicados queda fuera de
// alcance de esta fase.
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}
