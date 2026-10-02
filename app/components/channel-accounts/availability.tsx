"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/app/components/ui/banner";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

type Channel = "telegram" | "messenger" | "instagram" | "webchat";
type Flags = Record<Channel, boolean>;

export function useChannelAvailability(channel: Channel) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion/canales")
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo consultar la disponibilidad");
        return res.json() as Promise<Flags>;
      })
      .then((flags) => setAvailable(flags[channel]))
      .catch(() => setError(true));
  }, [channel]);

  return { available, error };
}

export function ChannelAvailabilityNotice({ available, error }: { available: boolean | null; error: boolean }) {
  if (error) return <Banner tone="danger">No se pudo consultar si puedes conectar nuevas cuentas. Recarga la página.</Banner>;
  if (available !== false) return null;
  return (
    <Banner tone="info">
      Para conectar nuevas cuentas de este canal, solicita su activación a{" "}
      <a className="underline" href={`mailto:${BRAND_CONTACT_EMAIL}?subject=Activar%20canal%20en%20Colibly`}>{BRAND_CONTACT_EMAIL}</a>.
      Las cuentas existentes siguen funcionando.
    </Banner>
  );
}
