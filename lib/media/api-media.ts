import { promises as fs } from "fs";
import type { ApiMedia, WAAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { uploadMedia } from "@/lib/whatsapp";
import { API_MEDIA_RETENTION_DAYS } from "@/lib/api/constants";
import { resolveAbsolutePath, saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import {
  OUTBOUND_MEDIA_RULES,
  OutboundMediaError,
  defaultFilename,
  resolveOutboundMime,
  type OutboundMediaFile,
} from "@/lib/messaging/outbound-media";

// Archivos de POST /api/v1/media: se suben una vez y se reusan en muchos
// envíos (media.id en POST /messages, headerParam de una plantilla), como los
// media id de Meta. Colibly guarda el archivo (no un id de Meta, que es por
// número y caduca) y lo manda por el canal en cada envío.
//
// Carpeta: MEDIA_ROOT/api-<orgId>/ (lib/org-data/delete.ts la borra con la
// organización). Caducan a los API_MEDIA_RETENTION_DAYS (media-cleanup-worker).

export const API_MEDIA_TYPES = ["image", "document", "audio", "video", "sticker"] as const;
export type ApiMediaType = (typeof API_MEDIA_TYPES)[number];

export function apiMediaFolder(organizationId: string): string {
  return `api-${organizationId}`;
}

/** Valida tipo y tamaño de un archivo subido. Pura salvo el sticker (sharp). */
export async function validateApiMediaFile(type: ApiMediaType, file: OutboundMediaFile): Promise<OutboundMediaFile> {
  if (type === "sticker") {
    const { validateSticker } = await import("@/lib/whatsapp/stickers");
    try {
      await validateSticker(file.buffer);
    } catch (err) {
      throw new OutboundMediaError(err instanceof Error ? err.message : String(err));
    }
    return { buffer: file.buffer, mimeType: "image/webp", filename: file.filename || "sticker.webp" };
  }
  const rules = OUTBOUND_MEDIA_RULES[type];
  if (file.buffer.length === 0) throw new OutboundMediaError("El archivo está vacío");
  if (file.buffer.length > rules.maxBytes) {
    throw new OutboundMediaError(`El archivo pesa ${(file.buffer.length / 1024 / 1024).toFixed(1)} MB; ${type} admite hasta ${rules.maxBytes / 1024 / 1024} MB`);
  }
  const mimeType = resolveOutboundMime(type, { declared: null, header: file.mimeType, filename: file.filename });
  return { buffer: file.buffer, mimeType, filename: file.filename || defaultFilename(type, mimeType) };
}

export async function storeApiMedia(organizationId: string, type: ApiMediaType, file: OutboundMediaFile): Promise<ApiMedia> {
  const stored = await saveMediaFromBuffer(apiMediaFolder(organizationId), file.buffer, file.mimeType);
  return prisma.apiMedia.create({
    data: {
      organizationId,
      mediaType: type,
      path: stored.relativePath,
      mimeType: file.mimeType,
      filename: file.filename.slice(0, 200),
      bytesSize: stored.bytesSize,
      sha256: stored.sha256 ?? "",
      expiresAt: new Date(Date.now() + API_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
}

export function serializeApiMedia(m: ApiMedia) {
  return {
    id: m.id,
    type: m.mediaType,
    mimeType: m.mimeType,
    filename: m.filename,
    bytes: m.bytesSize,
    sha256: m.sha256,
    createdAt: m.createdAt,
    expiresAt: m.expiresAt,
  };
}

/** El archivo vigente de la organización; null si no existe, es de otra o caducó. */
export async function findApiMedia(organizationId: string, id: string): Promise<ApiMedia | null> {
  const row = await prisma.apiMedia.findFirst({ where: { id, organizationId, expiresAt: { gt: new Date() } } });
  return row;
}

export async function readApiMedia(row: ApiMedia): Promise<OutboundMediaFile> {
  const buffer = await fs.readFile(resolveAbsolutePath(row.path)).catch(() => null);
  if (!buffer) throw new OutboundMediaError("El archivo ya no está disponible: súbelo de nuevo con POST /media");
  return { buffer, mimeType: row.mimeType, filename: row.filename };
}

export async function deleteApiMedia(row: Pick<ApiMedia, "id" | "path">): Promise<void> {
  await prisma.apiMedia.delete({ where: { id: row.id } }).catch(() => {});
  await fs.unlink(resolveAbsolutePath(row.path)).catch(() => {});
}

/** Un valor de headerParam que no es URL ni id numérico de Meta: id de POST /media. */
export function looksLikeApiMediaId(value: string | null | undefined): value is string {
  return !!value && !/^https:\/\//i.test(value) && !/^\d+$/.test(value) && /^c[a-z0-9]{20,40}$/.test(value);
}

/**
 * Sube a Meta (al número de la cuenta) un archivo de POST /media y devuelve
 * el media id de Meta, para cabeceras de plantilla y tarjetas de carrusel.
 */
export async function apiMediaToMetaId(account: Pick<WAAccount, "organizationId" | "phoneNumberId" | "accessToken">, id: string): Promise<string> {
  const row = await findApiMedia(account.organizationId, id);
  if (!row) throw new OutboundMediaError(`No existe el archivo ${id} (POST /media) o ya caducó`);
  if (!account.phoneNumberId || !account.accessToken) throw new OutboundMediaError("La cuenta no tiene credenciales de Meta Cloud API");
  const file = await readApiMedia(row);
  const uploaded = await uploadMedia(account.phoneNumberId, decrypt(account.accessToken), file.buffer, file.filename, file.mimeType);
  return uploaded.id;
}
