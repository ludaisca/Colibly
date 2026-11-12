// Cifras cortas para ejes de gráficas: "950", "1.2k", "8k", "12k", "1.5M".
// (Intl con notation "compact" en es-MX da "8 mil", demasiado ancho para un eje.)

function trimmed(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, "");
}

export function compactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.round(value));
  if (abs < 1_000_000) return `${trimmed(value / 1000, abs < 10_000 ? 1 : 0)}k`;
  return `${trimmed(value / 1_000_000, abs < 10_000_000 ? 1 : 0)}M`;
}

/** Ancho (px) del eje Y para que quepa la etiqueta más larga con fuente de 11 px. */
export function yAxisWidth(maxValue: number): number {
  return Math.max(28, 10 + compactCount(maxValue).length * 7);
}
