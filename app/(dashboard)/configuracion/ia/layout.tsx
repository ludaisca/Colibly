import { AiPlanNotice } from "@/app/components/billing/ai-plan-gate";

export default function IaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mb-4 empty:hidden"><AiPlanNotice /></div>
      {children}
    </>
  );
}
