// Equipos: reglas puras (sin base), probadas en __tests__/rules.test.ts.

export const TEAM_NAME_MAX = 50;
export const TEAMS_PER_ORG_MAX = 50;

/**
 * Candidatos de la autoasignación para un chat con equipo: solo quienes son
 * del equipo y además podían recibirlo (elegibles para la cuenta, en línea si
 * la cuenta lo pide). Sin equipo, todos los candidatos. Un equipo sin nadie
 * disponible deja el chat sin asignar (lo ve el equipo en "Mis equipos"):
 * mandarlo a otra persona fuera del equipo rompería el enrutamiento.
 */
export function teamCandidateIds(candidateIds: string[], teamMemberIds: string[] | null): string[] {
  if (teamMemberIds === null) return candidateIds;
  const members = new Set(teamMemberIds);
  return candidateIds.filter((id) => members.has(id));
}

/** Nombre normalizado (espacios colapsados); null si queda vacío o es muy largo. */
export function normalizeTeamName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > TEAM_NAME_MAX) return null;
  return name;
}
