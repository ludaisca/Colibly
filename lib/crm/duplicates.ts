import { emailKey, phoneKey } from "@/lib/crm/normalize";

// Detección PURA de posibles duplicados entre personas de una organización:
// comparten correo o teléfono (52…/521… cuentan como el mismo). Agrupa por
// componentes conexos (A~B y B~C → un solo grupo).

export interface DupPerson {
  id: string;
  name: string;
  email: string | null;
  phoneDigits: string | null;
  createdAt: Date;
}

export interface DuplicateCluster {
  ids: string[];
  reasons: Array<"email" | "phone">;
}

export function personKeys(p: Pick<DupPerson, "email" | "phoneDigits">): string[] {
  const keys: string[] = [];
  const e = emailKey(p.email);
  if (e) keys.push(`email:${e}`);
  const ph = phoneKey(p.phoneDigits);
  if (ph) keys.push(`phone:${ph}`);
  return keys;
}

export function findDuplicateClusters(people: readonly DupPerson[]): DuplicateCluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of people) parent.set(p.id, p.id);

  const byKey = new Map<string, string[]>();
  for (const p of people) {
    for (const k of personKeys(p)) {
      const list = byKey.get(k);
      if (list) list.push(p.id);
      else byKey.set(k, [p.id]);
    }
  }
  const reasonsByRoot = new Map<string, Set<"email" | "phone">>();
  const sharedKeys: Array<{ key: string; ids: string[] }> = [];
  for (const [key, ids] of byKey) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    sharedKeys.push({ key, ids });
  }
  for (const { key, ids } of sharedKeys) {
    const root = find(ids[0]);
    const set = reasonsByRoot.get(root) ?? new Set();
    set.add(key.startsWith("email:") ? "email" : "phone");
    reasonsByRoot.set(root, set);
  }

  const createdAt = new Map(people.map((p) => [p.id, p.createdAt.getTime()] as const));
  const groups = new Map<string, string[]>();
  for (const p of people) {
    const r = find(p.id);
    const list = groups.get(r);
    if (list) list.push(p.id);
    else groups.set(r, [p.id]);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => ({
      // El más antiguo primero: es el candidato natural a conservar.
      ids: ids.sort((a, b) => (createdAt.get(a)! - createdAt.get(b)!) || a.localeCompare(b)),
      reasons: [...(reasonsByRoot.get(root) ?? [])].sort(),
    }))
    .sort((a, b) => b.ids.length - a.ids.length || a.ids[0].localeCompare(b.ids[0]));
}

// Personas existentes que chocan con un correo/teléfono dado (para avisar antes
// de crear un duplicado).
export function matchesByKeys(
  candidate: Pick<DupPerson, "email" | "phoneDigits">,
  existing: readonly DupPerson[]
): Array<{ id: string; reasons: Array<"email" | "phone"> }> {
  const mine = new Set(personKeys(candidate));
  const out: Array<{ id: string; reasons: Array<"email" | "phone"> }> = [];
  for (const p of existing) {
    const shared = personKeys(p).filter((k) => mine.has(k));
    if (shared.length) out.push({ id: p.id, reasons: [...new Set(shared.map((k) => (k.startsWith("email:") ? "email" : "phone") as "email" | "phone"))] });
  }
  return out;
}
