import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { publicErrorMessage } from "@/lib/api-errors";
import { parseCsv } from "@/lib/whatsapp/parse-csv";

const MAX_ROWS = 5000;
const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Importa contactos de WhatsApp o de un canal genérico. El CSV debe traer
// cabecera (teléfono/nombre o phone/name); el parser compartido con campañas
// ya reconoce ambos idiomas. No crea chats: un contacto importado sin
// conversación es válido y aparece en /whatsapp/contactos.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const csv = typeof body?.csv === "string" ? body.csv : "";
    if (!accountId || !csv) {
      return NextResponse.json({ error: "Falta la cuenta o el CSV" }, { status: 400 });
    }
    if (csv.length > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "El CSV supera 2 MB" }, { status: 413 });
    }

    const [waAccountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    const waAccount = waAccountIds.includes(accountId)
      ? await prisma.wAAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true } })
      : null;
    const channelAccount = !waAccount && channelAccountIds.includes(accountId)
      ? await prisma.channelAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true } })
      : null;
    if (!waAccount && !channelAccount) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    const organizationId = waAccount?.organizationId ?? channelAccount!.organizationId;

    const parsed = parseCsv(csv);
    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Máximo ${MAX_ROWS} contactos por importación` }, { status: 400 });
    }

    // Normaliza, descarta teléfonos imposibles y deduplica dentro del archivo.
    const byPhone = new Map<string, { phone: string; name: string | null }>();
    for (const row of parsed.rows) {
      const phone = row.phoneNumber.replace(/\D/g, "");
      if (phone.length < 8 || phone.length > 15) continue;
      if (!byPhone.has(phone)) {
        byPhone.set(phone, { phone, name: row.contactName.trim().slice(0, 200) || null });
      }
    }
    const rows = Array.from(byPhone.values());
    if (rows.length === 0) {
      return NextResponse.json({ error: "El CSV no contiene teléfonos válidos" }, { status: 400 });
    }

    const accountField = waAccount ? { accountId } : { channelAccountId: channelAccount!.id };
    const existing = await prisma.contact.findMany({
      where: { ...accountField, remoteJid: { in: rows.map((row) => row.phone) } },
      select: { remoteJid: true },
    });
    const existingPhones = new Set(existing.map((contact) => contact.remoteJid));
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

    if (newRows.length > 0) {
      await prisma.contact.createMany({
        data: newRows.map((row) => ({
          ...(waAccount ? { accountId } : { channelAccountId: channelAccount!.id }),
          remoteJid: row.phone,
          name: row.name,
          nameSource: row.name ? "user" : null,
          source: "csv_import",
          leadStatus: "NEW" as const,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      totalRows: rows.length,
      imported: newRows.length,
      skipped: rows.length - newRows.length,
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
