import Link from "next/link";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/billing/plans";

// Días de prueba al pie del menú (D-01): reemplaza la banda azul que iba a todo
// lo ancho en cada pantalla. En el celular sale en el menú "Más" (mismo
// SidebarContent). Arriba solo queda el aviso de warning (≤3 días) o de
// problema (pago fallido, solo lectura): ver app/(dashboard)/layout.tsx.
export function TrialCard({ daysLeft }: { daysLeft: number }) {
  const days = Math.max(0, daysLeft);
  const pct = Math.min(100, Math.max(0, Math.round((days / TRIAL_DAYS) * 100)));
  return (
    <div className="mb-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="font-medium text-foreground">
        Prueba {PLANS[TRIAL_PLAN].name} · {days === 1 ? "queda 1 día" : `quedan ${days} días`}
      </p>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-surface-light"
        role="progressbar"
        aria-label="Días de prueba restantes"
        aria-valuemin={0}
        aria-valuemax={TRIAL_DAYS}
        aria-valuenow={days}
      >
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <Link href="/configuracion/plan" className="mt-2 inline-block text-xs font-medium text-accent-ink underline underline-offset-2">
        Elegir plan
      </Link>
    </div>
  );
}
