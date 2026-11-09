import { appUrl, siteUrl } from "@/lib/app-url";
import { BRAND_CONTACT_EMAIL, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { LICENSES, TRIAL_AI_CREDITS_PER_USER, TRIAL_MAX_USERS } from "@/lib/billing/licenses";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { GUIDES, guidePath } from "@/app/(marketing)/_guides";
import { getPublishedPosts } from "@/lib/blog/posts";

// Dinámico: las URLs salen de SITE_URL/APP_URL en runtime.
export const dynamic = "force-dynamic";

// Resumen del sitio para asistentes de IA (convención llms.txt). Los precios y
// cupos salen del mismo catálogo que cobra la app, así que no se desfasan.
export async function GET() {
  const posts = (await getPublishedPosts()).slice(0, 15);
  const n = (v: number) => v.toLocaleString("es-MX");
  const body = `# ${BRAND_NAME}

> ${BRAND_TAGLINE}. ${BRAND_NAME} reúne WhatsApp (API oficial de Meta, con Coexistencia), Instagram, Messenger, Telegram y chat web en una sola bandeja, con CRM, embudos de ventas, citas, automatizaciones y bots de IA que responden con la información del negocio. Está pensado para pymes de México que venden por chat.

## Datos clave

- Qué es: un CRM con bandeja unificada de mensajería, en español y pensado para negocios de México.
- Para quién: dueños de negocio y equipos de ventas o atención que reciben clientes por WhatsApp y redes.
- Modelo de precio: una licencia por persona al mes, en pesos mexicanos (MXN), y cada persona puede tener una licencia distinta. Básico $${PLANS.ESSENTIAL.pricePerSeatMxn}, Avanzado $${PLANS.BUSINESS.pricePerSeatMxn}, Pro $${PLANS.PRO.pricePerSeatMxn}. Empresarial es a la medida.
- Prueba gratuita: ${TRIAL_DAYS} días con todas las funciones de Pro para hasta ${TRIAL_MAX_USERS} personas, sin tarjeta. Al terminar, sin pago la cuenta queda en solo lectura y los datos se conservan.
- Créditos de IA: de cada persona. Avanzado ${n(LICENSES.BUSINESS.aiCreditsPerMonth)} al mes, Pro ${n(LICENSES.PRO.aiCreditsPerMonth)}, Básico sin IA; en la prueba, ${n(TRIAL_AI_CREDITS_PER_USER)} por persona.
- Canales por licencia: 1 WhatsApp, 1 Instagram, 1 Messenger, 1 Telegram y 1 chat web.
- Los costos de conversación de WhatsApp los cobra Meta aparte.
- Integración: API REST y webhooks firmados (licencia Pro, administrador).
- Contacto: ${BRAND_CONTACT_EMAIL}

## Páginas

- [Inicio](${siteUrl("/")}): qué hace ${BRAND_NAME}, cómo empezar y preguntas frecuentes.
- [Planes y precios](${siteUrl("/precios")}): licencias, cupos de contactos y créditos de IA.
${GUIDES.map((g) => `- [${g.title}](${siteUrl(guidePath(g))}): ${g.description}`).join("\n")}
${posts.length ? `- [Blog](${siteUrl("/blog")}): artículos sobre WhatsApp Business, ventas por chat y automatización.\n${posts.map((p) => `  - [${p.title}](${siteUrl("/blog/" + p.slug)}): ${p.description}`).join("\n")}\n` : ""}- [API y webhooks](${appUrl("/docs/api")}): documentación para desarrolladores.
- [Contacto y soporte](${siteUrl("/contacto")})
- [Aviso de privacidad](${siteUrl("/privacidad")})
- [Términos y condiciones](${siteUrl("/terminos")})
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
