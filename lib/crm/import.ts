import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { CrmError, invalid } from "@/lib/crm/errors";
import { requireRoles, type CrmActor } from "@/lib/crm/access";
import { companyNameKey } from "@/lib/crm/normalize";
import { buildImportPreview, companyNamesToResolve, ImportInputError, type ImportPreview } from "@/lib/crm/import-csv";
import { importSchema } from "@/lib/crm/schemas";

// Importación CSV de contactos: previsualiza (sin escribir) y aplica. Solo
// admin y user. La previsualización devuelve una huella (archivo + mapeo): la
// aplicación exige esa misma huella y la registra, así el mismo archivo no se
// importa dos veces.

async function previewFor(actor: CrmActor, csv: string, mapping: Parameters<typeof buildImportPreview>[1]): Promise<ImportPreview> {
  const existing = await prisma.person.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null, OR: [{ email: { not: null } }, { phoneDigits: { not: null } }] },
    select: { id: true, email: true, phoneDigits: true },
    take: 50_000,
  });
  try {
    return buildImportPreview(csv, mapping, existing);
  } catch (err) {
    if (err instanceof ImportInputError) throw invalid(err.message);
    throw err;
  }
}

export async function previewPeopleImport(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin", "user"]);
  const input = importSchema.parse(raw);
  const preview = await previewFor(actor, input.csv, input.mapping);
  const already = await prisma.importRun.findUnique({
    where: { organizationId_fingerprint: { organizationId: actor.organizationId, fingerprint: preview.fingerprint } },
    select: { id: true },
  });
  return { ...preview, alreadyImported: !!already };
}

export async function applyPeopleImport(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin", "user"]);
  const input = importSchema.parse(raw);
  if (!input.fingerprint) throw invalid("Falta la huella: revisa primero la previsualización");
  const preview = await previewFor(actor, input.csv, input.mapping);
  if (preview.fingerprint !== input.fingerprint) throw invalid("El archivo o el mapeo cambiaron. Vuelve a revisar la previsualización.");

  // Mismo archivo y mapeo ya aplicados: lo dice con claridad (tras importar,
  // todas sus filas serían "duplicadas" y el error sería engañoso).
  const already = await prisma.importRun.findUnique({
    where: { organizationId_fingerprint: { organizationId: actor.organizationId, fingerprint: preview.fingerprint } },
    select: { id: true },
  });
  if (already) throw new CrmError(409, "duplicate_import", "Este archivo ya se importó");

  const ready = preview.rows.filter((r) => r.status === "ready");
  if (!ready.length) throw invalid("No hay filas listas para importar");
  const exceeded = await evaluatePlanLimit(actor.organizationId, "contacts", ready.length);
  if (exceeded) throw new CrmError(402, "plan_limit", exceeded.message, { limit: "contacts", current: exceeded.current, max: exceeded.max });

  const orgId = actor.organizationId;
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.importRun.create({
          data: { organizationId: orgId, userId: actor.userId, fingerprint: preview.fingerprint, summary: preview.counts },
        });

        // Empresas: se reutilizan por nombre (sin distinguir mayúsculas) y se crean las que faltan.
        const companyIds = new Map<string, string>();
        const existingCompanies = await tx.company.findMany({ where: { organizationId: orgId, archivedAt: null }, select: { id: true, name: true } });
        for (const c of existingCompanies) companyIds.set(companyNameKey(c.name)!, c.id);
        const missing = companyNamesToResolve(ready).filter((n) => !companyIds.has(companyNameKey(n)!));
        if (missing.length) {
          const created = missing.map((name) => ({ id: randomUUID(), organizationId: orgId, name }));
          await tx.company.createMany({ data: created });
          await tx.activityLog.createMany({
            data: created.map((c) => ({ organizationId: orgId, actorId: actor.userId, type: "company.created", companyId: c.id, data: { source: "import" } })),
          });
          for (const c of created) companyIds.set(companyNameKey(c.name)!, c.id);
        }

        const people = ready.map((r) => ({
          id: randomUUID(),
          organizationId: orgId,
          name: r.name!,
          email: r.email,
          phone: r.phone,
          phoneDigits: r.phoneDigits,
          jobTitle: r.jobTitle,
          companyId: r.company ? companyIds.get(companyNameKey(r.company)!) ?? null : null,
          source: "import",
        }));
        await tx.person.createMany({ data: people });
        await tx.activityLog.createMany({
          data: people.map((p) => ({ organizationId: orgId, actorId: actor.userId, type: "person.created", personId: p.id, data: { source: "import" } })),
        });
        return { imported: people.length, companiesCreated: missing.length, skipped: { duplicate: preview.counts.duplicate, error: preview.counts.error } };
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CrmError(409, "duplicate_import", "Este archivo ya se importó");
    }
    throw err;
  }
}
