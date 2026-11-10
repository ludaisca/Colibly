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
      description: "Empieza con WhatsApp o conecta tus otros canales con tus credenciales.",
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

/** Botón de la tarjeta "Siguiente paso" del panel, por paso. */
const NEXT_STEP_CTA: Record<OnboardingStep["key"], string> = {
  email: "Revisar mi correo",
  channel: "Conectar WhatsApp",
  automation: "Crear mi bot",
  team: "Invitar a mi equipo",
  plan: "Elegir plan",
};

export interface NextStep {
  step: OnboardingStep;
  cta: string;
  /** Mientras no hay canal: probar el bot sin conectar nada. */
  secondary: { label: string; href: string } | null;
}

/** El primer paso pendiente que tenga enlace (null si no queda ninguno: la tarjeta se oculta). */
export function nextOnboardingStep(steps: OnboardingStep[]): NextStep | null {
  const step = steps.find((s) => !s.done && s.href);
  if (!step) return null;
  return {
    step,
    cta: NEXT_STEP_CTA[step.key],
    secondary: step.key === "channel" ? { label: "Mientras tanto, prueba tu bot", href: "/whatsapp/bots" } : null,
  };
}
