// Constantes del captcha compartidas por el widget (cliente) y siteverify
// (servidor). Módulo sin dependencias de servidor: lo importa el componente
// cliente, que no puede cargar lib/turnstile.ts (Prisma).
export const TURNSTILE_ACTION = "signup";
