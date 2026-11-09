/** "12 de noviembre de 2026" desde AAAA-MM-DD, sin depender de la zona horaria. */
export function formatPostDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
