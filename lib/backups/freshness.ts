// Frescura del último respaldo, para el monitor externo (/api/health/respaldos).
// Pura y con pruebas: la ruta solo lee la base y llama a esto.

export const BACKUP_MAX_AGE_HOURS = 36; // un día de margen sobre el respaldo diario

export type BackupFreshness = "ok" | "stale" | "never" | "disabled";

export function backupFreshness(opts: { enabled: boolean; lastSuccessAt: Date | null; now: Date; maxAgeHours?: number }): BackupFreshness {
  if (!opts.enabled) return "disabled";
  if (!opts.lastSuccessAt) return "never";
  const ageMs = opts.now.getTime() - opts.lastSuccessAt.getTime();
  return ageMs <= (opts.maxAgeHours ?? BACKUP_MAX_AGE_HOURS) * 60 * 60 * 1000 ? "ok" : "stale";
}
