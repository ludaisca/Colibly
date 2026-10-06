import { prisma } from "@/lib/prisma";

// Exportación completa de los datos de una organización (portabilidad: el
// cliente se puede llevar su información antes de cancelar o de eliminar la
// cuenta). Un solo documento JSON que se genera en streaming por páginas, así
// una organización con muchos mensajes no se carga entera en memoria.
//
// Nunca incluye secretos: ni tokens ni App Secret de las cuentas, ni hashes de
// contraseña, ni API keys. Los archivos de media no van (solo sus metadatos):
// el JSON describe el mensaje y su nombre de archivo.

const PAGE = 200;

export async function* exportOrganizationData(organizationId: string): AsyncGenerator<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      timezone: true,
      currency: true,
      businessHourStart: true,
      businessHourEnd: true,
      createdAt: true,
      members: { select: { id: true, name: true, email: true, role: true, createdAt: true, disabledAt: true }, orderBy: { createdAt: "asc" } },
      waAccounts: { select: { id: true, name: true, phoneNumber: true, status: true, createdAt: true } },
      channelAccounts: { select: { id: true, channel: true, name: true, status: true, createdAt: true } },
    },
  });
  const { members, waAccounts, channelAccounts, ...organization } = org;
  const waIds = waAccounts.map((a) => a.id);
  const channelIds = channelAccounts.map((a) => a.id);

  yield `{"format":"colibly-export-v1","exportedAt":${JSON.stringify(new Date())}`;
  yield `,"organization":${JSON.stringify(organization)}`;
  yield `,"users":${JSON.stringify(members)}`;
  yield `,"stickers":${JSON.stringify(await prisma.wASticker.findMany({ where: { organizationId }, select: { id: true, name: true, animated: true, favorite: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }))}`;
  yield `,"accounts":${JSON.stringify([
    ...waAccounts.map((a) => ({ ...a, channel: "WHATSAPP" })),
    ...channelAccounts,
  ])}`;

  // Directorio: empresas y personas (los "contactos" de la interfaz). Cada
  // identidad de canal de la sección siguiente referencia a su persona (`personId`).
  yield `,"companies":[`;
  let firstCompany = true;
  for (let cursor: string | undefined; ; ) {
    const page = await prisma.company.findMany({
      where: { organizationId },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, name: true, domain: true, industry: true, size: true, location: true, notes: true, archivedAt: true, createdAt: true, owner: { select: { email: true } } },
    });
    for (const c of page) {
      const { owner, ...rest } = c;
      yield (firstCompany ? "" : ",") + JSON.stringify({ ...rest, owner: owner?.email ?? null });
      firstCompany = false;
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  yield "]";
  yield `,"people":[`;
  let firstPerson = true;
  for (let cursor: string | undefined; ; ) {
    const page = await prisma.person.findMany({
      where: { organizationId },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        jobTitle: true,
        companyId: true,
        lifecycle: true,
        source: true,
        archivedAt: true,
        createdAt: true,
        owner: { select: { email: true } },
      },
    });
    for (const p of page) {
      const { owner, ...rest } = p;
      yield (firstPerson ? "" : ",") + JSON.stringify({ ...rest, owner: owner?.email ?? null });
      firstPerson = false;
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  yield "]";

  // Pipelines (con sus etapas), motivos de pérdida y negocios con el historial
  // de movimientos entre etapas.
  yield `,"pipelines":${JSON.stringify(
    await prisma.pipeline.findMany({
      where: { organizationId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        isDefault: true,
        autoCreateDeals: true,
        archivedAt: true,
        stages: { orderBy: { position: "asc" }, select: { id: true, name: true, position: true, outcome: true, probability: true, metaEvent: true, autoTaskTitle: true, autoTaskDueDays: true } },
      },
    })
  )}`;
  yield `,"lossReasons":${JSON.stringify(await prisma.lossReason.findMany({ where: { organizationId }, orderBy: { position: "asc" }, select: { id: true, name: true, archivedAt: true } }))}`;
  yield `,"deals":[`;
  let firstDeal = true;
  for (let cursor: string | undefined; ; ) {
    const page = await prisma.deal.findMany({
      where: { organizationId },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        title: true,
        amount: true,
        probability: true,
        expectedCloseDate: true,
        status: true,
        pipelineId: true,
        stageId: true,
        personId: true,
        companyId: true,
        contactId: true,
        lostReasonId: true,
        lossNote: true,
        leadOrigin: true,
        adId: true,
        source: true,
        stageEnteredAt: true,
        closedAt: true,
        archivedAt: true,
        createdAt: true,
        owner: { select: { email: true } },
        stageChanges: {
          orderBy: { createdAt: "asc" },
          select: { fromStageName: true, toStageName: true, toStatus: true, secondsInFrom: true, createdAt: true, actor: { select: { email: true } } },
        },
      },
    });
    for (const d of page) {
      const { owner, stageChanges, ...rest } = d;
      yield (firstDeal ? "" : ",") +
        JSON.stringify({
          ...rest,
          amount: Number(d.amount),
          owner: owner?.email ?? null,
          stageChanges: stageChanges.map(({ actor, ...c }) => ({ ...c, actor: actor?.email ?? null })),
        });
      firstDeal = false;
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  yield "]";

  // Tareas (con a qué persona, empresa o negocio pertenecen).
  yield `,"tasks":[`;
  let firstTask = true;
  for (let cursor: string | undefined; ; ) {
    const page = await prisma.task.findMany({
      where: { organizationId },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        title: true,
        notes: true,
        kind: true,
        status: true,
        dueAt: true,
        completedAt: true,
        source: true,
        personId: true,
        companyId: true,
        dealId: true,
        createdAt: true,
        assignee: { select: { email: true } },
        completedBy: { select: { email: true } },
      },
    });
    for (const t of page) {
      const { assignee, completedBy, ...rest } = t;
      yield (firstTask ? "" : ",") + JSON.stringify({ ...rest, assignee: assignee?.email ?? null, completedBy: completedBy?.email ?? null });
      firstTask = false;
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  yield "]";

  // Contactos con etiquetas, campos personalizados, notas y citas.
  yield `,"contacts":[`;
  let first = true;
  for (let cursor: string | undefined; ; ) {
    const page = await prisma.contact.findMany({
      where: { OR: [{ accountId: { in: waIds } }, { channelAccountId: { in: channelIds } }] },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        personId: true,
        accountId: true,
        channelAccountId: true,
        remoteJid: true,
        name: true,
        realName: true,
        leadOrigin: true,
        optedOutMarketing: true,
        createdAt: true,
        tags: { select: { tag: { select: { name: true } } } },
        customFieldValues: { select: { value: true, definition: { select: { key: true, label: true } } } },
        notes: { select: { body: true, createdAt: true, author: { select: { email: true } } }, orderBy: { createdAt: "asc" } },
        appointments: {
          select: { title: true, notes: true, scheduledAt: true, durationMinutes: true, status: true, source: true, cancelReason: true, createdAt: true },
          orderBy: { scheduledAt: "asc" },
        },
      },
    });
    for (const c of page) {
      const { tags, customFieldValues, notes, ...rest } = c;
      const row = {
        ...rest,
        tags: tags.map((t) => t.tag.name),
        customFields: customFieldValues.map((v) => ({ key: v.definition.key, label: v.definition.label, value: v.value })),
        notes: notes.map((n) => ({ body: n.body, author: n.author.email, createdAt: n.createdAt })),
      };
      yield (first ? "" : ",") + JSON.stringify(row);
      first = false;
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  yield "]";

  // Conversaciones de WhatsApp y de los demás canales, cada una con sus mensajes.
  yield `,"conversations":[`;
  first = true;
  const messageFields = {
    direction: true,
    messageType: true,
    body: true,
    caption: true,
    mimeType: true,
    filename: true,
    status: true,
    timestamp: true,
    sender: { select: { email: true } },
  } as const;

  for (let cursor: string | undefined; ; ) {
    const chats = await prisma.wAChat.findMany({
      where: { accountId: { in: waIds } },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        accountId: true,
        contactId: true,
        remoteJid: true,
        name: true,
        isGroup: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { email: true } },
      },
    });
    for (const chat of chats) {
      const messages = await prisma.wAMessage.findMany({ where: { chatId: chat.id }, orderBy: { timestamp: "asc" }, select: messageFields });
      const { assignedTo, ...rest } = chat;
      yield (first ? "" : ",") +
        JSON.stringify({ ...rest, channel: "WHATSAPP", assignedTo: assignedTo?.email ?? null, messages: messages.map(flattenSender) });
      first = false;
    }
    if (chats.length < PAGE) break;
    cursor = chats[chats.length - 1].id;
  }

  for (let cursor: string | undefined; ; ) {
    const convs = await prisma.conversation.findMany({
      where: { channelAccountId: { in: channelIds } },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        channelAccountId: true,
        contactId: true,
        externalId: true,
        name: true,
        isGroup: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { email: true } },
        channelAccount: { select: { channel: true } },
      },
    });
    for (const conv of convs) {
      const messages = await prisma.channelMessage.findMany({ where: { conversationId: conv.id }, orderBy: { timestamp: "asc" }, select: messageFields });
      const { assignedTo, channelAccount, ...rest } = conv;
      yield (first ? "" : ",") +
        JSON.stringify({ ...rest, channel: channelAccount.channel, assignedTo: assignedTo?.email ?? null, messages: messages.map(flattenSender) });
      first = false;
    }
    if (convs.length < PAGE) break;
    cursor = convs[convs.length - 1].id;
  }
  yield "]}";
}

function flattenSender<T extends { sender: { email: string } | null }>(m: T): Omit<T, "sender"> & { sentBy: string | null } {
  const { sender, ...rest } = m;
  return { ...rest, sentBy: sender?.email ?? null };
}
