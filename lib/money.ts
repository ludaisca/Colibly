// Montos en centavos de MXN (enteros). Un solo lugar para convertir y
// formatear: el valor del trato (Contact.dealValueCents), los totales del
// tablero de ventas y los reportes.

/** Tope del valor del trato: 20 millones de pesos (cabe en un Int de Postgres en centavos). */
export const DEAL_VALUE_MAX_PESOS = 20_000_000;

const FULL = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const WHOLE = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 });

/** Pesos (con hasta 2 decimales) → centavos enteros, sin errores de coma flotante. */
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

export function centsToPesos(cents: number): number {
  return cents / 100;
}

/**
 * "$12,500.00"; sin centavos ("$12,500") si el monto es entero o se pide
 * `whole`; `compact` para espacios chicos ("$1.2 M").
 */
export function formatMxn(cents: number, opts: { compact?: boolean; whole?: boolean } = {}): string {
  const pesos = cents / 100;
  if (opts.compact && Math.abs(pesos) >= 100_000) return COMPACT.format(pesos);
  if (opts.whole || opts.compact || cents % 100 === 0) return WHOLE.format(pesos);
  return FULL.format(pesos);
}
