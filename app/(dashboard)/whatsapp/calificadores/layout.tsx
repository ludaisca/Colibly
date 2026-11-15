import { AiPlanGate } from "@/app/components/billing/ai-plan-gate";

export default function CalificadoresLayout({ children }: { children: React.ReactNode }) {
  return <AiPlanGate feature="Calificadores de contactos">{children}</AiPlanGate>;
}
