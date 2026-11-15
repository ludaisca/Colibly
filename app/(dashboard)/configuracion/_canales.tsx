"use client";

import { useEffect, useState } from "react";
import { SettingsBlock } from "@/app/components/ui/settings-block";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
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
    <SettingsBlock title="Canales disponibles" description="Qué canales están activos en tu cuenta y su estado.">
      <p className="text-sm text-muted">
        Todos los canales están disponibles desde el inicio. Conéctalos con tus propias credenciales; tu plan define cuántos puedes usar.
      </p>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="divide-y divide-border border-y border-border">
        <div className="flex items-center justify-between gap-3 py-3 text-sm">
          <span>WhatsApp</span><Badge tone="success" size="sm">Disponible</Badge>
        </div>
        {CHANNELS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>{label}</span>
            <Badge tone={flags?.[key] ? "success" : error ? "warning" : "neutral"} size="sm">
              {flags ? (flags[key] ? "Disponible" : "Desactivado") : error ? "No se pudo cargar" : "Cargando…"}
            </Badge>
          </div>
        ))}
      </div>
      {flags && Object.values(flags).some((enabled) => !enabled) && (
        <p className="text-sm text-muted">
          Si tu organización tiene un canal desactivado, escribe a{" "}
          <a className="text-accent-ink underline" href={`mailto:${BRAND_CONTACT_EMAIL}?subject=Reactivar%20canal%20en%20Colibly`}>
            {BRAND_CONTACT_EMAIL}
          </a>
          .
        </p>
      )}
    </SettingsBlock>
  );
}
