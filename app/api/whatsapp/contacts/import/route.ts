import { NextResponse, after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { publicErrorMessage } from "@/lib/api-errors";
import { parseCsvTable } from "@/lib/whatsapp/parse-csv";
import { MAX_IMPORT_ROWS, MAX_IMPORT_TAGS, buildImportPlan, guessMapping, mappingError, type ColumnTarget, type FieldDefinition } from "@/lib/contacts/import-mapping";
import { findOrCreateTag } from "@/lib/tags";
import { normalizeChannellessRows, phoneLookupJids } from "@/lib/contacts/manual-phone";
import { requireOrgId } from "@/lib/tenancy";
import { afterContactTagAdded } from "@/lib/contacts/side-effects";
import { forbidRoles } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import { BACKGROUND_EVENT_PRIORITY, emitDomainEvent } from "@/lib/events/emit";
import type { AccountRef } from "@/lib/events/types";

const MAX_ROWS = MAX_IMPORT_ROWS;
const mappingSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("phone") }),
    z.object({ kind: z.literal("name") }),
    z.object({ kind: z.literal("tag") }),
    z.object({ kind: z.literal("field"), definitionId: z.string().min(1).max(64) }),
    z.object({ kind: z.literal("ignore") }),
  ])
).max(100);
const MAX_CSV_BYTES = 2 * 1024 * 1024;
// Mismo espaciado que la importación del historial de coexistencia: un
// contact.created por contacto, en prioridad baja para no frenar los eventos
// en vivo de la organización.
const IMPORT_EVENT_SPACING_MS = 200;

// Importa contactos de WhatsApp o de un canal genérico. El CSV trae cabecera;
// `mapping` (F3) dice qué es cada columna: teléfono, nombre, etiqueta (una o
// varias separadas por ; o |), un campo personalizado de ESA cuenta o
// ignorar. Sin mapping se propone uno por los nombres de cabecera
// (comportamiento anterior). Etiquetas y campos se aplican solo a contactos
// nuevos; los que ya existían se omiten igual que antes. No crea chats.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Contactos es una sección vedada al rol user (USER_BLOCKED + 403 en
    // GET /api/whatsapp/contacts); importar tampoco puede quedar abierto.
    const denied = forbidRoles(session, ["user"]);
    if (denied) return denied;

    const { allowed } = await rateLimit(`contacts-import:${session.user.id}`, 10, 60 * 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas importaciones, intenta más tarde" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const csv = typeof body?.csv === "string" ? body.csv : "";
    if (!csv) {
      return NextResponse.json({ error: "Falta el CSV" }, { status: 400 });
    }
    if (csv.length > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "El CSV supera 2 MB" }, { status: 413 });
    }

    const [waAccountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    // Sin cuenta: contactos "sin canal" de la organización (solo admin); se
    // vinculan al conectar el primer WhatsApp. Los campos personalizados son por
    // cuenta, así que aquí no aplican.
    const channelless = !accountId;
    if (channelless && session.user.role !== "admin") {
      return NextResponse.json({ error: "Elige la cuenta destino o pide a un administrador que importe sin canal" }, { status: 403 });
    }

    const waAccount = waAccountIds.includes(accountId)
      ? await prisma.wAAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true } })
      : null;
    const channelAccount = !waAccount && channelAccountIds.includes(accountId)
      ? await prisma.channelAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true, channel: true } })
      : null;
    if (!channelless && !waAccount && !channelAccount) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    const organizationId = channelless ? await requireOrgId(session.user.id) : (waAccount?.organizationId ?? channelAccount!.organizationId);

    const table = parseCsvTable(csv);
    if (table.rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Máximo ${MAX_ROWS} contactos por importación` }, { status: 400 });
    }

    // Definiciones de campos de ESTA cuenta: un definitionId ajeno no existe aquí.
    const definitions: FieldDefinition[] = await prisma.contactCustomFieldDefinition.findMany({
      where: waAccount ? { waAccountId: waAccount.id } : { channelAccountId: channelAccount?.id ?? "__none__" },
      select: { id: true, key: true, label: true, type: true, options: true },
    });
    let mapping: ColumnTarget[];
    if (body?.mapping !== undefined) {
      const parsedMapping = mappingSchema.safeParse(body.mapping);
      if (!parsedMapping.success || parsedMapping.data.length !== table.headers.length) {
        return NextResponse.json({ error: "El mapeo de columnas no coincide con el archivo" }, { status: 400 });
      }
      mapping = parsedMapping.data;
      const defIds = new Set(definitions.map((d) => d.id));
      if (mapping.some((m) => m.kind === "field" && !defIds.has(m.definitionId))) {
        return NextResponse.json({ error: "Un campo personalizado no pertenece a esta cuenta" }, { status: 400 });
      }
    } else {
      mapping = guessMapping(table.headers, definitions);
    }
    const invalidMapping = mappingError(mapping);
    if (invalidMapping) return NextResponse.json({ error: invalidMapping }, { status: 400 });

    // Normaliza, descarta teléfonos imposibles, deduplica y valida campos.
    const plan = buildImportPlan(table, mapping, definitions);
    if (plan.tagNames.length > MAX_IMPORT_TAGS) {
      return NextResponse.json({ error: `Máximo ${MAX_IMPORT_TAGS} etiquetas distintas por importación` }, { status: 400 });
    }
    // Sin canal el teléfono se normaliza como en el alta manual (México por defecto).
    const rows = channelless ? normalizeChannellessRows(plan.rows) : plan.rows;
    if (rows.length === 0) {
      return NextResponse.json({ error: "El CSV no contiene teléfonos válidos" }, { status: 400 });
    }

    const accountField = channelless
      ? { accountId: null, channelAccountId: null, organizationId }
      : waAccount ? { accountId } : { channelAccountId: channelAccount!.id };
    const lookupJids = channelless ? rows.flatMap((row) => phoneLookupJids(row.phone)) : rows.map((row) => row.phone);
    const existing = await prisma.contact.findMany({
      where: { ...accountField, remoteJid: { in: lookupJids } },
      select: { remoteJid: true },
    });
    const existingPhones = new Set(existing.flatMap((contact) => (channelless ? phoneLookupJids(contact.remoteJid) : [contact.remoteJid])));
    const newRows = rows.filter((row) => !existingPhones.has(row.phone));

    const exceeded = await evaluatePlanLimit(organizationId, "contacts", newRows.length);
    if (exceeded) {
      return NextResponse.json(
        {
          error: exceeded.message,
          code: "plan_limit",
          limit: "contacts",
          current: exceeded.current,
          max: exceeded.max,
          ...(exceeded.actionUrl ? { actionUrl: exceeded.actionUrl, billingUrl: exceeded.actionUrl } : {}),
        },
        { status: 402 }
      );
    }

    // skipDuplicates: un contacto creado en paralelo (otra importación, un
    // entrante) no cuenta como importado ni genera evento.
    let imported = 0;
    if (newRows.length > 0) {
      const created = await prisma.contact.createManyAndReturn({
        data: newRows.map((row) => ({
          ...(channelless ? { organizationId } : waAccount ? { accountId } : { channelAccountId: channelAccount!.id }),
          remoteJid: row.phone,
          name: row.name,
          nameSource: row.name ? "user" : null,
          source: "csv_import",
          leadStatus: "NEW" as const,
        })),
        skipDuplicates: true,
        select: { id: true, remoteJid: true },
      });
      imported = created.length;

      // Etiquetas y campos de los contactos recién creados.
      const owner = channelless
        ? { accountId: null, channelAccountId: null, organizationId }
        : waAccount ? { accountId, channelAccountId: null } : { accountId: null, channelAccountId: channelAccount!.id };
      const rowByPhone = new Map(newRows.map((row) => [row.phone, row]));
      const tagIdByName = new Map<string, { id: string; name: string }>();
      for (const name of plan.tagNames) tagIdByName.set(name, await findOrCreateTag(owner, name));
      const contactTags = created.flatMap((contact) =>
        (rowByPhone.get(contact.remoteJid)?.tags ?? []).map((name) => ({ contactId: contact.id, tag: tagIdByName.get(name)! }))
      );
      if (contactTags.length) {
        await prisma.contactTag.createMany({ data: contactTags.map(({ contactId, tag }) => ({ contactId, tagId: tag.id })), skipDuplicates: true });
      }
      const fieldValues = created.flatMap((contact) =>
        Object.entries(rowByPhone.get(contact.remoteJid)?.fields ?? {}).map(([definitionId, value]) => ({ contactId: contact.id, definitionId, value }))
      );
      if (fieldValues.length) await prisma.contactCustomFieldValue.createMany({ data: fieldValues, skipDuplicates: true });
      // tag.added + secuencias por etiqueta, después de responder (pueden ser miles).
      if (contactTags.length) {
        after(async () => {
          for (const { contactId, tag } of contactTags) {
            await afterContactTagAdded(contactId, tag).catch((err) => console.error("[contacts/import] afterContactTagAdded", err));
          }
        });
      }

      // Sin canal no hay a quién avisar: ni eventos ni webhooks hasta vincularlos.
      const account: AccountRef | null = channelless ? null : waAccount
        ? { kind: "whatsapp", id: waAccount.id }
        : { kind: "channel", id: channelAccount!.id, channel: channelAccount!.channel };
      if (account) await Promise.all(created.map((contact, index) =>
        emitDomainEvent(
          { type: "contact.created", account, chat: null, contactId: contact.id, data: { origin: "ORGANIC", source: "import" } },
          new Date(),
          { priority: BACKGROUND_EVENT_PRIORITY, delayMs: index * IMPORT_EVENT_SPACING_MS }
        )
      ));
    }

    return NextResponse.json({
      totalRows: rows.length,
      imported,
      skipped: rows.length - imported,
      duplicatesInFile: plan.duplicatesInFile,
      issueCount: plan.issues.length,
      issues: plan.issues.slice(0, 20),
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
