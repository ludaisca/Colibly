import { decrypt } from "@/lib/crypto";
import { getDisplayNameStatus } from "@/lib/whatsapp";

const APPROVED_TTL_MS = 60 * 60 * 1000;
const NOT_APPROVED_TTL_MS = 2 * 60 * 1000;
// Un fallo de red no es un estado del nombre: se recuerda poco para no
// consultar a Meta en cada envío, pero menos que un estado real.
const UNKNOWN_TTL_MS = 30 * 1000;

export type DisplayNameState = "approved" | "not_approved" | "unknown";

const cache = new Map<string, { state: DisplayNameState; expiresAt: number }>();

function ttlFor(state: DisplayNameState): number {
  if (state === "approved") return APPROVED_TTL_MS;
  if (state === "not_approved") return NOT_APPROVED_TTL_MS;
  return UNKNOWN_TTL_MS;
}

// Citar exige `name_status = APPROVED` (Meta responde 131037 si no). Un error
// al consultarlo NO demuestra que el nombre esté pendiente: se devuelve
// "unknown" y el envío sigue su curso, porque Meta rechazará el mensaje con un
// motivo concreto si de verdad no está aprobado. Antes cualquier timeout (o un
// 500 de Graph) se leía como "no aprobado", bloqueaba toda la conversación y
// culpaba al nombre para mostrar.
export async function getDisplayNameState(account: {
  phoneNumberId: string | null;
  accessToken: string | null;
}): Promise<DisplayNameState> {
  if (!account.phoneNumberId || !account.accessToken) return "unknown";
  const hit = cache.get(account.phoneNumberId);
  if (hit && hit.expiresAt > Date.now()) return hit.state;

  let state: DisplayNameState;
  try {
    const status = await getDisplayNameStatus(account.phoneNumberId, decrypt(account.accessToken));
    state = status === null ? "unknown" : status === "APPROVED" ? "approved" : "not_approved";
  } catch (error) {
    console.warn(
      "[whatsapp] no se pudo leer name_status; se permite enviar y Meta decidirá",
      error instanceof Error ? error.message : error
    );
    state = "unknown";
  }
  cache.set(account.phoneNumberId, { state, expiresAt: Date.now() + ttlFor(state) });
  return state;
}
