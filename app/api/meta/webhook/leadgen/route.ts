import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { validateMetaWebhookSignature } from "@/lib/meta/webhook-signature";
import { normalizePhone } from "@/lib/phone";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";

// Webhook de Meta para el campo `leadgen` (Instant Forms) de una Página de
// Facebook/Instagram. A diferencia del webhook de mensajes de WhatsApp, la
// notificación NO trae los datos del formulario — solo un `leadgen_id` que
// hay que ir a buscar por separado (fetchLeadFieldData). Mismo esqueleto de
// verificación/firma que app/api/whatsapp/webhook/route.ts, resolviendo la
// cuenta por `pageId` en vez de `phone_number_id`.
const GRAPH_API = "https://graph.facebook.com/v21.0";

interface LeadgenValue {
  ad_id?: string;
  form_id?: string;
  leadgen_id: string;
  created_time?: number;
  page_id?: string;
  adgroup_id?: string;
}

interface FieldDatum {
  name: string;
  values: string[];
}

async function fetchLeadFieldData(leadgenId: string, pageAccessToken: string): Promise<FieldDatum[] | null> {
  const url = `${GRAPH_API}/${leadgenId}?fields=field_data&access_token=${encodeURIComponent(pageAccessToken)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[meta-leadgen] fetch field_data failed:", res.status, errBody?.error?.message);
      return null;
    }
    const data = await res.json();
    return data.field_data ?? null;
  } catch (err) {
    console.error("[meta-leadgen] fetch field_data threw:", err);
    return null;
  }
}

function findField(fieldData: FieldDatum[], name: string): string | null {
  const target = name.toLowerCase();
  const match = fieldData.find((f) => f.name.toLowerCase() === target);
  return match?.values?.[0] ?? null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const hash = createHash("sha256").update(token).digest("hex");
  const account = await prisma.metaAdsAccount.findFirst({
    where: { verifyTokenHash: hash, status: { not: "DISCONNECTED" } },
  });

  if (!account) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = await rateLimit(`meta-leadgen-webhook:${ip}`, 300, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const signature = req.headers.get("x-hub-signature-256");

    if (body.object !== "page") {
      return NextResponse.json({ success: true });
    }

    const entries = body.entry ?? [];

    for (const entry of entries) {
      const entryPageId: string | undefined = entry.id;
      const changes = entry.changes ?? [];

      for (const change of changes) {
        if (change.field !== "leadgen") continue;

        const value = change.value as LeadgenValue;
        const pageId = value.page_id ?? entryPageId;
        if (!pageId || !value.leadgen_id) continue;

        const account = await prisma.metaAdsAccount.findFirst({ where: { pageId } });
        if (!account) continue;

        const sigValid = await validateMetaWebhookSignature(rawBody, signature, account.appSecret);
        if (!sigValid) continue;

        if (!account.waAccountId) {
          console.warn(
            `[meta-leadgen] MetaAdsAccount ${account.id} sin waAccountId vinculado — se descarta leadgen_id ${value.leadgen_id}`
          );
          continue;
        }
        if (!account.pageAccessToken) {
          console.warn(`[meta-leadgen] MetaAdsAccount ${account.id} sin pageAccessToken — no se puede resolver field_data`);
          continue;
        }

        const pageAccessToken = decrypt(account.pageAccessToken);
        const fieldData = await fetchLeadFieldData(value.leadgen_id, pageAccessToken);
        if (!fieldData) continue;

        const rawPhone = findField(fieldData, "phone_number");
        if (!rawPhone) {
          console.warn(`[meta-leadgen] lead ${value.leadgen_id} sin campo phone_number en field_data`);
          continue;
        }
        const phone = normalizePhone(rawPhone);
        const fullName = findField(fieldData, "full_name");

        const existingContact = await prisma.contact.findUnique({
          where: { accountId_remoteJid: { accountId: account.waAccountId, remoteJid: phone } },
          select: { name: true },
        });
        const nameShouldUpdate = fullName ? shouldUpdateName(fullName, existingContact?.name, phone) : false;

        // First-touch: leadOrigin/metaLeadId/adId/metaAdsAccountId solo se
        // setean en el create, mismo principio que la atribución CTWA en
        // lib/whatsapp/ingest-message.ts — un segundo lead del mismo teléfono
        // no debe pisar el origen ya registrado.
        await prisma.contact.upsert({
          where: { accountId_remoteJid: { accountId: account.waAccountId, remoteJid: phone } },
          create: {
            accountId: account.waAccountId,
            remoteJid: phone,
            name: fullName ?? phone,
            leadOrigin: "INSTANT_FORM",
            metaLeadId: value.leadgen_id,
            adId: value.ad_id ?? null,
            metaAdsAccountId: account.id,
          },
          update: nameShouldUpdate ? { name: fullName! } : {},
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[meta-leadgen webhook] Error:", error);
    // Igual que el webhook de WhatsApp: siempre 200, para no darle a un
    // atacante una señal de qué payload es inválido ni causar reintentos
    // infinitos de Meta.
    return NextResponse.json({ success: true });
  }
}
