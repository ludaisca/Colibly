import type { LeadStatus } from "@prisma/client";

export interface LeadStatusMapping {
  // Si false (o si mapLeadStatusToMetaEvent devuelve null), este estado NO se
  // reporta a Meta — sendLeadConversionEvent() sale sin hacer nada.
  report: boolean;
  // Nombre del evento que se manda en `event_name`. Meta no impone un
  // vocabulario fijo para "Conversion Leads": en el paso 2 de la config en
  // Events Manager, tú mapeas tus propias etapas de embudo a las de Meta — el
  // string que pongas aquí debe coincidir con lo que configuraste ahí.
  eventName: string;
  // Opcional: valor monetario esperado para ese estado (custom_data.value),
  // si quieres que Meta optimice también por valor y no solo por
  // ocurrencia. Requiere currency.
  value?: number;
  currency?: string;
}

// Decisión de negocio (2026-08-05): se reportan CONTACTED, QUALIFIED,
// CUSTOMER y LOST. NEW se omite — Meta ya sabe que el lead se creó desde el
// clic/formulario, ese estado no aporta señal nueva sobre calidad. Nombres de
// evento estándar (sin config previa en Events Manager); si más adelante se
// define un mapeo de embudo distinto ahí, ajustar los strings de abajo para
// que coincidan. Sin `value`/`currency` por ahora — solo se reporta
// ocurrencia, no se optimiza por valor todavía.
const MAPPING: Record<LeadStatus, LeadStatusMapping | null> = {
  NEW: null,
  CONTACTED: { report: true, eventName: "Contact" },
  QUALIFIED: { report: true, eventName: "Lead" },
  CUSTOMER: { report: true, eventName: "Purchase" },
  // Señal negativa explícita — le enseña al algoritmo a no priorizar
  // perfiles parecidos. Ojo: "LOST" a veces solo significa "no le dimos
  // seguimiento a tiempo", no que el lead en sí era malo; si eso empieza a
  // ensuciar el aprendizaje de Meta, la corrección es dejar de mover leads a
  // LOST por descuido operativo, no quitar este mapeo.
  LOST: { report: true, eventName: "LeadLost" },
};

export function mapLeadStatusToMetaEvent(status: LeadStatus): LeadStatusMapping | null {
  return MAPPING[status];
}
