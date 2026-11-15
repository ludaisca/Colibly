import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { displayName } from "@/lib/chats/display-name";
import { ContactLimitNotice } from "@/app/components/billing/contact-usage";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { requireOrgId } from "@/lib/tenancy";
import { getOrgAccountHues } from "@/lib/accounts/hues";
import { STATS_TZ, utcInstantForLocalMidnight } from "@/lib/estadisticas/get-stats";
import { firstResponseRows } from "@/lib/estadisticas/response-times";
import { summarizeResponses } from "@/lib/estadisticas/response-rules";
import { formatDuration } from "@/lib/format/duration";
import { plural } from "@/lib/format/plural";
import { botDisplayStatus, BOT_DISPLAY_STATUS_LABEL } from "@/lib/bots/display-status";
import { stageSummaries } from "@/lib/pipeline/board";
import { ensureDefaultPipeline } from "@/lib/pipeline/ensure";
import { outcomeScopeWhere } from "@/lib/pipeline/outcome-scope";
import { formatMxn } from "@/lib/money";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { PageHeader } from "@/app/components/ui/page-header";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import { hueClassIn } from "@/app/components/ui/hue";
import { WaitCells } from "@/app/components/whatsapp/waiting-badge";
import { SampleDataControls } from "@/app/components/ui/sample-data-controls";

// Panel (dirección congelada, nov 2026): encabezado con fecha, una frase de
// estado con datos, cinco cifras y dos columnas — Chats (los que esperan y los
// atendidos hace poco) y, a la derecha, Bots IA, Citas de hoy y Embudo. Sin
// "Acceso rápido" ni "Prepara tu bandeja"; los primeros pasos viven al pie del
// menú mientras falten.

const RESPONSE_DAYS = 14;

function sectionTitle(title: string, href?: string, label = "Ver todo") {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
      <h2 className="text-title text-foreground">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
          {label} <ArrowRight size={12} aria-hidden />
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";

  const [accountIds, channelAccountIds, organizationId] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
    requireOrgId(userId),
  ]);
  const hasChannel = accountIds.length + channelAccountIds.length > 0;

  const now = new Date();
  const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone: STATS_TZ }).split("-").map(Number);
  const todayStart = utcInstantForLocalMidnight(y, m, d);
  const tomorrowStart = utcInstantForLocalMidnight(y, m, d + 1);
  const responseSince = utcInstantForLocalMidnight(y, m, d - (RESPONSE_DAYS - 1));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const waWaiting = { accountId: { in: accountIds }, waitingSince: { not: null }, status: { not: "RESOLVED" as const } };
  const chWaiting = { channelAccountId: { in: channelAccountIds }, waitingSince: { not: null }, status: { not: "RESOLVED" as const } };
  const chatSelect = { id: true, name: true, lastMessage: true, lastMessageAt: true, waitingSince: true } as const;

  const [
    accountHues,
    contactScope,
    waWaitingAgg,
    chWaitingAgg,
    newWaToday,
    newChToday,
    waitingWa,
    waitingCh,
    recentWa,
    recentCh,
    responses,
    wonCount,
    appointmentsToday,
    bots,
    botReplies,
    pipeline,
  ] = await Promise.all([
    getOrgAccountHues(organizationId),
    contactScopeWhere(userId),
    accountIds.length ? prisma.wAChat.aggregate({ where: waWaiting, _count: { _all: true }, _min: { waitingSince: true } }) : null,
    channelAccountIds.length ? prisma.conversation.aggregate({ where: chWaiting, _count: { _all: true }, _min: { waitingSince: true } }) : null,
    accountIds.length ? prisma.wAChat.count({ where: { accountId: { in: accountIds }, createdAt: { gte: todayStart } } }) : 0,
    channelAccountIds.length ? prisma.conversation.count({ where: { channelAccountId: { in: channelAccountIds }, createdAt: { gte: todayStart } } }) : 0,
    accountIds.length ? prisma.wAChat.findMany({ where: waWaiting, orderBy: { waitingSince: "asc" }, take: 6, select: { ...chatSelect, accountId: true, remoteJid: true } }) : [],
    channelAccountIds.length ? prisma.conversation.findMany({ where: chWaiting, orderBy: { waitingSince: "asc" }, take: 6, select: { ...chatSelect, channelAccountId: true, externalId: true } }) : [],
    accountIds.length ? prisma.wAChat.findMany({ where: { accountId: { in: accountIds }, waitingSince: null }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 5, select: { ...chatSelect, accountId: true, remoteJid: true } }) : [],
    channelAccountIds.length ? prisma.conversation.findMany({ where: { channelAccountId: { in: channelAccountIds }, waitingSince: null }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 5, select: { ...chatSelect, channelAccountId: true, externalId: true } }) : [],
    hasChannel ? firstResponseRows(accountIds, channelAccountIds, responseSince).catch(() => []) : [],
    // Mismo alcance que el resto del panel: el admin ve toda la organización;
    // los demás, las ventas de sus contactos (o de sus cuentas si el contacto
    // se borró: outcome-scope.ts).
    prisma.leadOutcomeEvent.count({
      where: {
        organizationId,
        outcome: "WON",
        createdAt: { gte: monthAgo },
        ...(isAdmin ? {} : outcomeScopeWhere({ accountIds, channelAccountIds, organizationId, isAdmin: false })),
      },
    }),
    prisma.wAAppointment.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: todayStart, lt: tomorrowStart }, contact: { ...(await contactScopeWhere(userId)) } },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      select: { id: true, title: true, scheduledAt: true, contact: { select: { name: true, remoteJid: true } } },
    }),
    isAdmin ? prisma.wABot.findMany({ where: { organizationId }, orderBy: { name: "asc" }, take: 5, select: { id: true, name: true, isActive: true, status: true, waAccountId: true, channelAccountId: true } }) : [],
    isAdmin ? prisma.wABotUsage.groupBy({ by: ["botId"], where: { bot: { organizationId }, createdAt: { gte: weekAgo } }, _count: { _all: true } }) : [],
    ensureDefaultPipeline(organizationId).then(() =>
      prisma.pipeline.findFirst({ where: { organizationId, isDefault: true }, include: { stages: { orderBy: { position: "asc" } } } })
    ),
  ]);

  const stageTotals = pipeline ? await stageSummaries(contactScope, pipeline.stages, true) : {};
  const maxStageCount = pipeline ? Math.max(1, ...pipeline.stages.map((s) => stageTotals[s.id]?.realCount ?? 0)) : 1;

  const waitingCount = (waWaitingAgg?._count._all ?? 0) + (chWaitingAgg?._count._all ?? 0);
  const oldestWaiting = [waWaitingAgg?._min.waitingSince, chWaitingAgg?._min.waitingSince]
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const firstResponse = summarizeResponses(responses.map((row) => row.minutes));

  const waitingChats = [
    ...waitingWa.map((c) => ({ id: c.id, href: `/whatsapp/chat/${c.accountId}/${c.id}`, accountId: c.accountId, name: displayName(c.name, c.remoteJid), preview: c.lastMessage, waitingSince: c.waitingSince })),
    ...waitingCh.map((c) => ({ id: c.id, href: `/whatsapp/chat/${c.channelAccountId}/${c.id}`, accountId: c.channelAccountId, name: displayName(c.name, c.externalId), preview: c.lastMessage, waitingSince: c.waitingSince })),
  ].sort((a, b) => (a.waitingSince?.getTime() ?? 0) - (b.waitingSince?.getTime() ?? 0)).slice(0, 6);
  const recentChats = [
    ...recentWa.map((c) => ({ id: c.id, href: `/whatsapp/chat/${c.accountId}/${c.id}`, accountId: c.accountId, name: displayName(c.name, c.remoteJid), preview: c.lastMessage, at: c.lastMessageAt })),
    ...recentCh.map((c) => ({ id: c.id, href: `/whatsapp/chat/${c.channelAccountId}/${c.id}`, accountId: c.channelAccountId, name: displayName(c.name, c.externalId), preview: c.lastMessage, at: c.lastMessageAt })),
  ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)).slice(0, 5);

  const nowMs = now.getTime();
  const status = !hasChannel
    ? null
    : waitingCount === 0
      ? "Todo contestado."
      : `${plural(waitingCount, "chat espera", "chats esperan")} respuesta${oldestWaiting ? ` · el más antiguo hace ${formatDuration((nowMs - oldestWaiting.getTime()) / 60_000)}` : ""}`;

  const kpis: KpiItem[] = [
    { label: "Esperan respuesta", value: String(waitingCount), href: "/whatsapp/chat?awaiting=1" },
    { label: "Chats nuevos hoy", value: String(newWaToday + newChToday) },
    { label: "Primera respuesta mediana", value: firstResponse.count > 0 ? formatDuration(firstResponse.medianMinutes) : "—", hint: `${RESPONSE_DAYS} días` },
    { label: "Ventas ganadas 30 días", value: String(wonCount), href: "/ventas" },
    { label: "Citas hoy", value: String(appointmentsToday.length), href: "/whatsapp/citas" },
  ];
  const repliesByBot = new Map(botReplies.map((row) => [row.botId, row._count._all]));
  const dateLabel = now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: STATS_TZ });

  return (
    <div className="space-y-5">
      <PageHeader title="Panel" description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} actions={<SampleDataControls />} />

      <ContactLimitNotice />

      {status ? (
        <p className="text-sm text-foreground">{status}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-foreground">Conecta tu WhatsApp para recibir mensajes aquí.</p>
          {isAdmin && <Button size="sm" href="/whatsapp/cuentas">Conectar WhatsApp</Button>}
        </div>
      )}

      <KpiStrip items={kpis} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_372px]">
        <section className="self-start overflow-hidden rounded-lg border border-border bg-surface">
          {sectionTitle("Chats", "/whatsapp/chat", "Ir a la bandeja")}
          {waitingChats.length === 0 && recentChats.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-muted">{hasChannel ? "Todo contestado." : "Aquí verás los chats cuando conectes un canal."}</p>
          ) : (
            <>
              {waitingChats.length > 0 && <p className="px-4 pb-1 text-xs font-medium text-muted">Esperan respuesta</p>}
              <ul className="divide-y divide-border border-y border-border">
                {waitingChats.map((chat) => (
                  <li key={chat.id}>
                    <Link href={chat.href} className={cn("relative flex h-[52px] items-center gap-3 px-4 transition-colors duration-fast hover:bg-surface-light", hueClassIn(accountHues, chat.accountId))}>
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-entity" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{chat.name}</span>
                        <span className="block truncate text-xs text-muted">{chat.preview ?? "—"}</span>
                      </span>
                      {chat.waitingSince && <WaitCells since={chat.waitingSince.toISOString()} now={nowMs} />}
                    </Link>
                  </li>
                ))}
              </ul>
              {recentChats.length > 0 && <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted">Atendidos hace poco</p>}
              <ul className="divide-y divide-border">
                {recentChats.map((chat) => (
                  <li key={chat.id}>
                    <Link href={chat.href} className={cn("relative flex h-[52px] items-center gap-3 px-4 transition-colors duration-fast hover:bg-surface-light", hueClassIn(accountHues, chat.accountId))}>
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-entity" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{chat.name}</span>
                        <span className="block truncate text-xs text-muted">{chat.preview ?? "—"}</span>
                      </span>
                      {chat.at && <span className="shrink-0 text-xs tabular-nums text-muted-darker">{chat.at.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: STATS_TZ })}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="space-y-5">
          {isAdmin && (
            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              {sectionTitle("Bots IA", "/whatsapp/bots")}
              {bots.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted">Aún no tienes bots.</p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {bots.map((bot) => {
                    const badge = BOT_DISPLAY_STATUS_LABEL[botDisplayStatus(bot)];
                    return (
                      <li key={bot.id}>
                        <Link href={`/whatsapp/bots/${bot.id}`} className="flex h-12 items-center gap-3 px-4 transition-colors duration-fast hover:bg-surface-light">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{bot.name}</span>
                          <span className="text-xs tabular-nums text-muted">{plural(repliesByBot.get(bot.id) ?? 0, "respuesta")} esta semana</span>
                          <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            {sectionTitle("Citas de hoy", "/whatsapp/citas")}
            {appointmentsToday.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">Sin citas hoy.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {appointmentsToday.map((appointment) => (
                  <li key={appointment.id} className="flex h-12 items-center gap-3 px-4">
                    <span className="w-12 shrink-0 font-display text-base font-semibold tabular-nums">
                      {appointment.scheduledAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: STATS_TZ })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{appointment.title}</span>
                      <span className="block truncate text-xs text-muted">{displayName(appointment.contact.name, appointment.contact.remoteJid)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pipeline && (
            <section className="rounded-lg border border-border bg-surface pb-3">
              {sectionTitle("Embudo", "/ventas")}
              <ul className="space-y-2.5 px-4">
                {pipeline.stages.map((stage) => {
                  const total = stageTotals[stage.id];
                  const count = total?.realCount ?? 0;
                  return (
                    <li key={stage.id}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate text-muted">{stage.name}</span>
                        <span className="shrink-0 tabular-nums text-foreground">
                          {count.toLocaleString("es-MX")}
                          {(total?.realValueCents ?? 0) > 0 && <span className="text-muted"> · {formatMxn(total!.realValueCents, { compact: true })}</span>}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-light">
                        <div className={cn("h-full rounded-full", stage.outcome === "WON" ? "bg-success" : stage.outcome === "LOST" ? "bg-subtle" : "bg-accent")} style={{ width: `${(count / maxStageCount) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
