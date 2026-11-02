// Firma personal (F6). Pura: la usan la ruta de envío manual (servidor) y la
// vista previa del compositor (cliente).

export const SIGNATURE_MAX_LENGTH = 100;

/**
 * Texto final con la firma en un renglón aparte. No la agrega si está
 * apagada, vacía, si el mensaje ya termina con ella (el agente la escribió) o
 * si el resultado pasaría el límite del canal.
 */
export function appendSignature(text: string, signature: string | null | undefined, enabled: boolean, maxLength: number): string {
  const sig = (signature ?? "").trim();
  if (!enabled || !sig) return text;
  const body = text.replace(/\s+$/, "");
  if (body.endsWith(sig)) return text;
  const result = `${body}\n\n${sig}`;
  return result.length > maxLength ? text : result;
}
