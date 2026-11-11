// Empujones suaves (sin wizard ni cambios automáticos): cuándo sugerir mover
// leads de la primera etapa y cuándo sugerir crear etiquetas. Puros.

/** Casi todo en la primera etapa (≥ 80 %) o $0 en valor abierto, con un embudo que ya tiene volumen. */
export function shouldNudgeFunnel(input: { openCount: number; firstStageCount: number; openValueCents: number }, minLeads = 10): boolean {
  if (input.openCount < minLeads) return false;
  return input.firstStageCount / input.openCount >= 0.8 || input.openValueCents === 0;
}

/** Hay contactos reales pero ninguna etiqueta real (las de ejemplo no cuentan). */
export function shouldNudgeTags(input: { realContacts: number; realTags: number }, minContacts = 10): boolean {
  return input.realContacts >= minContacts && input.realTags === 0;
}
