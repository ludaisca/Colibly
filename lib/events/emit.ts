import { randomUUID } from "node:crypto";
import { domainEventQueue } from "@/lib/queue";
import type { DomainEvent, DomainEventInput } from "./types";

// Punto único de emisión. Solo encola (una escritura en Redis): el reparto a
// webhooks — y a automatizaciones en la fase 2 — ocurre en el worker de
// domain-events, fuera del request. Así el webhook de Meta, la ruta más
// caliente, no suma consultas por cada mensaje.
//
// Nunca lanza: el hecho (mensaje guardado, etiqueta agregada...) ya ocurrió y
// no debe revertirse ni convertirse en un 500 porque Redis falló — mismo
// criterio que enrollContactInTrigger().
export async function emitDomainEvent(input: DomainEventInput, occurredAt: Date = new Date()): Promise<void> {
  const event = { ...input, id: randomUUID(), occurredAt: occurredAt.toISOString() } as DomainEvent;
  try {
    await domainEventQueue.add(event.type, event, { jobId: event.id });
  } catch (err) {
    console.error(`[events] No se pudo encolar ${event.type}:`, err instanceof Error ? err.message : err);
  }
}
