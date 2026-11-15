import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "./dashboard-shell";
import { VerifyEmailBanner } from "@/app/components/ui/verify-email-banner";
import { BillingBanner } from "@/app/components/ui/billing-banner";
import { TrialCard } from "@/app/components/billing/trial-card";
import { getOrgBilling } from "@/lib/billing/gates";
import { billingNotice } from "@/lib/billing/state";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getOrgAccountHues } from "@/lib/accounts/hues";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // El nombre del negocio es el de la organización del usuario (antes era un
  // SystemConfig global, de cuando cada instalación era una sola empresa).
  // La llave push no depende del usuario: se lee en paralelo (caché de 30 s).
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        emailVerifiedAt: true,
        availability: true,
        organizationId: true,
        organization: {
          select: {
            name: true,
            channelTelegramEnabled: true,
            channelMessengerEnabled: true,
            channelInstagramEnabled: true,
            channelWebchatEnabled: true,
          },
        },
      },
    }),
    getPlatformSettings(),
  ]);

  // Todo lo que depende de la organización va en paralelo (cada await en serie
  // sumaba su latencia al TTFB de TODAS las páginas del dashboard):
  // - canales con cuentas: un canal se ve en el nav si está habilitado (por
  //   defecto) o si la organización ya tiene cuentas ahí (desactivar el flag
  //   después no le esconde lo que ya tenía conectado — lib/channel-flags.ts);
  // - Calling API: el dock de llamadas solo sondea si alguna cuenta la tiene;
  // - estado del plan para el aviso.
  const [channelCounts, callingAccounts, whatsappAccounts, org, accountHues] = user
    ? await Promise.all([
        prisma.channelAccount.groupBy({ by: ["channel"], where: { organizationId: user.organizationId }, _count: true }),
        prisma.wAAccount.count({ where: { organizationId: user.organizationId, callingEnabled: true } }),
        prisma.wAAccount.count({ where: { organizationId: user.organizationId } }),
        getOrgBilling(user.organizationId),
        getOrgAccountHues(user.organizationId),
      ])
    : [[], 0, 0, null, null];
  const callingEnabled = callingAccounts > 0;
  const hasAccount = (channel: string) => channelCounts.some((c) => c.channel === channel && c._count > 0);
  const channels = {
    telegram: !!user?.organization.channelTelegramEnabled || hasAccount("TELEGRAM"),
    messenger: !!user?.organization.channelMessengerEnabled || hasAccount("MESSENGER"),
    instagram: !!user?.organization.channelInstagramEnabled || hasAccount("INSTAGRAM"),
    webchat: !!user?.organization.channelWebchatEnabled || hasAccount("WEBCHAT"),
  };

  // Aviso del plan: los admins ven también los días de prueba que quedan, la
  // prueba por vencer y el pago pendiente (pueden resolverlo); el resto, solo
  // cuando la cuenta ya no funciona. Info y warning se pueden cerrar.
  const isAdmin = session.user.role === "admin";
  // Mismo criterio que /plataforma (layout, página y requirePlatformAdmin), que
  // miran el correo de la SESIÓN: si el menú mirara solo el de la base, una
  // sesión con otro correo vería «Organizaciones» y la ruta le daría 404. Se
  // exige que los dos sean de un operador.
  const platformAdmin = isPlatformAdminEmail(session.user.email) && isPlatformAdminEmail(user?.email);
  const notice = org ? billingNotice(org, new Date()) : null;
  // La prueba con días de sobra va en una tarjeta al pie del menú; arriba solo
  // los avisos que piden actuar ya (≤3 días, pago fallido, solo lectura…).
  const showNotice = notice && notice.tone !== "info" && (isAdmin || notice.tone === "danger");
  const trialCard = isAdmin && notice?.kind === "trial_ending" ? <TrialCard daysLeft={notice.daysLeft ?? 0} /> : null;

  const topBanner = (
    <>
      {showNotice && <BillingBanner notice={notice} isAdmin={isAdmin} />}
      {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
    </>
  );
  return (
    <DashboardShell businessName={user?.organization.name} role={session.user.role} initialUser={{ name: session.user.name, email: session.user.email, availability: user?.availability, pushPublicKey: settings.vapidPrivateKey ? settings.vapidPublicKey : null }} topBanner={topBanner} sidebarCard={trialCard} platformAdmin={platformAdmin} channels={channels} callingEnabled={callingEnabled} hasWhatsapp={whatsappAccounts > 0} accountHues={accountHues}>
      {children}
    </DashboardShell>
  );
}
