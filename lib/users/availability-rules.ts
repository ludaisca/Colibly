// Disponibilidad del equipo (benchmark #7). Puro y sin Prisma: lo usan el
// servidor (auto-asignación, panel en vivo) y el cliente (punto de estado).

export type Availability = "ONLINE" | "BUSY" | "OFFLINE";

/** Sin latido en este tiempo, el usuario cuenta como desconectado. */
export const PRESENCE_TIMEOUT_MS = 5 * 60_000;
/** Como mucho una escritura de lastSeenAt por minuto y usuario. */
export const HEARTBEAT_MIN_INTERVAL_MS = 60_000;

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  ONLINE: "En línea",
  BUSY: "Ocupado",
  OFFLINE: "Desconectado",
};

/**
 * La disponibilidad que cuenta: OFFLINE si el usuario lo eligió o si no hay
 * latido reciente (cerró la pestaña, se le apagó la computadora). BUSY se
 * respeta mientras siga conectado.
 */
export function effectiveAvailability(
  user: { availability: Availability; lastSeenAt: Date | string | null },
  now: number
): Availability {
  if (user.availability === "OFFLINE") return "OFFLINE";
  if (!user.lastSeenAt) return "OFFLINE";
  const seen = typeof user.lastSeenAt === "string" ? Date.parse(user.lastSeenAt) : user.lastSeenAt.getTime();
  if (!Number.isFinite(seen) || now - seen > PRESENCE_TIMEOUT_MS) return "OFFLINE";
  return user.availability;
}

/**
 * Candidatos de auto-asignación. Con el interruptor apagado no se toca la
 * lista (comportamiento anterior, aunque nadie esté conectado). Encendido:
 * solo los ONLINE efectivos; puede quedar vacía y entonces el chat no se asigna.
 */
export function filterAssignableCandidates<T extends { id: string; availability: Availability; lastSeenAt: Date | null }>(
  users: T[],
  onlineOnly: boolean,
  now: number
): string[] {
  if (!onlineOnly) return users.map((user) => user.id);
  return users.filter((user) => effectiveAvailability(user, now) === "ONLINE").map((user) => user.id);
}
