// Búsqueda de chats por teléfono. El remoteJid guarda solo dígitos (52155…),
// pero la gente escribe «+52 55 1234-5678». Si lo escrito parece un teléfono,
// se compara también por sus dígitos. Lo usan el servidor (lib/chats/query.ts)
// y el filtro instantáneo del cliente: deben coincidir o el cliente oculta lo
// que el servidor encontró.

/** Dígitos de la búsqueda si parece un teléfono (≥ 4 dígitos y nada de letras); si no, null. */
export function phoneDigitsOf(search: string): string | null {
  if (/[^\d\s+().-]/.test(search)) return null;
  const digits = search.replace(/\D/g, "");
  return digits.length >= 4 && digits !== search ? digits : null;
}

/** ¿El handle del chat (remoteJid o externalId) coincide con lo buscado? */
export function handleMatches(handle: string, search: string): boolean {
  if (handle.includes(search)) return true;
  const digits = phoneDigitsOf(search);
  return !!digits && handle.includes(digits);
}
