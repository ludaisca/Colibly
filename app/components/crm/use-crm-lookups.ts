"use client";

import { useEffect, useState } from "react";

// Catálogos que casi toda pantalla del CRM necesita (pipelines con sus etapas,
// motivos de pérdida y equipo). Se piden una vez y se comparten 60 s entre
// componentes, para que abrir la ficha, un diálogo y un panel no repitan la
// misma consulta.

export interface PipelineStageOption {
  id: string;
  name: string;
  color: string;
  outcome: "OPEN" | "WON" | "LOST";
  probability: number;
}
export interface PipelineOption {
  id: string;
  name: string;
  isDefault: boolean;
  stages: PipelineStageOption[];
}
export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
}
export interface LossReasonOption {
  id: string;
  name: string;
}

const TTL = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function load<T>(key: string, url: string, pick: (json: never) => T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar");
        const value = pick((await res.json()) as never);
        cache.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

function useLookup<T>(key: string, url: string, pick: (json: never) => T, initial: T, enabled = true): T {
  const [value, setValue] = useState<T>(() => (cache.get(key)?.value as T | undefined) ?? initial);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load(key, url, pick)
      .then((v) => alive && setValue(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // pick es estable por llamada: solo cambian key, url y enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url, enabled]);
  return value;
}

const pickPipelines = (j: { items: PipelineOption[]; currency: string }) => ({ items: j.items, currency: j.currency });
const pickTeam = (j: { items: TeamMember[] }) => j.items;
const pickReasons = (j: { items: LossReasonOption[] }) => j.items;

export function usePipelines(enabled = true): { items: PipelineOption[]; currency: string } {
  return useLookup("pipelines", "/api/crm/pipelines", pickPipelines, { items: [], currency: "MXN" }, enabled);
}
export function useTeam(enabled = true): TeamMember[] {
  return useLookup("team", "/api/crm/team", pickTeam, [] as TeamMember[], enabled);
}
export function useLossReasons(enabled = true): LossReasonOption[] {
  return useLookup("loss-reasons", "/api/crm/loss-reasons", pickReasons, [] as LossReasonOption[], enabled);
}

// Tras cambiar la configuración (o tras crear algo que altere los conteos) se
// puede olvidar la copia local.
export function invalidateCrmLookups(): void {
  cache.clear();
}
