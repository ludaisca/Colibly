import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "./dashboard-shell";
import { VerifyEmailBanner } from "@/app/components/ui/verify-email-banner";
import { BillingBanner } from "@/app/components/ui/billing-banner";
import { getOrgBilling } from "@/lib/billing/gates";
import { billingNotice } from "@/lib/billing/state";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // El nombre del negocio es el de la organización del usuario (antes era un
  // SystemConfig global, de cuando cada instalación era una sola empresa).
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      emailVerifiedAt: true,
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
  });

  // Un canal se ve en el nav si está habilitado (por defecto) o si la
  // organización ya tiene cuentas ahí (desactivar el flag después no le esconde
  // lo que ya tenía conectado — ver lib/channel-flags.ts).
  const channelCounts = user
    ? await prisma.channelAccount.groupBy({ by: ["channel"], where: { organizationId: user.organizationId }, _count: true })
    : [];
  const hasAccount = (channel: string) => channelCounts.some((c) => c.channel === channel && c._count > 0);
  const channels = {
    telegram: !!user?.organization.channelTelegramEnabled || hasAccount("TELEGRAM"),
    messenger: !!user?.organization.channelMessengerEnabled || hasAccount("MESSENGER"),
    instagram: !!user?.organization.channelInstagramEnabled || hasAccount("INSTAGRAM"),
    webchat: !!user?.organization.channelWebchatEnabled || hasAccount("WEBCHAT"),
  };

  // Aviso del plan: los admins ven también "prueba por vencer" y "pago
  // pendiente" (pueden resolverlo); el resto, solo cuando la cuenta ya no
  // funciona. El aviso informativo de prueba vigente no se muestra: la
  // pantalla del plan ya lo dice.
  const isAdmin = session.user.role === "admin";
  const org = user ? await getOrgBilling(user.organizationId) : null;
  const notice = org ? billingNotice(org, new Date()) : null;
  const showNotice = notice && notice.tone !== "info" && (isAdmin || notice.tone === "danger");

  const topBanner = (
    <>
      {showNotice && <BillingBanner notice={notice} isAdmin={isAdmin} />}
      {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
    </>
  );
  return (
    <DashboardShell businessName={user?.organization.name} role={session.user.role} initialUser={{ name: session.user.name, email: session.user.email }} topBanner={topBanner} platformAdmin={isPlatformAdminEmail(user?.email)} channels={channels}>
      {children}
    </DashboardShell>
  );
}
