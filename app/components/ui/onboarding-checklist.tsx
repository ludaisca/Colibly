import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { nextOnboardingStep, type OnboardingStep } from "@/lib/onboarding";
import { Button } from "./button";
import { SectionHeader } from "./section-header";
import { Progress } from "./progress";
import { cn } from "./cn";

// Checklist de primeros pasos del panel (server-safe). El panel lo muestra
// mientras quede algún paso pendiente.
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = nextOnboardingStep(steps);
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      {/* Siguiente paso destacado: una sola acción clara arriba de la lista. */}
      {next && (
        <div className="mb-5 rounded-lg bg-accent-subtle p-4">
          <p className="text-title text-foreground">{next.step.title}</p>
          <p className="mt-0.5 text-sm text-muted">{next.step.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button href={next.step.href!}>{next.cta}</Button>
            {next.secondary && <Button href={next.secondary.href} variant="secondary">{next.secondary.label}</Button>}
          </div>
        </div>
      )}
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
                  step.done ? "border-accent-strong bg-accent text-on-accent" : "border-border text-muted"
                )}
                aria-hidden
              >
                {step.done ? <Check size={14} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", step.done && "text-muted line-through")}>{step.title}</span>
                {!step.done && <span className="block text-xs text-muted-darker">{step.description}</span>}
              </span>
              {!step.done && step.href && <ArrowRight size={16} className="mt-1 shrink-0 text-accent-ink" aria-hidden />}
            </>
          );
          return (
            <li key={step.key}>
              {!step.done && step.href ? (
                <Link href={step.href} className="-mx-2 flex items-start gap-3 rounded-sm px-2 py-3 hover:bg-surface-light">
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
