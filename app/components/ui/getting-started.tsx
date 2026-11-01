"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight } from "lucide-react";
import type { OnboardingStep } from "@/lib/onboarding";

// Estado vacío que enseña (F9): en vez de "Sin chats", los primeros pasos
// pendientes como tarjetas con enlace (mismos pasos que el checklist del
// panel, GET /api/onboarding). Respeta el rol: solo un admin ve pasos de
// configuración; los demás, qué esperar y a quién pedirle acceso.
export function GettingStarted({
  title,
  description,
  memberHint,
  extraAction,
}: {
  title: string;
  description: string;
  /** Texto para user/ejecutivo, que no pueden conectar canales ni invitar. */
  memberHint: string;
  /** Acción propia de la página (p. ej. "Importar contactos"). */
  extraAction?: ReactNode;
}) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [steps, setSteps] = useState<Array<Omit<OnboardingStep, "done">> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch("/api/onboarding")
      .then((res) => (res.ok ? res.json() : { steps: [] }))
      .then((data) => { if (!cancelled) setSteps(Array.isArray(data.steps) ? data.steps : []); })
      .catch(() => { if (!cancelled) setSteps([]); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const actionable = (steps ?? []).filter((step) => step.href);

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8 text-center">
      <div>
        <p className="font-display text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted">{isAdmin ? description : memberHint}</p>
      </div>
      {extraAction && <div className="flex justify-center">{extraAction}</div>}
      {isAdmin && actionable.length > 0 && (
        <ul className="space-y-2 text-left">
          {actionable.slice(0, 3).map((step) => (
            <li key={step.key}>
              <Link
                href={step.href!}
                className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent-strong hover:bg-accent-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{step.title}</span>
                  <span className="block text-xs text-muted">{step.description}</span>
                </span>
                <ArrowRight size={16} className="mt-0.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
