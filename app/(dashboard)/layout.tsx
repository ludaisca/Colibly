import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "./dashboard-shell";
import { VerifyEmailBanner } from "@/app/components/ui/verify-email-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // El nombre del negocio es el de la organización del usuario (antes era un
  // SystemConfig global, de cuando cada instalación era una sola empresa).
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerifiedAt: true, organization: { select: { name: true } } },
  });

  const topBanner = user && !user.emailVerifiedAt ? <VerifyEmailBanner email={user.email} /> : null;
  return (
    <DashboardShell businessName={user?.organization.name} topBanner={topBanner}>
      {children}
    </DashboardShell>
  );
}
