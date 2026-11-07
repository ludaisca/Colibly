import { displayName } from "@/lib/chats/display-name";
import { ContactLimitNotice } from "@/app/components/billing/contact-usage";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Plus, Settings, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import {
  countActiveBots,
  countBots,
  countCampaigns,
  countChats,
  countCompletedCampaigns,
  countConnectedAccounts,
  countTotalAccounts,
} from "@/lib/estadisticas/global-counts";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Workbench, WorkbenchMain, WorkbenchAside } from "@/app/components/ui/workbench";
import { ChannelAvatar, type AvatarChannel } from "@/app/components/ui/channel-avatar";
import { IconBox } from "@/app/components/ui/icon-box";
import { Badge } from "@/app/components/ui/badge";
import { PageHeader } from "@/app/components/ui/page-header";
import { cn } from "@/app/components/ui/cn";
import { hueClassFor } from "@/app/components/ui/hue";
import { WaitCells } from "@/app/components/whatsapp/waiting-badge";
import { OnboardingChecklist } from "@/app/components/ui/onboarding-checklist";
import { getOnboardingSteps } from "@/lib/onboarding";
import { formatInZone } from "@/lib/format/dates";

function formatTime(ts: Date | null): string {
  if (!ts) return "—";
  const now = new Date();
  const diffMs = now.getTime() - ts.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH}h`;
  return formatInZone(ts, { day: "2-digit", month: "short" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId), getUserChannelAccountIds(userId),
  ]);

  const [
    accountsTotal,
    accountsConnected,
    chatsTotal,
    unreadAgg,
    channelUnreadAgg,
    recentChats,
    recentChannelChats,
    channelAccounts,
    botsTotal,
    botsActive,
    campaignsTotal,
    campaignsCompleted,
  ] = await Promise.all([
    countTotalAccounts(accountIds, userId),
    countConnectedAccounts(accountIds, userId),
    countChats(accountIds, userId),
    prisma.wAChat.aggregate({ where: { accountId: { in: accountIds } }, _sum: { unreadCount: true } }),
    prisma.conversation.aggregate({ where: { channelAccountId: { in: channelAccountIds } }, _sum: { unreadCount: true } }),
    prisma.wAChat.findMany({
      where: { accountId: { in: accountIds } },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: 8,
      select: {
        id: true,
        accountId: true,
        name: true,
        remoteJid: true,
        lastMessage: true,
        lastMessageAt: true,
        waitingSince: true,
        status: true,
        account: { select: { name: true } },
      },
    }),
    prisma.conversation.findMany({
      where: { channelAccountId: { in: channelAccountIds } },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: 8,
      select: {
        id: true, channelAccountId: true, name: true, externalId: true,
        lastMessage: true, lastMessageAt: true, waitingSince: true, status: true,
        channelAccount: { select: { name: true, channel: true } },
      },
    }),
    prisma.channelAccount.findMany({
      where: { id: { in: channelAccountIds } },
      select: { channel: true },
    }),
    countBots(userId),
    countActiveBots(userId),
    countCampaigns(userId),
    countCompletedCampaigns(userId),
  ]);

  const unreadCount = (unreadAgg._sum.unreadCount ?? 0) + (channelUnreadAgg._sum.unreadCount ?? 0);

  const chats = recentChats.map((c) => ({
    id: c.id,
    accountId: c.accountId,
    name: displayName(c.name, c.remoteJid),
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    waitingSince: c.status !== "RESOLVED" ? c.waitingSince : null,
    accountName: c.account?.name ?? "—",
    channel: "WHATSAPP" as AvatarChannel,
  })).concat(recentChannelChats.map((c) => ({
    id: c.id,
    accountId: c.channelAccountId,
    name: displayName(c.name, c.externalId),
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    waitingSince: c.status !== "RESOLVED" ? c.waitingSince : null,
    accountName: c.channelAccount.name,
    channel: c.channelAccount.channel as AvatarChannel,
  }))).sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0)).slice(0, 8);

  // Hora de la petición para la cifra de espera (página dinámica, por sesión).
  const now = new Date().getTime();
  const showAccountBadge = accountsTotal > 1;
  const channelTypes = new Set(channelAccounts.map((account) => account.channel));
  const accountsHref = accountIds.length > 0 && channelAccounts.length === 0
    ? "/whatsapp/cuentas"
    : accountIds.length === 0 && channelTypes.size === 1
      ? `/${channelAccounts[0].channel.toLowerCase()}/cuentas`
      : undefined;

  const kpis: KpiItem[] = [
    {
      label: "Cuentas",
      value: accountsTotal === 0 ? "0" : `${accountsConnected}/${accountsTotal}`,
      hint: accountsTotal === 0 ? "Conecta tu primer número" : "conectadas",
      href: accountsHref,
    },
    {
      label: "Chats activos",
      value: String(chatsTotal),
      delta: unreadCount > 0 ? `${unreadCount} sin leer` : undefined,
      deltaTone: unreadCount > 0 ? "danger" : "neutral",
      hint: "conversaciones",
      href: "/whatsapp/chat",
    },
    {
      label: "Bots IA",
      value: botsTotal === 0 ? "0" : `${botsActive}/${botsTotal}`,
      hint: "activos",
      href: session.user.role === "admin" ? "/whatsapp/bots" : undefined,
    },
    {
      label: "Campañas",
      value: campaignsTotal === 0 ? "0" : `${campaignsCompleted}/${campaignsTotal}`,
      hint: "completadas",
      href: "/whatsapp/campanas",
    },
  ];

  const needsSetup = accountsTotal === 0;
  const needsAttention = !needsSetup && unreadCount > 0;
  // Primeros pasos: solo admins (son quienes pueden hacerlos) y mientras falte alguno.
  const onboarding = session.user.role === "admin" ? await getOnboardingSteps(userId) : [];
  const showOnboarding = onboarding.some((step) => !step.done);

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <PageHeader title="Panel" description="Resumen de la actividad de tus canales" />
      </div>

      <ContactLimitNotice />

      {showOnboarding && (
        <div className="animate-fade-in-up animation-delay-100">
          <OnboardingChecklist steps={onboarding} />
        </div>
      )}

      {/* Estado de la bandeja antes de los KPIs: al iniciar sin canales,
          un mensaje verde de "todo en orden" daría una señal equivocada. */}
      <div
        className={cn(
          "animate-fade-in-up animation-delay-100 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3",
          needsSetup ? "bg-info-bg" : needsAttention ? "bg-warning-bg" : "bg-success-bg"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              needsSetup ? "bg-info" : needsAttention ? "bg-warning animate-pulse-live" : "bg-success"
            )}
          />
          <div>
            <p className={cn("font-display text-base font-bold", needsSetup ? "text-info" : needsAttention ? "text-warning" : "text-success")}>
              {needsSetup ? "Prepara tu bandeja" : needsAttention ? "Necesita tu atención" : "Todo en orden"}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {needsSetup
                ? "Conecta WhatsApp para empezar a recibir conversaciones."
                : needsAttention
                ? `${unreadCount} mensaje${unreadCount === 1 ? "" : "s"} sin leer en tu bandeja.`
                : "Sin mensajes sin leer en este momento."}
            </p>
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up animation-delay-200">
        <KpiStrip items={kpis} />
      </div>

      <Workbench>
        <WorkbenchMain>
          <section className="animate-fade-in-up animation-delay-300 overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <SectionHeader
                eyebrow="Actividad"
                title="Chats recientes"
                action={
                  chatsTotal > 0 ? (
                    <Link
                      href="/whatsapp/chat"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:text-foreground"
                    >
                      Ver bandeja <ArrowRight size={12} />
                    </Link>
                  ) : undefined
                }
              />
            </div>

            {chats.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-darker">No hay conversaciones aún.</p>
                <p className="text-xs text-muted mt-1">
                  Conecta un canal para empezar a recibir mensajes.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {chats.map((chat) => (
                  <Link
                    key={chat.id}
                    href={`/whatsapp/chat/${chat.accountId}/${chat.id}`}
                    className={cn("relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-light sm:flex sm:items-center sm:gap-3", hueClassFor(chat.accountId))}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-entity" />
                    <div className="row-span-2 sm:row-span-1"><ChannelAvatar id={chat.accountId} name={chat.name} channel={chat.channel} size="sm" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{chat.name}</p>
                      <p className="truncate text-xs text-muted-darker">{chat.lastMessage ?? "—"}</p>
                    </div>
                    <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1 sm:ml-auto sm:shrink-0 sm:flex-col sm:items-end">
                      {chat.waitingSince ? (
                        <WaitCells since={chat.waitingSince.toISOString()} now={now} />
                      ) : (
                        <span className="text-micro font-medium tabular-nums text-muted-darker">
                          {formatTime(chat.lastMessageAt)}
                        </span>
                      )}
                      {showAccountBadge && (
                        <Badge tone="neutral" size="sm">{chat.accountName}</Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </WorkbenchMain>

        <WorkbenchAside>
          <section className="animate-fade-in-up animation-delay-400 rounded-xl border border-border bg-surface">
            <div className="px-4 py-3">
              <SectionHeader eyebrow="Atajos" title="Acceso rápido" />
            </div>

            <div className="divide-y divide-border">
              <Link
                href="/whatsapp/cuentas?nueva=1"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
              >
                <IconBox icon={Plus} size="sm" tone="accent-2" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Agregar número</p>
                  <p className="truncate text-xs text-muted-darker">Conectar cuenta WhatsApp Business</p>
                </div>
              </Link>

              <Link
                href="/whatsapp/chat"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
              >
                <IconBox icon={MessageCircle} size="sm" tone="accent-2" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Bandeja de chats</p>
                  <p className="truncate text-xs text-muted-darker">Ver y responder conversaciones</p>
                </div>
              </Link>

              <Link
                href="/configuracion"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
              >
                <IconBox icon={Settings} size="sm" tone="accent-2" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Configuración</p>
                  <p className="truncate text-xs text-muted-darker">Administrar perfil y ajustes IA</p>
                </div>
              </Link>
            </div>
          </section>
        </WorkbenchAside>
      </Workbench>
    </div>
  );
}
