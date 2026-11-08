"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";

export type ContactLimitLevel = "ok" | "warning" | "full" | "grace";

export interface ContactUsageData {
  count: number;
  max: number | null;
  pct: number | null;
  level: ContactLimitLevel;
  graceCap: number | null;
  overLimitCount: number;
}

export const PLAN_URL = "/configuracion/plan";

export function useContactUsage(): ContactUsageData | null {
  const [usage, setUsage] = useState<ContactUsageData | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing/contacts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ContactUsageData | null) => { if (data && !controller.signal.aborted) setUsage(data); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return usage;
}

const BAR: Record<ContactLimitLevel, string> = { ok: "bg-accent", warning: "bg-warning", full: "bg-danger", grace: "bg-danger" };
const TEXT: Record<ContactLimitLevel, string> = { ok: "text-muted", warning: "text-warning", full: "text-danger", grace: "text-danger" };

const n = (v: number) => v.toLocaleString("es-MX");

// "X de Y contactos" con barra (colores a 80/100/120 %); "X contactos" sin tope.
export function ContactUsageMeter({ usage }: { usage: ContactUsageData | null }) {
  if (!usage) return null;
  if (usage.max === null) {
    return <p className="text-sm text-muted" aria-live="polite">{`${n(usage.count)} ${usage.count === 1 ? "contacto" : "contactos"}`}</p>;
  }
  const pct = usage.pct ?? 0;
  return (
    <div className="min-w-[220px] space-y-1" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{`${n(usage.count)} de ${n(usage.max)} contactos`}</span>
        <span className={`text-xs font-medium ${TEXT[usage.level]}`}>{pct} %</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-light" role="progressbar" aria-label="Contactos usados" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${BAR[usage.level]} transition-[width]`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

// Aviso a partir del 80 %, con CTA a Plan y facturación.
export function ContactLimitBanner({ usage, className }: { usage: ContactUsageData | null; className?: string }) {
  if (!usage || usage.max === null || usage.level === "ok") return null;
  const max = n(usage.max);
  const cta = <Button size="sm" variant="secondary" href={PLAN_URL}>Mejorar plan o agregar ejecutivos</Button>;
  if (usage.level === "grace") {
    return (
      <Banner tone="danger" title="Superaste el 120 % de tus contactos" action={cta} className={className}>
        {`Tienes ${n(usage.count)} contactos y tu plan incluye ${max}. Los contactos nuevos y sus mensajes se siguen guardando, pero bots, automatizaciones, secuencias y calificación con IA no corren para ${usage.overLimitCount > 0 ? `${n(usage.overLimitCount)} ${usage.overLimitCount === 1 ? "contacto" : "contactos"} fuera del límite` : "los contactos nuevos"} hasta que mejores tu plan o agregues ejecutivos.`}
      </Banner>
    );
  }
  if (usage.level === "full") {
    return (
      <Banner tone="danger" title="Llegaste al límite de contactos de tu plan" action={cta} className={className}>
        {`Tienes ${n(usage.count)} de ${max} contactos. Los clientes que te escriban se siguen guardando, pero ya no puedes agregar contactos a mano, por API ni con campañas. Arriba del 120 % (${n(usage.graceCap ?? 0)}) la IA y las automatizaciones dejan de correr para los contactos nuevos.`}
      </Banner>
    );
  }
  return (
    <Banner tone="warning" title={`Usas el ${usage.pct} % de tus contactos`} action={cta} className={className}>
      {`Tienes ${n(usage.count)} de ${max} contactos. Mejora tu plan o agrega ejecutivos antes de llegar al límite.`}
    </Banner>
  );
}

// Versión autónoma para páginas de servidor (Panel).
export function ContactLimitNotice({ className }: { className?: string }) {
  return <ContactLimitBanner usage={useContactUsage()} className={className} />;
}
