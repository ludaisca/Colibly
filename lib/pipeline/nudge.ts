// Empujones suaves (sin wizard ni cambios automáticos): leads detenidos en la
// primera etapa del embudo y contactos sin etiquetas. Puros. Se calculan con
// conteos de la base, así que aparecen igual en una cuenta vacía que en una
// con miles de leads (la versión anterior pedía ≥ 80 % en la primera etapa o
// cero etiquetas en toda la organización: en una cuenta trabajada nunca salía).

/** Horas en la primera etapa a partir de las cuales un lead cuenta como detenido. */
export const STALE_FIRST_STAGE_HOURS = 24;

/** Instante antes del cual entrar a la etapa significa "detenido". */
export function staleCutoff(now: Date, hours = STALE_FIRST_STAGE_HOURS): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

/** Más de la mitad de los contactos (reales) no tiene ninguna etiqueta. */
export function shouldNudgeUntagged(input: { total: number; withoutTags: number }, minContacts = 5): boolean {
  if (input.total < minContacts) return false;
  return input.withoutTags / input.total > 0.5;
}

/**
 * Clave de `localStorage` para "ya cerré este aviso hoy": por aviso, persona y
 * día (en la zona del navegador). Al día siguiente vuelve a salir si sigue
 * aplicando.
 */
export function nudgeDismissKey(id: string, userId: string, now: Date): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `colibly:nudge:${id}:${userId}:${day}`;
}
