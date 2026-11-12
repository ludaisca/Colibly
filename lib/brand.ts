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
// WhatsApp de soporte del sitio público (/contacto, pie, JSON-LD). Es el mismo
// número que SUPPORT_WHATSAPP usa en /ayuda, pero fijo: el sitio no depende
// de esa variable. Dígitos para wa.me y schema.org; el texto es para mostrar.
export const BRAND_SUPPORT_WHATSAPP = "5215644165153";
export const BRAND_SUPPORT_WHATSAPP_DISPLAY = "+52 1 56 4416 5153";
export const BRAND_SUPPORT_WHATSAPP_URL = `https://wa.me/${BRAND_SUPPORT_WHATSAPP}`;
// Remitente por defecto del correo transaccional (si /plataforma no define otro).
export const BRAND_NOREPLY_EMAIL = `noreply@${BRAND_DOMAIN}`;
