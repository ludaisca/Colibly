import { BRAND_CONTACT_EMAIL } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";

// QA-017: /.well-known/security.txt (RFC 9116). El contacto es el correo
// oficial de la marca (lib/brand.ts); si se crea un buzón de seguridad propio,
// cambiarlo aquí. Expires se recalcula en cada petición: siempre un año.
export const dynamic = "force-dynamic";

export function GET() {
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const body = [
    `Contact: mailto:${BRAND_CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    "Preferred-Languages: es, en",
    `Canonical: ${siteUrl("/.well-known/security.txt")}`,
    `Policy: ${siteUrl("/privacidad")}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
