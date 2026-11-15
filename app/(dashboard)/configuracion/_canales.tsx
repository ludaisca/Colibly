"use client";

import { useEffect, useState } from "react";
import { SettingsBlock } from "@/app/components/ui/settings-block";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";
import { plural } from "@/lib/format/plural";

// Canales como tabla de una línea por canal con su estado real: cuántas
// cuentas tiene conectadas la organización, o si el canal está desactivado.
type Key = "whatsapp" | "telegram" | "messenger" | "instagram" | "webchat";
type Flags = Record<Exclude<Key, "whatsapp">, boolean> & { connected?: Record<Key, number> };
const CHANNELS: Array<{ key: Key; label: string; href: string }> = [
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp/cuentas" },
  { key: "telegram", label: "Telegram", href: "/telegram/cuentas" },
  { key: "messenger", label: "Messenger", href: "/messenger/cuentas" },
  { key: "instagram", label: "Instagram", href: "/instagram/cuentas" },
  { key: "webchat", label: "Chat web", href: "/webchat/cuentas" },
];

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

  const enabled = (key: Key) => key === "whatsapp" || !!flags?.[key];

  return (
    <SettingsBlock title="Canales" description="Cada canal con su estado en tu cuenta.">
      {error && <Banner tone="danger">{error}</Banner>}
      <ul className="divide-y divide-border border-y border-border">
        {CHANNELS.map(({ key, label, href }) => {
          const count = flags?.connected?.[key] ?? 0;
          return (
            <li key={key} className="flex h-11 items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 font-medium text-foreground">{label}</span>
              {!flags ? (
                <span className="text-xs text-muted">{error ? "—" : "Cargando…"}</span>
              ) : !enabled(key) ? (
                <Badge tone="neutral" size="sm">Desactivado</Badge>
              ) : count > 0 ? (
                <Badge tone="success" size="sm">{plural(count, "conectada", "conectadas")}</Badge>
              ) : (
                <span className="text-xs text-muted">Sin conectar</span>
              )}
              {flags && enabled(key) && (
                <Button href={href} variant="ghost" size="sm">{count > 0 ? "Ver" : "Conectar"}</Button>
              )}
            </li>
          );
        })}
      </ul>
      {flags && CHANNELS.some(({ key }) => !enabled(key)) && (
        <p className="text-sm text-muted">
          Para reactivar un canal desactivado, escribe a{" "}
          <a className="text-accent-ink underline" href={`mailto:${BRAND_CONTACT_EMAIL}?subject=Reactivar%20canal%20en%20Colibly`}>
            {BRAND_CONTACT_EMAIL}
          </a>
          .
        </p>
      )}
    </SettingsBlock>
  );
}
