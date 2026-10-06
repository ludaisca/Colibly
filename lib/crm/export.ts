import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { requireRoles, type CrmActor } from "@/lib/crm/access";
import { buildPeopleWhere } from "@/lib/crm/people";
import { peopleFiltersSchema } from "@/lib/crm/schemas";

const EXPORT_MAX = 50_000;
const PAGE = 500;

// Exporta a CSV los contactos que cumplen los filtros (los mismos del listado).
// Solo admin y user. Neutraliza celdas que Excel interpretaría como fórmula.
const safeCell = (v: string | null | undefined) => {
  const s = v ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export async function exportPeopleCsv(actor: CrmActor, rawFilters: unknown): Promise<{ csv: string; rows: number; truncated: boolean }> {
  requireRoles(actor, ["admin", "user"]);
  const where = await buildPeopleWhere(actor, peopleFiltersSchema.parse(rawFilters));
  const rows: string[][] = [];
  for (let cursor: string | undefined; rows.length < EXPORT_MAX; ) {
    const page = await prisma.person.findMany({
      where,
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        jobTitle: true,
        lifecycle: true,
        source: true,
        createdAt: true,
        company: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });
    if (!page.length) break;
    for (const p of page) {
      rows.push([
        safeCell(p.name),
        safeCell(p.email),
        safeCell(p.phone),
        safeCell(p.jobTitle),
        safeCell(p.company?.name),
        safeCell(p.owner?.name),
        p.lifecycle === "CUSTOMER" ? "Cliente" : "Prospecto",
        safeCell(p.source),
        p.createdAt.toISOString(),
      ]);
    }
    cursor = page[page.length - 1].id;
    if (page.length < PAGE) break;
  }
  const csv = toCsv(["Nombre", "Correo", "Teléfono", "Cargo", "Empresa", "Responsable", "Ciclo de vida", "Origen", "Creado"], rows);
  return { csv, rows: rows.length, truncated: rows.length >= EXPORT_MAX };
}
