import { AiPlanGate } from "@/app/components/billing/ai-plan-gate";

export default function BotsLayout({ children }: { children: React.ReactNode }) {
  return <AiPlanGate feature="Bots IA">{children}</AiPlanGate>;
}
