import sharp from "sharp";

export const STICKER_LIMIT = 100;
export const STICKER_MAX_BYTES = 500 * 1024;
export async function validateSticker(data: Buffer) {
  if (!data.length || data.length > STICKER_MAX_BYTES) throw new Error("El sticker no puede superar 500 KB");
  let metadata;
  try { metadata = await sharp(data, { animated: true, limitInputPixels: 512 * 512 * 300 }).metadata(); }
  catch { throw new Error("El archivo no es una imagen WebP válida"); }
  if (metadata.format !== "webp") throw new Error("Sube un sticker en formato WebP (.webp)");
  if (metadata.width !== 512 || (metadata.pageHeight ?? metadata.height) !== 512) throw new Error("El sticker debe medir 512 × 512 píxeles");
  const animated = (metadata.pages ?? 1) > 1;
  if (!animated && data.length > 100 * 1024) throw new Error("Los stickers estáticos no pueden superar 100 KB");
  return { animated };
}
