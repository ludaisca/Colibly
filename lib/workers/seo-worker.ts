import { submitChangedPages } from "@/lib/seo/indexnow";

// Tick de SEO (cola seo-indexnow): avisa a IndexNow de las páginas públicas
// nuevas o editadas. Corre al arrancar la app (un deploy trae contenido nuevo)
// y una vez al día (los posts programados salen solos en su fecha). Un fallo
// no se reintenta con BullMQ: el siguiente tick lo hace, porque los hashes solo
// se guardan tras un envío aceptado.
export async function processSeoJob(): Promise<void> {
  try {
    await submitChangedPages();
  } catch (error) {
    console.error("[seo] IndexNow falló:", error instanceof Error ? error.message : error);
  }
}
