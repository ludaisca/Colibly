// Permisos de una API key. La key nunca ve más que su dueño (alcance de
// cuentas), y dentro de eso solo puede hacer lo que sus scopes permiten.
export const API_SCOPES = {
  "contacts:read": "Leer contactos, etiquetas y campos",
  "contacts:write": "Crear y editar contactos y etiquetas",
  "people:read": "Leer personas (contactos del CRM)",
  "people:write": "Crear y editar personas",
  "companies:read": "Leer empresas",
  "companies:write": "Crear y editar empresas",
  "tasks:read": "Leer tareas",
  "tasks:write": "Crear, editar, completar y borrar tareas",
  "reports:read": "Leer reportes de ventas (embudo, pronóstico…)",
  "deals:read": "Leer pipelines y negocios",
  "deals:write": "Crear negocios, editarlos, moverlos de etapa y cerrarlos",
  "conversations:read": "Leer conversaciones y mensajes",
  "messages:send": "Enviar mensajes (texto, plantillas y botones)",
  "webhooks:manage": "Administrar webhooks salientes",
  "automations:run": "Iniciar automatizaciones manuales",
} as const;

export type ApiScope = keyof typeof API_SCOPES;

export const API_SCOPE_LIST = Object.keys(API_SCOPES) as ApiScope[];

export function isApiScope(value: string): value is ApiScope {
  return value in API_SCOPES;
}
