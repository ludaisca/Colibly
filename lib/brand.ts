// Marca del producto en un solo lugar (client-safe). Todo se llama Colibly:
// repo, carpeta, contenedores, base de datos y paquete npm (2026-09-27).
// Historia: SundayCRM → SunflowCRM → Colibly. Solo conservan el nombre viejo
// el registro histórico (migraciones ya aplicadas, prisma/baseline, auditorías)
// y la clave antigua del widget de chat web, que se migra al leerla.
export const BRAND_NAME = "Colibly";
export const BRAND_TAGLINE = "El CRM de WhatsApp con IA para negocios que venden por chat";
// Dominio público de la marca. La URL real de la app sale de APP_URL en
// runtime (lib/app-url.ts); esto es para textos, correos y remitentes.
export const BRAND_DOMAIN = "colibly.com";
// Contacto y soporte (enlaces, textos y Reply-To de los correos).
export const BRAND_CONTACT_EMAIL = `contacto@${BRAND_DOMAIN}`;
// Remitente por defecto del correo transaccional (si /plataforma no define otro).
export const BRAND_NOREPLY_EMAIL = `noreply@${BRAND_DOMAIN}`;
