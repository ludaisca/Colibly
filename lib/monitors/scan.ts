import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { hasAiCredits, reserveAiCredit } from "@/lib/ai/credits";
import { recordAssistUsage } from "@/lib/ai/assist-usage";
import { isOrgWritable } from "@/lib/billing/gates";
import { userHasFeature } from "@/lib/billing/entitlements";
import {
  MAX_MONITORS_PER_ORG,
  MONITOR_CHATS_PER_TICK,
  MONITOR_MESSAGES_PER_CHAT,
  buildMonitorPrompt,
  buildTranscript,
  parseMonitorResponse,
  type TranscriptMessage,
} from "./rules";

// Tick de monitores de temas (cola `inbox`, job "topic-monitor-tick", cada
// hora). Por organización con monitores activos y escribible: hasta 50 chats
// con mensajes nuevos desde el cursor (Organization.topicMonitorScanAt). Cada
// monitor corre con la licencia y los créditos de quien lo creó (regla 6 de
// las licencias; sin creador, el dueño de la organización): una llamada de IA
// por chat y por creador, que evalúa sus monitores que aún no coincidieron.

export interface MonitorTickResult {
  organizations: number;
  chats: number;
  matches: number;
  errors: number;
}

const FIRST_SCAN_LOOKBACK_MS = 24 * 3_600_000;

type Candidate = { kind: "whatsapp" | "channel"; id: string; accountId: string; lastMessageAt: Date };

export async function processTopicMonitorTick(now = new Date()): Promise<MonitorTickResult> {
  const result: MonitorTickResult = { organizations: 0, chats: 0, matches: 0, errors: 0 };
  const orgs = await prisma.organization.findMany({
    where: { topicMonitors: { some: { active: true } } },
    select: { id: true, topicMonitorScanAt: true, ownerId: true },
  });
  if (orgs.length === 0) return result;

  const picked = await resolvePlatformModel();
  if (!picked) return result;
  const apiKey = await getPlatformApiKey(picked.provider);
  if (!apiKey) return result;
  const client = getAIProvider(picked.provider, apiKey);

  for (const org of orgs) {
    try {
      // Antes de gastar IA: solo lectura → nada. La licencia y los créditos se
      // revisan por creador en scanOrganization.
      if (!(await isOrgWritable(org.id))) continue;
      if (await scanOrganization(org, now, client, picked, result)) result.organizations++;
    } catch (error) {
      result.errors++;
      console.error(`[monitors] organización ${org.id}`, error);
    }
  }
  return result;
}

type ScanMonitor = { id: string; name: string; description: string; payer: string };

async function scanOrganization(
  org: { id: string; topicMonitorScanAt: Date | null; ownerId: string | null },
  now: Date,
  client: ReturnType<typeof getAIProvider>,
  picked: { provider: Parameters<typeof getAIProvider>[0]; model: string },
  result: MonitorTickResult
): Promise<boolean> {
  const rows = await prisma.topicMonitor.findMany({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "asc" },
    take: MAX_MONITORS_PER_ORG,
    select: { id: true, name: true, description: true, createdById: true },
  });
  // Solo los monitores cuyo creador tiene la función y le quedan créditos.
  const eligible = new Map<string, boolean>();
  const monitors: ScanMonitor[] = [];
  for (const row of rows) {
    const payer = row.createdById ?? org.ownerId;
    if (!payer) continue;
    if (!eligible.has(payer)) {
      eligible.set(payer, (await userHasFeature(payer, "topicMonitors")) && (await hasAiCredits({ userId: payer }, now)));
    }
    if (eligible.get(payer)) monitors.push({ id: row.id, name: row.name, description: row.description, payer });
  }
  if (monitors.length === 0) return false;

  const since = org.topicMonitorScanAt ?? new Date(now.getTime() - FIRST_SCAN_LOOKBACK_MS);
  const [waChats, conversations] = await Promise.all([
    prisma.wAChat.findMany({
      where: { account: { organizationId: org.id }, isGroup: false, lastMessageAt: { gt: since, lte: now } },
      orderBy: { lastMessageAt: "asc" },
      take: MONITOR_CHATS_PER_TICK,
      select: { id: true, accountId: true, lastMessageAt: true },
    }),
    prisma.conversation.findMany({
      where: { channelAccount: { organizationId: org.id }, isGroup: false, lastMessageAt: { gt: since, lte: now } },
      orderBy: { lastMessageAt: "asc" },
      take: MONITOR_CHATS_PER_TICK,
      select: { id: true, channelAccountId: true, lastMessageAt: true },
    }),
  ]);
  const candidates: Candidate[] = [
    ...waChats.filter((c) => c.lastMessageAt).map((c) => ({ kind: "whatsapp" as const, id: c.id, accountId: c.accountId, lastMessageAt: c.lastMessageAt! })),
    ...conversations.filter((c) => c.lastMessageAt).map((c) => ({ kind: "channel" as const, id: c.id, accountId: c.channelAccountId, lastMessageAt: c.lastMessageAt! })),
  ]
    .sort((a, b) => a.lastMessageAt.getTime() - b.lastMessageAt.getTime())
    .slice(0, MONITOR_CHATS_PER_TICK);

  // El cursor avanza hasta el último chat procesado: si había más de 50, el
  // resto entra en el siguiente tick (orden ascendente, sin huecos).
  let cursor = since;
  const exhausted = new Set<string>();
  const payers = new Set(monitors.map((m) => m.payer));
  for (const chat of candidates) {
    const outcome = await scanChat(org.id, chat, monitors, exhausted, client, picked, result);
    // Sin créditos ya ningún creador: el cursor se queda para el siguiente tick.
    if (outcome === "no_credits" && exhausted.size >= payers.size) break;
    cursor = chat.lastMessageAt;
  }
  await prisma.organization.update({ where: { id: org.id }, data: { topicMonitorScanAt: cursor } });
  return true;
}

async function loadMessages(chat: Candidate): Promise<TranscriptMessage[]> {
  const select = { id: true, direction: true, body: true, caption: true, transcript: true } as const;
  const rows =
    chat.kind === "whatsapp"
      ? await prisma.wAMessage.findMany({ where: { chatId: chat.id, messageType: { not: "reaction" } }, orderBy: { timestamp: "desc" }, take: MONITOR_MESSAGES_PER_CHAT, select })
      : await prisma.channelMessage.findMany({ where: { conversationId: chat.id }, orderBy: { timestamp: "desc" }, take: MONITOR_MESSAGES_PER_CHAT, select });
  return rows.reverse().map((row) => ({
    id: row.id,
    direction: row.direction,
    text: [row.body, row.caption, row.transcript].filter(Boolean).join(" "),
  }));
}

async function scanChat(
  organizationId: string,
  chat: Candidate,
  monitors: ScanMonitor[],
  exhausted: Set<string>,
  client: ReturnType<typeof getAIProvider>,
  picked: { provider: Parameters<typeof getAIProvider>[0]; model: string },
  result: MonitorTickResult
): Promise<"done" | "skipped" | "no_credits"> {
  try {
    // Un monitor que ya coincidió en este chat no se vuelve a evaluar.
    const already = await prisma.topicMatch.findMany({
      where: { chatId: chat.id, monitorId: { in: monitors.map((m) => m.id) } },
      select: { monitorId: true },
    });
    const done = new Set(already.map((match) => match.monitorId));
    const pending = monitors.filter((monitor) => !done.has(monitor.id));
    if (pending.length === 0) return "skipped";

    const messages = await loadMessages(chat);
    if (!messages.some((message) => message.direction === "INBOUND" && message.text.trim())) return "skipped";
    const { text, indexToId } = buildTranscript(messages);

    // Una llamada por creador: cada quien paga la evaluación de sus monitores.
    const byPayer = new Map<string, ScanMonitor[]>();
    for (const monitor of pending) {
      if (exhausted.has(monitor.payer)) continue;
      byPayer.set(monitor.payer, [...(byPayer.get(monitor.payer) ?? []), monitor]);
    }
    if (byPayer.size === 0) return "no_credits";
    let ranOut = false;
    for (const [payer, group] of byPayer) {
      if (!(await reserveAiCredit({ userId: payer }))) {
        exhausted.add(payer);
        ranOut = true;
        continue;
      }
      const prompt = buildMonitorPrompt(group, text);
      const response = await client.complete({
        model: picked.model,
        temperature: 0,
        maxTokens: 400,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });
      await recordAssistUsage({ organizationId, kind: "MONITOR", userId: payer, provider: picked.provider, model: picked.model, usage: response.usage });
      result.chats++;
      const matches = parseMonitorResponse(response.content, group.map((m) => m.id), indexToId);
      if (matches.length) {
        const created = await prisma.topicMatch.createMany({
          data: matches.map((match) => ({
            monitorId: match.monitorId,
            chatKind: chat.kind,
            chatId: chat.id,
            accountId: chat.accountId,
            quote: match.quote,
            evidenceMessageIds: match.messageIds,
          })),
          skipDuplicates: true,
        });
        result.matches += created.count;
      }
    }
    if (ranOut) return "no_credits";
    return "done";
  } catch (error) {
    result.errors++;
    console.error(`[monitors] chat ${chat.kind}:${chat.id}`, error);
    return "skipped";
  }
}
