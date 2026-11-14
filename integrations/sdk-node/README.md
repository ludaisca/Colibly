# colibly (Node.js)

Cliente de la API de [Colibly](https://colibly.com) para Node 18+. Sin dependencias.

```bash
npm install colibly
```

```ts
import { Colibly, ColiblyError } from "colibly";

const colibly = new Colibly({ apiKey: process.env.COLIBLY_API_KEY! });

await colibly.messages.send({
  accountId: "cmacc_…",
  to: "5215512345678",
  type: "template",
  template: { id: "cmtpl_…", bodyParams: { nombre: "Ana" } },
});

for await (const contact of colibly.paginate("/contacts", { leadStatus: "NEW" })) {
  console.log(contact);
}
```

- Cualquier endpoint: `colibly.request("GET", "/accounts/cmacc_…/flows")`.
- Los POST llevan `Idempotency-Key` automática; 429 y 503 se reintentan con `Retry-After`.
- Los errores son `ColiblyError` con `code`, `message`, `details`, `metaCode` (código de WhatsApp) y `requestId`.
- Con una key `sk_test_` los envíos se simulan: la respuesta trae `test: true` y `preview`.

## Webhooks

```ts
import { constructWebhookEvent } from "colibly";

app.post("/colibly", express.raw({ type: "application/json" }), (req, res) => {
  const event = constructWebhookEvent(req.body, req.header("x-colibly-signature"), process.env.COLIBLY_WEBHOOK_SECRET!);
  // event.type: message.received, flow.completed, call.ended…
  res.sendStatus(200);
});
```

La misma verificación sirve para las solicitudes del endpoint de Flows (`PATCH /accounts/{id}/flows-endpoint`).

Referencia completa: https://app.colibly.com/docs/api
