import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { AI_NOT_INCLUDED_MESSAGE, BILLING_PLAN_PATH } from "@/lib/billing/gates";
import { orgHasAnyFeature } from "@/lib/billing/entitlements";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";

async function orgHasAi(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return true; // el layout del panel ya redirige a /login
  // Con licencias: basta que alguien de la organización tenga IA (los bots
  // dependen de la licencia del dueño de cada canal; las rutas lo revisan).
  return orgHasAnyFeature(await requireOrgId(session.user.id), "aiAssist");
}

// Pantallas de IA (Bots IA, Calificadores): si nadie de la organización tiene
// IA en su licencia se reemplazan por una invitación a mejorar. Las APIs
// tienen su propio candado (entitlements.ts) y los créditos de Básico son 0.
export async function AiPlanGate({ children, feature }: { children: React.ReactNode; feature: string }) {
  if (await orgHasAi()) return <>{children}</>;
  return (
    <EmptyState
      icon={Sparkles}
      title={`${feature} no está incluido en tus licencias`}
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
    <Banner tone="warning" title="Tu organización no tiene IA" action={<Button size="sm" href={BILLING_PLAN_PATH}>Ver planes</Button>}>
      {AI_NOT_INCLUDED_MESSAGE}
    </Banner>
  );
}
