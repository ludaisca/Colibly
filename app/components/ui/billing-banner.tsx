import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { BillingNotice } from "@/lib/billing/state";
import { bannerCta, bannerDismissible, bannerMessage } from "@/lib/billing/banner-copy";
import { cn } from "./cn";
import { DismissibleBanner } from "./dismissible-banner";

// Aviso del plan a todo lo ancho (slot topBanner del AppShell). Server-safe:
// sin estado, el layout lo arma con billingNotice(); solo el botón de cerrar
// (info y warning, durante la sesión) vive en un wrapper cliente.

const TONE = {
  info: "border-info-border bg-info-bg",
  warning: "border-warning-border bg-warning-bg",
  danger: "border-danger-border bg-danger-bg",
} as const;

const ICON_TONE = { info: "text-info", warning: "text-warning", danger: "text-danger" } as const;

export function BillingBanner({ notice, isAdmin }: { notice: BillingNotice; isAdmin: boolean }) {
  const Icon = notice.kind === "trial_ending" ? Clock : AlertTriangle;
  return (
    <DismissibleBanner dismissible={bannerDismissible(notice)} className={cn("shrink-0 border-y px-4 py-2.5 md:px-6", TONE[notice.tone])}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Icon size={16} className={cn("shrink-0", ICON_TONE[notice.tone])} aria-hidden />
        <p className="flex-1 min-w-0 text-foreground">
          {bannerMessage(notice)}
          {!isAdmin && notice.tone !== "info" && " Avísale a un administrador de tu cuenta."}
        </p>
        {isAdmin && (
          <Link
            href="/configuracion/plan"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent-strong"
          >
            {bannerCta(notice)}
          </Link>
        )}
      </div>
    </DismissibleBanner>
  );
}
