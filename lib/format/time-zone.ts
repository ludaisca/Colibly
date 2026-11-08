// Nombre legible de una zona horaria IANA (revisión de pantallas, 2026-11-07):
// se mostraba "America/Mexico City". Ciudades de las zonas que ofrece
// Configuración → IA, más el nombre de la zona según Intl para el resto.

const CITY: Record<string, string> = {
  "America/Mexico_City": "Ciudad de México",
  "America/Tijuana": "Tijuana",
  "America/Cancun": "Cancún",
  "America/Guatemala": "Guatemala",
  "America/Costa_Rica": "Costa Rica",
  "America/Panama": "Panamá",
  "America/Bogota": "Bogotá",
  "America/Lima": "Lima",
  "America/Guayaquil": "Guayaquil",
  "America/Caracas": "Caracas",
  "America/La_Paz": "La Paz",
  "America/Santiago": "Santiago de Chile",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/Montevideo": "Montevideo",
  "America/Asuncion": "Asunción",
  "America/Santo_Domingo": "Santo Domingo",
  "America/New_York": "Nueva York",
  "America/Los_Angeles": "Los Ángeles",
  "Europe/Madrid": "Madrid",
};

export function timeZoneLabel(tz: string): string {
  if (CITY[tz]) return CITY[tz];
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return city;
}
