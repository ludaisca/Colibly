"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

type Flags = { telegram: boolean; messenger: boolean; instagram: boolean; webchat: boolean };
const CHANNELS = [
  ["telegram", "Telegram"],
  ["messenger", "Messenger"],
  ["instagram", "Instagram"],
  ["webchat", "Chat web"],
] as const;

export function CanalesSection() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/configuracion/canales")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los canales");
        return data as Flags;
      })
      .then(setFlags)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los canales"));
  }, []);

  return (
    <Card as="section" className="space-y-4">
      <SectionHeader title="Canales disponibles" />
      <p className="text-sm text-muted">WhatsApp está disponible para todas las organizaciones. El equipo de Colibly habilita los demás canales cuando los solicitas.</p>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="divide-y divide-border border-y border-border">
        <div className="flex items-center justify-between gap-3 py-3 text-sm">
          <span>WhatsApp</span><Badge tone="success" size="sm">Disponible</Badge>
        </div>
        {CHANNELS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>{label}</span>
            <Badge tone={flags?.[key] ? "success" : "neutral"} size="sm">
              {flags ? flags[key] ? "Disponible" : "Por solicitud" : "Cargando…"}
            </Badge>
          </div>
        ))}
      </div>
      {flags && Object.values(flags).some((enabled) => !enabled) && (
        <p className="text-sm text-muted">
          Para solicitar un canal, escribe a <a className="text-accent-ink underline" href={`mailto:${BRAND_CONTACT_EMAIL}?subject=Activar%20canal%20en%20Colibly`}>{BRAND_CONTACT_EMAIL}</a>.
        </p>
      )}
    </Card>
  );
}
