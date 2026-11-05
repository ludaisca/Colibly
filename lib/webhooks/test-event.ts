import { randomUUID } from "node:crypto";
import { webhookDeliveryQueue } from "@/lib/queue";
import { createDelivery } from "@/lib/webhooks/fanout";
import { integrationFeatureMessage } from "@/lib/billing/entitlements";
import { BRAND_NAME } from "@/lib/brand";

// "Enviar evento de prueba": una entrega real (firmada, con reintentos y
// registro) de un evento webhook.test, para validar la URL y la verificación
// de firma del receptor sin esperar a que ocurra un evento real. La usan la
// pantalla de webhooks y POST /api/v1/webhooks/{id}/test.
export type TestEventResult =
  | { ok: true; deliveryId: string }
  | { ok: false; reason: "not_in_plan"; message: string }
  | { ok: false; reason: "inactive" | "failed" };

export async function sendWebhookTestEvent(endpoint: { id: string; active: boolean; userId: string }): Promise<TestEventResult> {
  // Mismo candado que el fanout: su dueño sigue siendo admin con webhooks en
  // su licencia (si no, una cuenta que bajó de plan seguiría mandando eventos).
  const blocked = await integrationFeatureMessage(endpoint.userId, "webhooks");
  if (blocked) return { ok: false, reason: "not_in_plan", message: blocked };
  if (!endpoint.active) return { ok: false, reason: "inactive" };

  const delivery = await createDelivery(endpoint.id, {
    id: randomUUID(),
    type: "webhook.test",
    occurredAt: new Date().toISOString(),
    account: null,
    contact: null,
    conversation: null,
    data: { message: `Evento de prueba enviado desde ${BRAND_NAME}` },
  });
  if (!delivery) return { ok: false, reason: "failed" };
  await webhookDeliveryQueue.add("deliver", { deliveryId: delivery.id }, { jobId: delivery.id });
  return { ok: true, deliveryId: delivery.id };
}
