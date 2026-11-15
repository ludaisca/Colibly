// Cuentas de todos los canales para el alta de contactos (Contactos y
// "Agregar trato" del embudo): una sola lista; la API resuelve la columna.
export interface ContactAccountOption {
  id: string;
  name: string;
  phoneNumber: string | null;
  channel?: string;
}

const ENDPOINTS = ["whatsapp", "telegram", "messenger", "instagram", "webchat"] as const;
const CHANNEL_NAMES = ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"] as const;

export async function loadContactAccounts(): Promise<ContactAccountOption[]> {
  const results = await Promise.all(ENDPOINTS.map(async (channel) => {
    const res = await fetch(`/api/${channel}/accounts`);
    if (!res.ok) throw new Error("Error al cargar cuentas");
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("Respuesta inválida de cuentas");
    return data as Array<{ id: string; name: string; phoneNumber?: string | null }>;
  }));
  return results.flatMap((rows, index) => rows.map((a) => ({ id: a.id, name: a.name, phoneNumber: a.phoneNumber ?? null, channel: CHANNEL_NAMES[index] })));
}
