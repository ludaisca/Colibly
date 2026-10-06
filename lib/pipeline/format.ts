// Importes y tiempos del pipeline.

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// "hace 3 d", "hace 2 h" — tiempo que lleva el negocio en su etapa.
export function timeInStage(since: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - new Date(since).getTime());
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "hace minutos";
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
