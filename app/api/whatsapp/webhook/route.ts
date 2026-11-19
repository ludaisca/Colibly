import { after, NextResponse } from "next/server";
import { refreshPhoneHealth } from "@/lib/whatsapp/phone-health";
import { createHash } from "crypto";
import { emitDomainEvent } from "@/lib/events/emit";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { validateWhatsAppWebhookSignature, verifyTokenMatches } from "@/lib/meta/platform-app";
import { getPlatformSettings } from "@/lib/platform-settings";
import { COEXISTENCE_FIELDS, handleCoexistenceChange, type CoexistenceField } from "@/lib/whatsapp/coexistence/webhook";
import { handleCallsWebhook } from "@/lib/whatsapp/calling/ingest";
import { applyConnectionLifecycle } from "@/lib/whatsapp/coexistence/lifecycle";
import { handleTemplateChange, TEMPLATE_FIELDS } from "@/lib/whatsapp/template-webhook";
import { isNegativeQualityEvent, qualityEventText } from "@/lib/platform/whatsapp-health-rules";
import { processMessagesValue, type WebhookValue } from "@/lib/whatsapp/webhook-messages";
import { whatsappInboundQueue } from "@/lib/queue";



// Payload de Meta para el campo `phone_number_quality_update` — no llega con
// `metadata.phone_number_id` (no es un evento "de mensaje"), así que la cuenta
// se resuelve por wabaId + número.
interface QualityUpdateValue {
  display_phone_number?: string;
  event?: string; // p. ej. "FLAGGED" | "UNFLAGGED" | "GREEN" | "YELLOW" | "RED"
  current_limit?: string; // p. ej. "TIER_1K"
}

// Payload para el campo `account_update` — reporta baneos/restricciones y otros
// cambios de estado de la cuenta. Tampoco trae metadata.phone_number_id.
interface AccountUpdateValue {
  phone_number?: string;
  event?: string;
  ban_info?: { waba_ban_state?: string; waba_ban_date?: string };
  // Coexistencia: motivo de una desconexión (PARTNER_REMOVED).
  disconnection_info?: { reason?: string; initiated_by?: string };
}

// Payload para el campo `user_preferences` — opt-out/opt-in nativo de WhatsApp
// para mensajes de marketing. Sí trae metadata (es por número, como messages).
interface UserPreferencesValue {
  metadata?: { phone_number_id?: string };
  user_preferences?: Array<{
    wa_id?: string;
    category?: string; // "marketing_messages"
    value?: string; // "stop" | "resume"
  }>;
}


function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

// account_update / phone_number_quality_update no traen phone_number_id (van a
// nivel de número/WABA, no de mensaje) — se resuelve por wabaId y, si hay más
// de un número bajo la misma WABA, se desambigua comparando el número reportado
// (normalizado) contra WAAccount.phoneNumber. Si no hay forma de desambiguar,
// no se adivina: se registra y se ignora el evento.
async function resolveAccountByWabaAndPhone(wabaId: string | undefined, phoneRaw: string | undefined) {
  if (!wabaId) return null;
  const candidates = await prisma.wAAccount.findMany({ where: { wabaId } });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    console.warn(`[webhook] wabaId ${wabaId} tiene ${candidates.length} cuentas y el evento no trae número — se omite`);
    return null;
  }
  const match = candidates.find((a) => normalizePhone(a.phoneNumber) === phone);
  if (!match) {
    console.warn(`[webhook] No se encontró cuenta con número ${phone} bajo wabaId ${wabaId}`);
  }
  return match ?? null;
}

async function applyPhoneNumberQualityUpdate(wabaId: string | undefined, value: QualityUpdateValue) {
  const account = await resolveAccountByWabaAndPhone(wabaId, value.display_phone_number);
  if (!account) return;

  // `event` es el SUCESO (FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE…), no la
  // calificación: se guarda aparte y la calidad real se vuelve a leer de Graph
  // después de responder a Meta.
  const rating = value.event ?? null;
  const tier = value.current_limit ?? null;

  await prisma.wAAccount.update({
    where: { id: account.id },
    data: { qualityEvent: rating, ...(tier ? { messagingTier: tier } : {}), qualityUpdatedAt: new Date() },
  });
  after(() => refreshPhoneHealth(account.id, { force: true }));
  await emitDomainEvent({
    type: "account.quality_changed",
    account: { kind: "whatsapp", id: account.id },
    contactId: null,
    chat: null,
    data: { event: rating, messagingTier: tier },
  });

  // Solo se notifica en señales negativas — un UPGRADE/GREEN no amerita alertar
  // al admin, solo se refleja en el badge de la cuenta.
  if (isNegativeQualityEvent(rating)) {
    await prisma.notification.create({
      data: {
        userId: account.userId,
        type: "ACCOUNT_STATUS",
        title: `Calidad del número «${account.name}»`,
        body: qualityEventText(rating as string, tier),
        link: `/whatsapp/cuentas/${account.id}`,
      },
    });
  }
}

async function applyAccountUpdate(wabaId: string | undefined, value: AccountUpdateValue) {
  const account = await resolveAccountByWabaAndPhone(wabaId, value.phone_number);
  if (!account) return;

  // Desconexión / cambio de teléfono / reconexión de una cuenta de coexistencia.
  if (await applyConnectionLifecycle(account, value)) return;

  const eventName = value.event ?? "UPDATE";
  const isRestriction = !!value.ban_info || /ban|disable|restrict|flag/i.test(eventName);

  if (isRestriction) {
    const detail = value.ban_info?.waba_ban_state
      ? `${eventName} (${value.ban_info.waba_ban_state})`
      : eventName;
    await prisma.wAAccount.update({
      where: { id: account.id },
      data: { status: "ERROR", errorMessage: `Meta reportó: ${detail}` },
    });
  }

  await prisma.notification.create({
    data: {
      userId: account.userId,
      type: "ACCOUNT_STATUS",
      title: `Cuenta "${account.name}": ${eventName}`,
      body: isRestriction
        ? "Meta restringió o marcó esta cuenta — revisa el estado en Cuentas WhatsApp."
        : `Actualización reportada por Meta: ${eventName}`,
      link: `/whatsapp/cuentas/${account.id}`,
    },
  });
}

async function applyUserPreferences(value: UserPreferencesValue) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const account = await prisma.wAAccount.findFirst({ where: { phoneNumberId } });
  if (!account) return;

  for (const pref of value.user_preferences ?? []) {
    if (pref.category !== "marketing_messages" || !pref.wa_id) continue;
    const optedOut = pref.value === "stop";
    const contacts = await prisma.contact.findMany({
      where: { accountId: account.id, remoteJid: { in: jidCandidates(pref.wa_id) } },
      select: { id: true },
    });
    for (const contact of contacts) {
      // Condicionado al valor anterior: Meta reintenta y solo el cambio real avisa.
      const changed = await prisma.contact.updateMany({
        where: { id: contact.id, optedOutMarketing: !optedOut },
        data: { optedOutMarketing: optedOut, optedOutAt: optedOut ? new Date() : null },
      });
      if (changed.count === 0) continue;
      await emitDomainEvent({
        type: "contact.marketing_preference_changed",
        account: { kind: "whatsapp", id: account.id },
        contactId: contact.id,
        chat: null,
        data: { optedOut, source: "whatsapp" },
      });
    }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Token global de la app de plataforma (Embedded Signup): una sola
  // suscripción de webhook en Meta sirve a todos los clientes conectados con él.
  // Un fallo al leer la configuración (p. ej. al descifrar) no debe romper la
  // verificación de las cuentas manuales, que se resuelve más abajo.
  const platformToken = await getPlatformSettings().then((s) => s.metaWebhookVerifyToken).catch(() => null);
  if (verifyTokenMatches(token, platformToken)) {
    return new NextResponse(challenge, { headers: { "Content-Type": "text/plain" } });
  }

  const hash = createHash("sha256").update(token).digest("hex");

  const account = await prisma.wAAccount.findFirst({
    where: { verifyTokenHash: hash, status: { not: "DISCONNECTED" } },
  });

  if (!account) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    // Límite alto a propósito: todo el tráfico legítimo de Meta llega desde
    // pocas IPs y compartido por todas las cuentas (una campaña de 1,000
    // mensajes genera ~3,000 callbacks de estado). La autenticación real es la
    // firma HMAC de cada payload.
    const { allowed } = await rateLimit(`webhook:${ip}`, 3000, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Malformado: reintentar no lo arregla.
      return NextResponse.json({ success: true });
    }
    const signature = req.headers.get("x-hub-signature-256");

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ success: true });
    }

    const entries = body.entry ?? [];

    for (const entry of entries) {
      // Para whatsapp_business_account, entry.id es el WABA ID — lo necesitan
      // account_update/phone_number_quality_update, que no traen phone_number_id.
      const wabaId: string | undefined = entry.id;
      const changes = entry.changes ?? [];

      for (const change of changes) {
        const field = change.field as string | undefined;

        if (field === "phone_number_quality_update") {
          const value = change.value as QualityUpdateValue;
          const account = await resolveAccountByWabaAndPhone(wabaId, value.display_phone_number);
          if (account) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await applyPhoneNumberQualityUpdate(wabaId, value);
            }
          }
          continue;
        }

        if (field === "account_update") {
          const value = change.value as AccountUpdateValue;
          const account = await resolveAccountByWabaAndPhone(wabaId, value.phone_number);
          if (account) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await applyAccountUpdate(wabaId, value);
            }
          }
          continue;
        }

        if (field === "user_preferences") {
          const value = change.value as UserPreferencesValue;
          const phoneNumberId = value.metadata?.phone_number_id;
          const account = phoneNumberId
            ? await prisma.wAAccount.findFirst({ where: { phoneNumberId } })
            : null;
          if (account) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await applyUserPreferences(value);
            }
          }
          continue;
        }

        if (field && COEXISTENCE_FIELDS.includes(field)) {
          await handleCoexistenceChange({ field: field as CoexistenceField, value: change.value, rawBody, signature });
          continue;
        }

        if (field && TEMPLATE_FIELDS.includes(field)) {
          await handleTemplateChange({
            field: field as "message_template_status_update" | "template_category_update",
            wabaId,
            value: change.value,
            rawBody,
            signature,
          }).catch((error) => console.error("[webhook] evento de plantilla falló", { field, error: error instanceof Error ? error.message : String(error) }));
          continue;
        }

        if (field === "calls") {
          const eventValue = change.value as { metadata?: { phone_number_id?: string } } | null;
          const phoneNumberId = eventValue?.metadata?.phone_number_id;
          const account = phoneNumberId
            ? await prisma.wAAccount.findFirst({ where: { phoneNumberId } })
            : null;
          if (account && (account.connectionType !== "MANUAL" || account.appSecret)) {
            const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
            if (sigValid) {
              await prisma.wAAccount.update({ where: { id: account.id }, data: { lastActivity: new Date() } });
              await handleCallsWebhook(account, eventValue).catch((error) => {
                console.error("[calls] no se pudo registrar la llamada", { accountId: account.id, error });
              });
            } else {
              console.warn(`[webhook] Firma inválida en calls para la cuenta "${account.name}" (${account.id})`);
            }
          }
          continue;
        }

        // Suscribir un campo en Meta no le da automáticamente una acción en
        // Colibly. Registrar solo su forma, tras verificar la firma, permite
        // estudiar los campos nuevos en DEV sin volcar teléfonos, mensajes ni
        // otros datos personales de Meta en los logs.
        if (field && field !== "messages") {
          const eventValue = change.value as Record<string, unknown> | null;
          const metadata = eventValue?.metadata as { phone_number_id?: string } | undefined;
          const candidates = metadata?.phone_number_id
            ? await prisma.wAAccount.findMany({ where: { phoneNumberId: metadata.phone_number_id } })
            : wabaId ? await prisma.wAAccount.findMany({ where: { wabaId } }) : [];
          for (const candidate of candidates) {
            if (await validateWhatsAppWebhookSignature(rawBody, signature, candidate)) {
              console.info("[webhook] Campo aún sin procesar", {
                field,
                accountId: candidate.id,
                keys: eventValue && typeof eventValue === "object" ? Object.keys(eventValue).sort() : [],
              });
              break;
            }
          }
          continue;
        }

        const value = change.value as WebhookValue;
        if (!value?.metadata?.phone_number_id) continue;

        const phoneNumberId = value.metadata.phone_number_id;

        const account = await prisma.wAAccount.findFirst({
          where: { phoneNumberId },
        });

        if (!account) continue;

        if (account.connectionType === "MANUAL" && !account.appSecret) {
          // Sin secreto la firma nunca valida — antes esto descartaba el
          // payload sin dejar rastro. La UI de la cuenta muestra el mismo aviso.
          console.warn(`[webhook] Cuenta "${account.name}" (${account.id}) sin App Secret — payload descartado. Configúralo en Cuentas WhatsApp.`);
          continue;
        }
        const sigValid = await validateWhatsAppWebhookSignature(rawBody, signature, account);
        if (!sigValid) {
          console.warn(`[webhook] Firma inválida para la cuenta "${account.name}" (${account.id}) — payload descartado`);
          continue;
        }

        // Firma válida: se encola y se responde ya (Meta espera respuesta en
        // segundos y reintenta). Sin Redis, en línea: perder un mensaje es peor
        // que tardar. lib/whatsapp/webhook-messages.ts hace el trabajo.
        const queued = await whatsappInboundQueue
          .add("messages", { accountId: account.id, value }, { attempts: 5, backoff: { type: "exponential", delay: 3000 } })
          .then(() => true)
          .catch((err) => {
            console.error("[webhook] no se pudo encolar; se procesa en línea:", err instanceof Error ? err.message : err);
            return false;
          });
        if (!queued) await processMessagesValue(account.id, value);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhook] Error procesando payload de WhatsApp:", error);
    // 500 para que Meta reintente (el dedup por wamid hace seguro el reintento).
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
