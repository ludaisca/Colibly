// Copia local del archivo saliente (Telegram no tiene el paso "subir → id"
// de Meta): el envío lee esos bytes (lib/telegram/send.ts:sendTelegramMedia).
import { channelMediaUploadPOST } from "@/lib/channels/routes";

export const POST = channelMediaUploadPOST("telegram");
