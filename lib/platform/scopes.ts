// Scopes de la API de plataforma (operadores). No se mezclan con los de
// /api/v1, que son por organización. El orden importa para la UI.
export const PLATFORM_SCOPES = [
  "platform:read",
  "org:write",
  "user:write",
  "billing:write",
  "backup:write",
  "mail:test",
  "secret:write",
] as const;

export type PlatformScope = (typeof PLATFORM_SCOPES)[number];

export const PLATFORM_SCOPE_LABELS: Record<PlatformScope, string> = {
  "platform:read": "Leer estado, organizaciones, usuarios, salud de WhatsApp y auditoría",
  "org:write": "Extender prueba, dar créditos, suspender/reactivar",
  "user:write": "Quitar la verificación en dos pasos a un usuario (soporte)",
  "billing:write": "Reconciliar precios y rotar el webhook de Stripe",
  "backup:write": "Correr y probar respaldos",
  "mail:test": "Enviar correos de prueba",
  "secret:write": "Escribir secretos de la plataforma",
};

export function isPlatformScope(value: string): value is PlatformScope {
  return (PLATFORM_SCOPES as readonly string[]).includes(value);
}

// Contexto que devuelven tanto los tokens plt_ como los OAuth (poa_).
export interface PlatformTokenContext {
  tokenId: string;
  scopes: PlatformScope[];
  actorEmail: string;
  environment: string;
}
