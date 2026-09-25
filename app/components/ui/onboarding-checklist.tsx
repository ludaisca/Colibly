import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { OnboardingStep } from "@/lib/onboarding";
import { SectionHeader } from "./section-header";
import { Progress } from "./progress";
import { cn } from "./cn";

// Checklist de primeros pasos del panel (server-safe). El panel lo muestra
// mientras quede algún paso pendiente.
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        eyebrow="Primeros pasos"
        title="Deja lista tu cuenta"
        action={<span className="text-sm tabular-nums text-muted">{done} de {steps.length}</span>}
      />
      <Progress value={(done / steps.length) * 100} className="mt-3" />
      <ol className="mt-4 divide-y divide-border">
        {steps.map((step) => {
          const body = (
            <>
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  step.done ? "border-accent bg-accent text-on-accent" : "border-border text-muted"
                )}
                aria-hidden
              >
                {step.done ? <Check size={14} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", step.done && "text-muted line-through")}>{step.title}</span>
                {!step.done && <span className="block text-xs text-muted-darker">{step.description}</span>}
              </span>
              {!step.done && step.href && <ArrowRight size={16} className="mt-1 shrink-0 text-accent" aria-hidden />}
            </>
          );
          return (
            <li key={step.key}>
              {!step.done && step.href ? (
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
