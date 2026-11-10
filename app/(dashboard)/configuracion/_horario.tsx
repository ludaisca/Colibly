"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { businessHoursSummary } from "@/lib/format/business-hours-summary";

// Resumen del horario del negocio (el mismo de /configuracion/ia#horario: un
// solo rango de horas para todos los días hábiles). Aquí solo se lee; se edita
// en Configuración de IA y operación.
export function HorarioNegocioCard() {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion/ia")
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok || d.error) throw new Error(d.error ?? "error");
        setSummary(businessHoursSummary({ timezone: d.timezone, businessHourStart: d.businessHourStart, businessHourEnd: d.businessHourEnd, businessDays: d.businessDays ?? [0, 1, 2, 3, 4, 5, 6] }));
      })
      .catch(() => setError(true));
  }, []);

  return (
    <Card as="section" className="space-y-4">
      <SectionHeader title="Horario del negocio" />
      <p className="text-sm text-muted">
        Define cuándo estás disponible: lo usan el mensaje fuera de horario, los avisos automáticos y las citas que agenda el bot.
      </p>
      <p className="text-sm font-medium text-foreground" aria-live="polite">
        {error ? "No se pudo cargar el horario. Puedes editarlo igualmente." : summary ?? "Cargando horario…"}
      </p>
      <Button href="/configuracion/ia#horario" variant="secondary" size="sm" icon={Clock}>
        Editar horario
      </Button>
    </Card>
  );
}
