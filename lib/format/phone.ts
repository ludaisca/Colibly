// Teléfono de un remoteJid para mostrarlo corto: "+52 55 6862 3317" (México:
// 52 + 10 dígitos, con o sin el 1 antiguo de móvil) o "+" + dígitos en otros
// países. null si no parece un teléfono (ids de canal, BSUID…).
export function formatPhoneShort(remoteJid: string | null | undefined): string | null {
  if (!remoteJid) return null;
  const raw = remoteJid.replace(/@.*$/, "");
  if (/[a-z]/i.test(raw)) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length < 8 || d.length > 15) return null;
  const mx = d.match(/^52(?:1)?(\d{10})$/);
  if (mx) return `+52 ${mx[1].slice(0, 2)} ${mx[1].slice(2, 6)} ${mx[1].slice(6)}`;
  return `+${d}`;
}
