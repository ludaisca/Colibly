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

// TODO(usuario): define aquí qué estados de LeadStatus se reportan a Meta y
// con qué event_name/value — es una decisión de negocio, no técnica, y
// cambia el resultado real de la optimización de tus campañas:
//
//   - ¿Se reporta NEW? Probablemente no — Meta ya sabe que el lead se creó
//     desde el momento del clic/formulario, este estado no aporta señal
//     nueva sobre CALIDAD.
//   - ¿Se reporta CONTACTED? Señal débil de progreso — opcional.
//   - ¿Se reporta LOST como señal NEGATIVA explícita? Es lo que le enseña al
//     algoritmo a NO mostrarle el anuncio a perfiles parecidos — pero
//     "LOST" a veces solo significa "no le dimos seguimiento a tiempo", no
//     que el lead en sí era malo. Mandar esa señal cuando no es cierta
//     ensucia el aprendizaje del lado de Meta.
//   - ¿QUALIFIED y CUSTOMER llevan distinto peso/valor? (p.ej. CUSTOMER con
//     un `value` real de la venta, QUALIFIED sin value).
//
// Devolver `null`/`report:false` es la opción segura mientras decides —
// equivale a "no reportar nada todavía", nunca a un error.
export function mapLeadStatusToMetaEvent(status: LeadStatus): LeadStatusMapping | null {
  void status; // placeholder hasta que se complete el mapeo real de negocio
  return null;
}
