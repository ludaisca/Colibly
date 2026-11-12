// Duraciones legibles para tiempos de respuesta y de resolución: "3 min",
// "2 h 15 min", "3.9 días". Nunca "5,556 min".

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 24 * 60) {
    const total = Math.round(minutes);
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.round((minutes / (24 * 60)) * 10) / 10;
  return `${days.toLocaleString("es-MX", { maximumFractionDigits: 1 })} ${days === 1 ? "día" : "días"}`;
}
