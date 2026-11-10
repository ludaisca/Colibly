import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { publicErrorMessage } from "@/lib/api-errors";
import { contactCreateSchema } from "@/lib/validations";
import { normalizeManualPhone, phoneLookupJids } from "@/lib/contacts/manual-phone";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { afterContactCreated } from "@/lib/billing/contact-limits";
import { recordContactActivity } from "@/lib/contacts/activity";
import { requireOrgId } from "@/lib/tenancy";
import { tagBelongsTo } from "@/lib/tags";
import { forbidRoles } from "@/lib/roles";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // El rol "user" tiene /whatsapp/contactos bloqueado en proxy.ts — este 403
    // cierra el acceso directo a la API (defensa en profundidad, mismo patrón
    // que /api/usuarios). El detalle /contacts/[id] queda abierto: lo usa el
    // ContactDrawer desde el chat, que "user" sí puede ver.
    if (session.user.role === "user") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const accountIds = await getUserAccountIds(session.user.id);
    // Los contactos de canales adicionales cuelgan de
    // channelAccountId en vez de accountId — sin esto, un lead que escribe por
    // Telegram genera su Contact pero queda invisible en el CRM.
    const channelAccountIds = await getUserChannelAccountIds(session.user.id);

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const leadStatus = searchParams.get("leadStatus");
    const tagId = searchParams.get("tagId");
    const search = searchParams.get("search");

    if (accountId && !accountIds.includes(accountId) && !channelAccountIds.includes(accountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // El filtro de cuenta recibe un id que puede ser de cualquiera de los dos
    // mundos — se aplica a la columna que corresponda. Va dentro de AND (no
    // como where.OR suelto) porque el filtro de búsqueda de abajo también es
    // un OR: asignar ambos al mismo nivel pisaría el alcance por cuenta y
    // expondría contactos de otros usuarios.
    const scopeFilter = accountId
      ? channelAccountIds.includes(accountId)
        ? { channelAccountId: accountId }
        : { accountId }
      : await contactScopeWhere(session.user.id);

    const andFilters: Record<string, unknown>[] = [scopeFilter];
    if (search) {
      andFilters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { remoteJid: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: Record<string, unknown> = { AND: andFilters };
    if (leadStatus) where.leadStatus = leadStatus;
    if (tagId) where.tags = { some: { tagId } };

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 25, 1), 100);

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true,
          accountId: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          remoteJid: true,
          name: true,
          isSample: true,
          leadStatus: true,
          createdAt: true,
          updatedAt: true,
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          chat: { select: { id: true, unreadCount: true, lastMessageAt: true } },
          conversation: { select: { id: true, unreadCount: true, lastMessageAt: true } },
          _count: { select: { notes: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contact.count({ where }),
    ]);

    // Pie de la tabla (F8): con el MISMO `where` (alcance + filtros), solo si
    // la página lo pide (una vez por cambio de filtros, no por página).
    let summary: { withoutTags: number; withoutConversation: number; withDeal: number; dealValueCents: number } | undefined;
    if (searchParams.get("summary") === "1") {
      const [withoutTags, withoutConversation, deals] = await Promise.all([
        prisma.contact.count({ where: { AND: [where, { tags: { none: {} } }] } }),
        prisma.contact.count({ where: { AND: [where, { chat: { is: null } }, { conversation: { is: null } }] } }),
        prisma.contact.aggregate({ where: { AND: [where, { dealValueCents: { not: null } }] }, _count: { _all: true }, _sum: { dealValueCents: true } }),
      ]);
      summary = { withoutTags, withoutConversation, withDeal: deals._count._all, dealValueCents: deals._sum.dealValueCents ?? 0 };
    }

    // Se aplana a un solo shape (accountId + chat + channel) para que la UI no
    // tenga que ramificar por canal — mismo criterio que GET /api/telegram/chats.
    const items = contacts.map(({ channelAccountId, channelAccount, conversation, ...c }) => ({
      ...c,
      accountId: c.accountId ?? channelAccountId ?? null,
      chat: c.chat ?? conversation,
      // Sin canal (contactos creados a mano antes de conectar WhatsApp): null.
      channel: c.accountId ? ("WHATSAPP" as const) : channelAccount?.channel ?? null,
    }));

    return NextResponse.json({ items, total, page, pageSize, ...(summary ? { summary } : {}) });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Alta manual de un contacto. Con `accountId` (una cuenta de WhatsApp o de un
// canal propia) cuelga de esa cuenta; sin él nace "sin canal", de la
// organización, y se vincula solo al conectar el primer WhatsApp
// (lib/contacts/link-orphans.ts). El teléfono se normaliza (México por defecto)
// y se deduplica dentro del alcance de la persona.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    // Contactos es una sección vedada al rol user.
    const denied = forbidRoles(session, ["user"]);
    if (denied) return denied;

    const parsed = contactCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { name, phone, accountId, tagIds } = parsed.data;

    const jid = normalizeManualPhone(phone);
    if (!jid) return NextResponse.json({ error: "El teléfono no es válido. Escríbelo con lada, por ejemplo +52 55 1234 5678" }, { status: 400 });

    const organizationId = await requireOrgId(session.user.id);
    const [accountIds, channelAccountIds] = await Promise.all([getUserAccountIds(session.user.id), getUserChannelAccountIds(session.user.id)]);

    // Dueño del contacto: una cuenta propia/compartida o, sin cuenta, la organización.
    let owner: { accountId: string | null; channelAccountId: string | null; organizationId: string | null };
    if (accountId) {
      if (accountIds.includes(accountId)) owner = { accountId, channelAccountId: null, organizationId: null };
      else if (channelAccountIds.includes(accountId)) owner = { accountId: null, channelAccountId: accountId, organizationId: null };
      else return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    } else {
      if (session.user.role !== "admin") {
        return NextResponse.json({ error: "Elige la cuenta del contacto o pide a un administrador que lo cree" }, { status: 403 });
      }
      owner = { accountId: null, channelAccountId: null, organizationId };
    }

    // Duplicado dentro del mismo dueño (52… y 521… cuentan como el mismo número).
    const jids = phoneLookupJids(jid);
    const duplicate = await prisma.contact.findFirst({
      where: owner.accountId
        ? { accountId: owner.accountId, remoteJid: { in: jids } }
        : owner.channelAccountId
          ? { channelAccountId: owner.channelAccountId, remoteJid: { in: jids } }
          : { accountId: null, channelAccountId: null, organizationId, remoteJid: { in: jids } },
      select: { id: true, name: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Ya tienes un contacto con ese teléfono", code: "duplicate", id: duplicate.id }, { status: 409 });
    }

    const exceeded = await evaluatePlanLimit(organizationId, "contacts", 1);
    if (exceeded) {
      return NextResponse.json(
        { error: exceeded.message, code: "plan_limit", limit: "contacts", current: exceeded.current, max: exceeded.max, ...(exceeded.actionUrl ? { actionUrl: exceeded.actionUrl, billingUrl: exceeded.actionUrl } : {}) },
        { status: 402 }
      );
    }

    // Etiquetas: solo las del mismo dueño (nunca confiar en un tagId del cliente).
    const tags = tagIds?.length ? await prisma.tag.findMany({ where: { id: { in: tagIds } } }) : [];
    const validTags = tags.filter((t) => tagBelongsTo(t, owner));

    const contact = await prisma.contact.create({
      data: {
        ...owner,
        remoteJid: jid,
        name,
        nameSource: "user",
        source: "manual",
        leadStatus: "NEW",
        ...(validTags.length ? { tags: { create: validTags.map((t) => ({ tagId: t.id })) } } : {}),
      },
      select: { id: true, accountId: true, channelAccountId: true, organizationId: true, remoteJid: true, name: true, leadStatus: true },
    });

    await recordContactActivity({ contactId: contact.id, type: "CONTACT_CREATED", title: "Contacto creado a mano", actorId: session.user.id, metadata: { source: "manual" } });
    if (owner.accountId || owner.channelAccountId) {
      await afterContactCreated(owner.accountId ? { waAccountId: owner.accountId } : { channelAccountId: owner.channelAccountId }, contact.id);
    }

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Ya tienes un contacto con ese teléfono", code: "duplicate" }, { status: 409 });
    }
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
