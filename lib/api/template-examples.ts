import type { WAAccount } from "@prisma/client";
import type { ApiTemplateComponents } from "@/lib/api/schemas";
import { uploadRemoteFileToMeta } from "@/lib/api/whatsapp-admin";
import { OUTBOUND_MEDIA_RULES } from "@/lib/messaging/outbound-media";
import { templateDefinitionError, type TemplateCategory, type TemplateComponentsDef } from "@/lib/whatsapp/template-definition";
import { ApiError } from "@/lib/api/respond";

// Ejemplo de cabecera multimedia: los formatos que Meta acepta en plantillas.
const HEADER_EXAMPLE_RULES: Record<"IMAGE" | "VIDEO" | "DOCUMENT", { maxBytes: number; mimeTypes: string[] }> = {
  IMAGE: OUTBOUND_MEDIA_RULES.image,
  VIDEO: { maxBytes: OUTBOUND_MEDIA_RULES.video.maxBytes, mimeTypes: ["video/mp4"] },
  DOCUMENT: { maxBytes: OUTBOUND_MEDIA_RULES.document.maxBytes, mimeTypes: ["application/pdf"] },
};

/**
 * Sube a Meta los archivos de ejemplo (cabecera y tarjetas del carrusel) y
 * devuelve la definición con sus handles. Sin URL, la validación de la
 * definición responde con el mensaje de siempre.
 */
export async function resolveTemplateExamples(account: WAAccount, c: ApiTemplateComponents): Promise<TemplateComponentsDef> {
  const { header, carousel, ...rest } = c;
  let resolvedHeader: TemplateComponentsDef["header"];
  if (header) {
    const { exampleUrl, ...h } = header;
    resolvedHeader =
      h.format === "TEXT" || h.format === "LOCATION" || !exampleUrl
        ? h
        : { ...h, exampleHandle: await uploadRemoteFileToMeta(account, "components.header.exampleUrl", exampleUrl, HEADER_EXAMPLE_RULES[h.format]) };
  }
  const resolvedCarousel = carousel
    ? await Promise.all(
        carousel.map(async ({ header: ch, ...card }, i) => ({
          ...card,
          header: {
            format: ch.format,
            exampleHandle: await uploadRemoteFileToMeta(account, `components.carousel[${i}].header.exampleUrl`, ch.exampleUrl, HEADER_EXAMPLE_RULES[ch.format]),
          },
        }))
      )
    : undefined;
  return { ...rest, ...(resolvedHeader ? { header: resolvedHeader } : {}), ...(resolvedCarousel ? { carousel: resolvedCarousel } : {}) };
}

/**
 * Valida la definición antes de descargar los ejemplos (un archivo dado
 * cuenta como ya subido): un error de forma no gasta descargas ni subidas a Meta.
 */
export function precheckTemplateDefinition(name: string, language: string, category: TemplateCategory, c: ApiTemplateComponents): void {
  const { header, carousel, ...rest } = c;
  const components: TemplateComponentsDef = {
    ...rest,
    ...(header ? { header: { ...header, exampleHandle: header.exampleUrl ? "pendiente" : undefined } } : {}),
    ...(carousel ? { carousel: carousel.map(({ header: h, ...card }) => ({ ...card, header: { format: h.format, exampleHandle: "pendiente" } })) } : {}),
  };
  const error = templateDefinitionError({ name, language, category, components });
  if (error) throw new ApiError(400, "invalid_request", error);
}
