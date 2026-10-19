import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { AI_NOT_INCLUDED_MESSAGE, BILLING_PLAN_PATH, hasAiAccess } from "@/lib/billing/gates";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";

async function orgHasAi(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return true; // el layout del panel ya redirige a /login
  return hasAiAccess(await requireOrgId(session.user.id));
}

// Pantallas de IA (Bots IA, Calificadores): en un plan sin IA (Esencial) se
// reemplazan por una invitación a mejorar el plan. Las APIs tienen su propio
// candado (checkAiAccess) y los créditos del plan son 0.
export async function AiPlanGate({ children, feature }: { children: React.ReactNode; feature: string }) {
  if (await orgHasAi()) return <>{children}</>;
  return (
    <EmptyState
      icon={Sparkles}
      title={`${feature} no está incluido en tu plan`}
      description={AI_NOT_INCLUDED_MESSAGE}
      action={<Button href={BILLING_PLAN_PATH}>Ver planes</Button>}
    />
  );
}

// Configuración de IA: la página sigue disponible (zona horaria y horario se
// usan en otras partes), con un aviso arriba.
export async function AiPlanNotice() {
  if (await orgHasAi()) return null;
  return (
    <Banner tone="warning" title="Tu plan no incluye IA" action={<Button size="sm" href={BILLING_PLAN_PATH}>Ver planes</Button>}>
      {AI_NOT_INCLUDED_MESSAGE}
    </Banner>
  );
}
