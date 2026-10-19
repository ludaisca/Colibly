"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";

export type ChannelLimitKey = "whatsapp" | "telegram" | "messenger" | "instagram";

export interface ChannelLimitState {
  allowed: boolean;
  message?: string;
  actionUrl?: string;
  current?: number;
  max?: number;
}

// Estado del límite "1 por ejecutivo" (GET /api/billing/limit). `refresh`
// tras conectar o eliminar una cuenta.
export function useChannelLimit(key: ChannelLimitKey): { limit: ChannelLimitState | null; refresh: () => void } {
  const [limit, setLimit] = useState<ChannelLimitState | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/billing/limit?key=${key}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ChannelLimitState | null) => { if (data && !controller.signal.aborted) setLimit(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [key, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { limit, refresh };
}

export function ChannelLimitBanner({ limit }: { limit: ChannelLimitState | null }) {
  if (!limit || limit.allowed || !limit.message) return null;
  const toUsers = limit.actionUrl === "/usuarios";
  return (
    <Banner
      tone="warning"
      title="Ya usas todas las conexiones de tus ejecutivos"
      action={limit.actionUrl ? <Button size="sm" variant="secondary" href={limit.actionUrl}>{toUsers ? "Invitar ejecutivo" : "Agregar asiento"}</Button> : undefined}
    >
      {limit.message}
    </Banner>
  );
}
