import { prisma } from "@/lib/prisma";

// Primeros pasos de una organización nueva (panel, solo admins). Se calculan
// de los datos reales — no hay un "marcar como hecho": el paso se cumple
// cuando la cosa existe.

export interface OnboardingStep {
  key: "email" | "channel" | "automation" | "team" | "plan";
  title: string;
  description: string;
  href: string | null;
  done: boolean;
}

export async function getOnboardingSteps(userId: string): Promise<OnboardingStep[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailVerifiedAt: true, organizationId: true, organization: { select: { status: true, isInternal: true } } },
  });
  const organizationId = user.organizationId;
  const [wa, channels, bots, automations, members, invites] = await Promise.all([
    prisma.wAAccount.count({ where: { organizationId } }),
    prisma.channelAccount.count({ where: { organizationId } }),
    prisma.wABot.count({ where: { organizationId } }),
    prisma.automation.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
    prisma.authToken.count({ where: { organizationId, type: "INVITE" } }),
  ]);

  const steps: OnboardingStep[] = [
    {
      key: "email",
      title: "Confirma tu correo",
      description: "Te mandamos un enlace al registrarte. Lo necesitas para conectar canales.",
      href: null,
      done: !!user.emailVerifiedAt,
    },
    {
      key: "channel",
      title: "Conecta un canal",
      description: "Empieza con WhatsApp. Los demás canales se habilitan por solicitud.",
      href: "/whatsapp/cuentas",
      done: wa + channels > 0,
    },
    {
      key: "automation",
      title: "Crea un bot o una automatización",
      description: "Responde al instante, califica leads y da seguimiento sin hacerlo a mano.",
      href: "/whatsapp/automatizaciones",
      done: bots + automations > 0,
    },
    {
      key: "team",
      title: "Invita a tu equipo",
      description: "Reparte las conversaciones entre tus vendedores.",
      href: "/usuarios",
      done: members > 1 || invites > 0,
    },
  ];
  if (!user.organization.isInternal) {
    steps.push({
      key: "plan",
      title: "Elige tu plan",
      description: "Tu prueba es gratis; elige un plan para seguir cuando termine.",
      href: "/configuracion/plan",
      done: user.organization.status === "ACTIVE",
    });
  }
  return steps;
}
