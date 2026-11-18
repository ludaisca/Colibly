import Link from "next/link";
import { nextOnboardingStep, type OnboardingStep } from "@/lib/onboarding";
import { Progress } from "./progress";

// Versión compacta al pie del menú (mientras falte algún paso): el panel ya no
// muestra la lista completa arriba.
export function OnboardingSidebarCard({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = nextOnboardingStep(steps);
  return (
    <div className="mb-2 rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="font-medium text-foreground">Primeros pasos · {done} de {steps.length}</p>
      <Progress value={(done / steps.length) * 100} className="mt-2" />
      {next?.step.href && (
        <Link href={next.step.href} className="mt-2 inline-block text-xs font-medium text-accent-ink underline underline-offset-2">
          {next.step.title}
        </Link>
      )}
    </div>
  );
}
