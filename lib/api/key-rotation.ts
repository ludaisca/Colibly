// Rotación de API keys (POST /api/configuracion/api-keys/[id]/rotate). Puro, para probarlo.

/**
 * Hasta cuándo sigue funcionando la key anterior: null = se revoca ya (sin
 * gracia); con gracia, ahora + horas, sin pasar de su vencimiento original.
 */
export function rotationExpiry(currentExpiresAt: Date | null, graceHours: number, now: Date): Date | null {
  if (graceHours <= 0) return null;
  const graceEnd = new Date(now.getTime() + graceHours * 3_600_000);
  return currentExpiresAt && currentExpiresAt < graceEnd ? currentExpiresAt : graceEnd;
}
