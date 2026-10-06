import type { PersonLifecycle } from "@prisma/client";

// Reglas PURAS de fusión de dos personas: se conserva la de destino y solo se
// completan sus campos vacíos con los de la otra. Nunca se pisa un dato.

export interface MergeablePerson {
  name: string;
  email: string | null;
  phone: string | null;
  phoneDigits: string | null;
  jobTitle: string | null;
  companyId: string | null;
  ownerId: string | null;
  lifecycle: PersonLifecycle;
  source: string | null;
}

export type MergeResult = { data: Partial<MergeablePerson>; filled: Array<keyof MergeablePerson> };

export function mergePersonFields(target: MergeablePerson, source: MergeablePerson): MergeResult {
  const data: Partial<MergeablePerson> = {};
  const filled: Array<keyof MergeablePerson> = [];
  const fillable: Array<keyof Omit<MergeablePerson, "lifecycle" | "name" | "phoneDigits">> = ["email", "phone", "jobTitle", "companyId", "ownerId", "source"];
  for (const f of fillable) {
    if (target[f] == null && source[f] != null) {
      (data as Record<string, unknown>)[f] = source[f];
      filled.push(f);
    }
  }
  // El teléfono y sus dígitos viajan juntos.
  if (data.phone !== undefined) {
    data.phoneDigits = source.phoneDigits;
    filled.push("phoneDigits");
  }
  // Si cualquiera ya es cliente, la persona fusionada es cliente.
  if (source.lifecycle === "CUSTOMER" && target.lifecycle !== "CUSTOMER") {
    data.lifecycle = "CUSTOMER";
    filled.push("lifecycle");
  }
  return { data, filled };
}

// Cambios entre dos estados de una persona/empresa, para el historial.
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: ReadonlyArray<keyof T>): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (a !== b) out[String(f)] = [a, b];
  }
  return out;
}
