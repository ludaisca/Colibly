import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { BillingNotice } from "@/lib/billing/state";
import { cn } from "./cn";

// Aviso del plan a todo lo ancho (slot topBanner del AppShell). Server-safe:
// sin estado, el layout lo arma con billingNotice().

function message(notice: BillingNotice): string {
  const date = notice.date?.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  switch (notice.kind) {
    case "trial_ending":
      return notice.daysLeft === 1 ? "Tu prueba gratis termina mañana." : `Te quedan ${notice.daysLeft} días de prueba gratis.`;
    case "trial_expired":
      return "Tu prueba terminó: la cuenta está en solo lectura. No se envían mensajes ni responden los bots.";
    case "past_due":
      return `No pudimos cobrar tu suscripción. Actualiza tu pago antes del ${date} para no pasar a solo lectura.`;
    case "read_only":
      return "Tu cuenta está en solo lectura: no se envían mensajes ni responden los bots.";
    case "canceled":
      return "Tu suscripción terminó y la cuenta está en solo lectura. Tus datos se conservan 60 días.";
    case "canceling":
      return `Cancelaste tu suscripción: sigue activa hasta el ${date}.`;
  }
}

const TONE = {
  info: "border-info-border bg-info-bg",
  warning: "border-warning-border bg-warning-bg",
  danger: "border-danger-border bg-danger-bg",
} as const;

const ICON_TONE = { info: "text-info", warning: "text-warning", danger: "text-danger" } as const;

export function BillingBanner({ notice, isAdmin }: { notice: BillingNotice; isAdmin: boolean }) {
  const Icon = notice.kind === "trial_ending" ? Clock : AlertTriangle;
  const cta = notice.kind === "trial_ending" || notice.kind === "canceling" ? "Ver planes" : notice.kind === "past_due" ? "Actualizar pago" : "Reactivar";
  return (
    <div className={cn("shrink-0 border-y px-4 py-2.5 md:px-6", TONE[notice.tone])}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Icon size={16} className={cn("shrink-0", ICON_TONE[notice.tone])} aria-hidden />
        <p className="flex-1 min-w-0 text-foreground">
          {message(notice)}
          {!isAdmin && notice.tone !== "info" && " Avísale a un administrador de tu cuenta."}
        </p>
        {isAdmin && (
          <Link
            href="/configuracion/plan"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
          >
            {cta}
          </Link>
        )}
      </div>
    </div>
  );
}
