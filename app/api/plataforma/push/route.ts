import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings, invalidatePlatformSettingsCache, updatePlatformSettings } from "@/lib/platform-settings";
import { generateVapidKeys } from "@/lib/notifications/push";

// Llaves VAPID de las notificaciones push. No se editan a mano: se generan
// aquí. Regenerarlas invalida todas las suscripciones (los navegadores
// firmaron con la llave pública anterior), así que se borran y cada usuario
// vuelve a activar los avisos.

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const settings = await getPlatformSettings();
  const subscriptions = await prisma.pushSubscription.count();
  return NextResponse.json({
    hasKeys: !!(settings.vapidPublicKey && settings.vapidPrivateKey),
    publicKey: settings.vapidPublicKey,
    subscriptions,
  });
}

export async function POST() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { publicKey, privateKey } = generateVapidKeys();
  await updatePlatformSettings({ vapidPublicKey: publicKey, vapidPrivateKey: privateKey }, admin.email);
  invalidatePlatformSettingsCache();
  const { count } = await prisma.pushSubscription.deleteMany({});
  console.log(`[plataforma] ${admin.email} → generó llaves push (borró ${count} suscripciones)`);
  return NextResponse.json({ hasKeys: true, publicKey, subscriptions: 0 });
}
