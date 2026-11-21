import esES from "@astryxdesign/core/locales/es-ES.generated.js";
import { astryxEsMxExtra } from "./es-mx";

// Idioma de los componentes de Astryx: es-MX (fechas y números de México) con
// el catálogo es-ES de Astryx más los textos que aún le faltan (`es-mx.ts`).
// Lo usan app/providers.tsx y las pruebas que dibujan componentes.
export const ASTRYX_LOCALE = "es-MX";
export const ASTRYX_MESSAGES = { [ASTRYX_LOCALE]: { ...esES, ...astryxEsMxExtra } };
