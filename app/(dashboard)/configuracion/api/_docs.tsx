"use client";

import { useSyncExternalStore } from "react";
import { FileJson } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { SecretField } from "@/app/components/integrations/secret-field";
import { DOMAIN_EVENT_CATALOG } from "@/lib/events/types";
import { BRAND_DOMAIN } from "@/lib/brand";

// El origen real solo existe en el navegador; en SSR se muestra el dominio público.
function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => `https://${BRAND_DOMAIN}`
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre tabIndex={0} aria-label="Ejemplo de código" className="overflow-x-auto rounded-xl bg-surface-light p-3 text-xs leading-relaxed">
      {children}
    </pre>
  );
}

const VERIFY_SNIPPET = `// Node.js (Express) — verifica X-Colibly-Signature antes de confiar en el cuerpo.
import crypto from "node:crypto";

app.post("/webhooks/colibly", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-Colibly-Signature") ?? "";
  const [, t, v1] = header.match(/t=(\\d+),v1=([0-9a-f]+)/) ?? [];
  const expected = crypto
    .createHmac("sha256", process.env.COLIBLY_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body}\`)
    .digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300; // 5 min contra reenvíos
  if (!v1 || !fresh || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(req.body);
  // event.type, event.contact, event.conversation, event.data ...
  res.sendStatus(200); // responde rápido; procesa en segundo plano
});`;

export function ApiDocsSection() {
  const origin = useOrigin();
  const base = `${origin}/api/v1`;

  return (
    <div className="space-y-8">
      <Card as="section" className="space-y-3">
        <SectionHeader
          eyebrow="Referencia"
          title="API REST"
          action={
            <Button size="sm" variant="secondary" icon={FileJson} href="/api/v1/openapi.json" external>
              OpenAPI 3.1
            </Button>
          }
        />
        <SecretField label="URL base" value={base} />
        <p className="text-sm text-muted">
          Autentica cada solicitud con <code className="font-mono text-xs">Authorization: Bearer sk_live_…</code>. Límite: 120
          solicitudes por minuto por key. Los errores responden{" "}
          <code className="font-mono text-xs">{`{ "error": { "code", "message" } }`}</code>. Importa la especificación OpenAPI en
          Postman, Insomnia o tu generador de clientes.
        </p>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader title="Ejemplos" />
        <p className="text-sm text-muted">Crear (o encontrar) un contacto de WhatsApp con etiquetas y campos personalizados:</p>
        <Code>{`curl -X POST ${base}/contacts \\
  -H "Authorization: Bearer $COLIBLY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "accountId": "<id de la cuenta>", "phone": "5215512345678", "name": "Ana López",
        "tags": ["Web"], "customFields": { "tipo_piel": "Mixta" } }'`}</Code>
        <p className="text-sm text-muted">Mover el lead de etapa (dispara Meta Ads, secuencias y webhooks como el Pipeline):</p>
        <Code>{`curl -X PATCH ${base}/contacts/<contactId> \\
  -H "Authorization: Bearer $COLIBLY_API_KEY" -H "Content-Type: application/json" \\
  -d '{ "leadStatus": "CUSTOMER" }'`}</Code>
        <p className="text-sm text-muted">
          Enviar una plantilla aprobada (abre el chat si el contacto aún no escribió). Texto y botones solo dentro de la ventana de
          24 h de WhatsApp; fuera de ella la API responde <code className="font-mono text-xs">422 window_closed</code>:
        </p>
        <Code>{`curl -X POST ${base}/messages \\
  -H "Authorization: Bearer $COLIBLY_API_KEY" -H "Content-Type: application/json" \\
  -d '{ "contactId": "<contactId>", "type": "template",
        "template": { "id": "<id de plantilla>", "bodyParams": ["Ana", "viernes 3", "11:00"] } }'`}</Code>
        <p className="text-sm text-muted">Listar conversaciones abiertas de todos los canales (paginado con nextCursor):</p>
        <Code>{`curl "${base}/conversations?status=OPEN&limit=50" -H "Authorization: Bearer $COLIBLY_API_KEY"`}</Code>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader eyebrow="Webhooks" title="Verificar la firma" />
        <p className="text-sm text-muted">
          Cada entrega es un POST JSON con los headers <code className="font-mono text-xs">X-Colibly-Event</code>,{" "}
          <code className="font-mono text-xs">X-Colibly-Delivery</code> y{" "}
          <code className="font-mono text-xs">X-Colibly-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, donde v1 es el
          HMAC-SHA256 del secreto sobre <code className="font-mono text-xs">{"`${t}.${cuerpo}`"}</code>. Responde 2xx en menos
          de 20 s; si no, se reintenta hasta 6 veces (≈30 min).
        </p>
        <Code>{VERIFY_SNIPPET}</Code>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader title="Eventos" />
        <ul className="divide-y divide-border border-y border-border">
          {Object.entries(DOMAIN_EVENT_CATALOG).map(([type, label]) => (
            <li key={type} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
              <code className="font-mono text-xs text-foreground">{type}</code>
              <span className="text-sm text-muted">{label}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
