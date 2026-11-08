// Hue determinista por entidad (cuentas WhatsApp) — mismo hash *31 que el
// hashTone histórico de chat-workspace, pero sobre las 8 clases .hue-N de
// globals.css en vez de los 5 tonos semánticos de Badge. La clase hue-N solo
// setea --entity/--entity-bg; el color se consume vía las utilidades
// bg-entity / text-entity / bg-entity-bg (responden al toggle light/dark en CSS).
// Nunca interpolar `hue-${n}` — Tailwind v4 sin safelist exige strings literales.

export type HueIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function hueIndex(id: string): HueIndex {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash % 8) as HueIndex;
}

export const HUE_CLASS: Record<HueIndex, string> = {
  0: "hue-0",
  1: "hue-1",
  2: "hue-2",
  3: "hue-3",
  4: "hue-4",
  5: "hue-5",
  6: "hue-6",
  7: "hue-7",
};

export function hueClassFor(id: string): string {
  return HUE_CLASS[hueIndex(id)];
}

// ── Tono por organización sin choques (2026-11-07) ───────────────────────────
// Con el hash solo, dos cuentas de la misma organización podían caer en el
// mismo tono (1/8 por par). `assignAccountHues` recorre las cuentas de la
// organización por antigüedad: cada una conserva el tono de su hash si está
// libre, si no toma el siguiente libre. Agregar una cuenta no cambia el color
// de las existentes; con más de 8 cuentas los tonos se reciclan.

export type AccountHues = Record<string, HueIndex>;

export function assignAccountHues(accounts: { id: string; createdAt: Date | string }[]): AccountHues {
  const ordered = [...accounts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id)
  );
  const used = new Set<number>();
  const out: AccountHues = {};
  for (const account of ordered) {
    if (used.size === 8) used.clear();
    let hue = hueIndex(account.id);
    while (used.has(hue)) hue = ((hue + 1) % 8) as HueIndex;
    used.add(hue);
    out[account.id] = hue;
  }
  return out;
}

/** Clase de tono: la asignada a la cuenta en su organización, o la del hash. */
export function hueClassIn(hues: AccountHues | null | undefined, id: string): string {
  const assigned = hues?.[id];
  return assigned === undefined ? hueClassFor(id) : HUE_CLASS[assigned];
}
