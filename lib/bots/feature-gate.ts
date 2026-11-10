import type { NextResponse } from "next/server";
import { checkChannelFeature, checkUserFeature } from "@/lib/billing/entitlements";

/** Un bot sin cuenta ni canal solo sirve para la pestaña "Probar": no atiende mensajes reales. */
export function isTestOnlyBot(bot: { waAccountId?: string | null; channelAccountId?: string | null }): boolean {
  return !bot.waAccountId && !bot.channelAccountId;
}

export const TEST_ONLY_ACTIVATE_MESSAGE = "Conecta una cuenta para que el bot responda mensajes reales";

/**
 * 402 si la licencia no incluye agentes de IA. Con canal, manda la licencia del
 * dueño del canal (regla 7 de las licencias). Sin canal ("Sin cuenta, solo
 * pruebas") no hay dueño de canal: manda la licencia de quien lo crea.
 */
export async function checkBotFeature(
  userId: string,
  ref: { waAccountId?: string | null; channelAccountId?: string | null }
): Promise<NextResponse | null> {
  if (isTestOnlyBot(ref)) return checkUserFeature(userId, "aiAgent");
  return checkChannelFeature({ waAccountId: ref.waAccountId ?? null, channelAccountId: ref.channelAccountId ?? null }, "aiAgent");
}
