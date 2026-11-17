import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChannelTabs } from "@/app/components/ui/channel-tabs";

// WhatsApp por QR (no oficial): la sección no existe para quien no tiene el
// canal habilitado por el operador (Organization.channelWhatsappWebEnabled).
export default async function WhatsappWebCuentasLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organization: { select: { channelWhatsappWebEnabled: true } } },
  });
  if (!user?.organization.channelWhatsappWebEnabled) notFound();
  return (
    <>
      <ChannelTabs />
      {children}
    </>
  );
}
