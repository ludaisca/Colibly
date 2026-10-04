import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { OnboardingStep } from "@/lib/onboarding";
import { SectionHeader } from "./section-header";
import { Progress } from "./progress";

// Checklist de primeros pasos del panel (server-safe). El panel lo muestra
// mientras quede algún paso pendiente.
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const pending = steps.filter((step) => !step.done);
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <SectionHeader
        title="Termina de preparar tu espacio"
        action={<span className="text-sm tabular-nums text-muted">{done} de {steps.length}</span>}
      />
      <Progress value={(done / steps.length) * 100} className="mt-3" />
      <ol className="mt-2 divide-y divide-border">
        {pending.map((step) => {
          const body = (
            <>
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-accent-strong" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {step.title}
                </span>
                <span className="block text-xs text-muted-darker">{step.description}</span>
              </span>
              {step.href && <ArrowRight size={16} className="mt-1 shrink-0 text-accent-ink" aria-hidden />}
            </>
          );
          return (
            <li key={step.key}>
              {step.href ? (
                <Link href={step.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-surface-light">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
