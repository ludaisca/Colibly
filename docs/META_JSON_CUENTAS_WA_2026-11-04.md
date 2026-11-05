# JSON que entrega Meta de las cuentas de WhatsApp (2026-11-04)

Revisión de lo que Graph API devuelve sobre una cuenta de WhatsApp y de qué parte usa Colibly hoy. Fuente: llamadas **solo de lectura** (GET, Graph `v25.0`) con la cuenta de dev "Test" (tipo `MANUAL`, Cloud API). Los ids reales están abreviados. El script (`meta-dump.cjs`, en el scratchpad de la sesión) pide cada campo por separado cuando Meta rechaza alguno.

**Coexistencia:** en dev no hay ninguna cuenta conectada en Coexistencia, así que esa parte no se pudo ver con datos reales. Abajo se describe lo que el código espera recibir, y queda pendiente confirmarlo con una cuenta conectada por Embedded Signup + Coexistencia (ver "Pendiente").

## 1. Número de teléfono — `GET /{phone_number_id}`

```json
{
  "id": "13845…430",
  "display_phone_number": "+1 711-679-5925",
  "verified_name": "Factzi",
  "quality_rating": "GREEN",
  "code_verification_status": "VERIFIED",
  "name_status": "PENDING_REVIEW",
  "new_name_status": "NONE",
  "platform_type": "CLOUD_API",
  "throughput": { "level": "STANDARD" },
  "status": "CONNECTED",
  "messaging_limit_tier": "TIER_250",
  "is_official_business_account": false,
  "is_pin_enabled": false,
  "account_mode": "LIVE",
  "health_status": {
    "can_send_message": "LIMITED",
    "entities": [
      { "entity_type": "PHONE_NUMBER", "can_send_message": "LIMITED", "can_receive_call_sip": "BLOCKED",
        "errors": [{ "error_code": 138024, "error_description": "WhatsApp Business calling cannot use SIP because it is not enabled" }],
        "additional_info": ["Your display name has not been approved yet. Your message limit will increase after the display name is approved."] },
      { "entity_type": "WABA", "can_send_message": "AVAILABLE" },
      { "entity_type": "BUSINESS", "can_send_message": "AVAILABLE" },
      { "entity_type": "APP", "can_send_message": "AVAILABLE", "can_receive_call_sip": "BLOCKED",
        "errors": [{ "error_code": 138025, "error_description": "…has not configured a SIP server for this business phone number" }] }
    ]
  },
  "is_on_biz_app": false,
  "search_visibility": "NON_VISIBLE",
  "webhook_configuration": { "application": "https://ludaisca.taila2291d.ts.net/api/whatsapp/webhook" },
  "eligibility_for_api_business_global_search": "NON_ELIGIBLE_VERIFIED_LEVEL"
}
```

`last_onboarded_time`, `certificate` y `new_certificate` no vienen para este número. Meta no los rechaza: simplemente no los incluye.

## 2. Perfil del negocio — `GET /{phone_number_id}/whatsapp_business_profile`

```json
{ "data": [{ "profile_picture_url": "https://pps.whatsapp.net/…", "vertical": "PROF_SERVICES", "messaging_product": "whatsapp" }] }
```

Faltan `about`, `address`, `description`, `email` y `websites`, porque no están llenos en el perfil.

## 3. Cuenta de WhatsApp Business (WABA) — `GET /{waba_id}`

```json
{
  "id": "16257…942",
  "name": "Factzi",
  "currency": "MXN",
  "timezone_id": "94",
  "message_template_namespace": "ee68…3e",
  "account_review_status": "APPROVED",
  "business_verification_status": "verified",
  "ownership_type": "SELF",
  "health_status": { "can_send_message": "AVAILABLE", "entities": ["WABA", "BUSINESS", "APP: AVAILABLE"] },
  "status": "ACTIVE",
  "on_behalf_of_business_info": { "name": "Ludaisca", "id": "14715…796", "status": "APPROVED", "type": "SELF" },
  "is_enabled_for_insights": true,
  "marketing_messages_onboarding_status": "ELIGIBLE"
}
```

Meta rechaza `primary_funding_id`: solo lo puede leer un Business Solution Provider.

`GET /{waba_id}/phone_numbers` (sin `fields`) devuelve, por número: `verified_name`, `code_verification_status`, `display_phone_number`, `quality_rating`, `platform_type`, `throughput`, `webhook_configuration` e `id`, más `paging.cursors`.

`GET /{waba_id}/subscribed_apps` devuelve `[{ "whatsapp_business_api_data": { "id", "name": "Factzi", "link" } }]`.

## 4. Qué usa Colibly hoy de todo esto

| Dato de Meta | ¿Lo usa Colibly? | Dónde |
|---|---|---|
| `name_status` | Sí, en vivo (caché de 1 h si está aprobado, 2 min si no) | `lib/whatsapp/display-name.ts`. Bloquea citar mensajes si no está aprobado |
| `id`, `display_phone_number`, `verified_name`, `quality_rating`, `platform_type`, `is_on_biz_app` | Solo al conectar por Embedded Signup | `lib/whatsapp/embedded-signup/meta.ts:listWabaPhoneNumbers()`. `is_on_biz_app` decide si la cuenta es de Coexistencia |
| `quality_rating`, `messaging_limit_tier` | **No se leen de la API.** `WAAccount.qualityRating` y `messagingTier` solo se llenan con el webhook `phone_number_quality_update` | `app/api/whatsapp/webhook/route.ts:applyPhoneNumberQualityUpdate()` |
| `health_status` (`can_send_message`, errores, `additional_info`) | No | — |
| `throughput`, `account_mode`, `code_verification_status`, `status` del número | No | — |
| Datos de la WABA (`account_review_status`, `business_verification_status`, `currency`, `timezone_id`, `marketing_messages_onboarding_status`…) | No (solo se usa `wabaId` para plantillas) | — |
| `webhook_configuration.application` | No | — |

## 5. Hallazgos

> **Estado (2026-11-04):** el 1 se resolvió con Funnel (ver `GUIA-SERVIDOR.md`); el 2 y el 3, con `lib/whatsapp/phone-health.ts` (la calidad y `health_status` se leen de Graph y se muestran en la ficha de la cuenta; el `event` del webhook va a `qualityEvent`); el 4, con todo el código en `GRAPH_API_VERSION` (v25.0), probado con lecturas reales (número, `name_status`, plantillas). Los envíos en v25 no se probaron todavía con un mensaje real.

1. **El webhook de la cuenta de dev apunta a un destino que Meta no puede alcanzar.**
   - Está configurado a `https://ludaisca.taila2291d.ts.net/api/whatsapp/webhook` (puerto 443).
   - Desde el reordenamiento de puertos (Colibly pasó a 10100), `tailscale serve` no publica nada en 443. Además, "tailnet only" no es accesible desde internet, que es desde donde llama Meta.
   - El último mensaje entrante de WhatsApp en dev es del **2026-11-02**. Arreglarlo requiere Tailscale Funnel en 443, 8443 o 10000, que las reglas del servidor reservan para cuando el usuario lo pida. Después hay que actualizar la URL en la app de Meta (Factzi).
2. **La calidad que muestra la ficha de la cuenta no es la calidad.**
   - `applyPhoneNumberQualityUpdate()` guarda en `qualityRating` el campo `event` del webhook. Según la documentación de Meta, `event` es un suceso (`FLAGGED`, `UNFLAGGED`, `UPGRADE`, `DOWNGRADE`…), no la calificación `GREEN`/`YELLOW`/`RED`. El comentario del código admite ambos. **No hay un payload real guardado para confirmarlo**: es lo primero que hay que capturar cuando vuelvan a llegar webhooks.
   - Mientras no llegue ese webhook, el campo queda vacío, aunque Meta diga `"quality_rating": "GREEN"` y `"messaging_limit_tier": "TIER_250"` si se le pregunta. Esto sí está comprobado: la cuenta "Test" tiene `qualityRating` vacío en la base.
   - Propuesta: leer `quality_rating`, `messaging_limit_tier`, `name_status`, `health_status` y `throughput` de la API al conectar la cuenta, al abrir su ficha (con caché) y al recibir `phone_number_quality_update`, y guardar `event` aparte como "último evento".
3. **`health_status` explica por qué un número está limitado, y no lo mostramos.** Este número está `LIMITED` porque el nombre para mostrar está en revisión. Meta lo dice en texto (`additional_info`) y con códigos (`138024`/`138025` para llamadas SIP). Encaja en la ficha de la cuenta y en el aviso que hoy deduce el bloqueo solo de `name_status`.
4. **Versiones de Graph mezcladas.** `lib/whatsapp.ts` (envíos, `name_status`, medios) usa `v21.0`, mientras que `lib/meta/graph.ts` y el resto usan `v25.0`. Meta retira cada versión unos dos años después de publicarla, así que `v21.0` (octubre de 2024) es la próxima en caer. Conviene llevar todo a `GRAPH_API_VERSION` en un solo cambio y probar los envíos.
5. **El número de dev es de otro proyecto.** `verified_name` y la app suscrita son "Factzi". Sirve para pruebas, pero la UI de Colibly mostrará "Factzi" como nombre del remitente.

## 6. Coexistencia: qué espera el código (sin verificar con datos reales)

- **Al conectar** (`listWabaPhoneNumbers`): `platform_type: "CLOUD_API"` e **`is_on_biz_app: true`**. Con eso la cuenta se marca `coexistence = true`, no se registra el número con PIN (ya lo está en la app) y se pide la sincronización (`POST /{phone}/smb_app_data` con `sync_type` `smb_app_state_sync` y luego `history`, una vez cada una).
- **Webhooks extra** (`lib/whatsapp/coexistence/webhook.ts`):
  - `smb_message_echoes`: lo que el negocio escribe desde la app del teléfono.
  - `history`: mensajes anteriores, por lotes.
  - `smb_app_state_sync`: altas, cambios y bajas de la libreta de contactos.
- **Ciclo de vida** (`account_update`, `lib/whatsapp/coexistence/state.ts`):
  - `PARTNER_REMOVED` con `disconnection_info.reason`, que puede ser `BUSINESS_DOWNGRADE`, `CHANGE_NUMBER`, `COMPANION_INACTIVITY`, `PRIMARY_INACTIVITY` o `USER_RE_REGISTERED`, e `initiated_by`.
  - `ACCOUNT_OFFBOARDED` y `ACCOUNT_RECONNECTED`.

## 7. Webhook `messages`: lo que manda Meta y lo que guarda Colibly

Capturado el 2026-11-04 con un proxy temporal entre Funnel y la app (cuerpo crudo, reenviado intacto para no romper la firma), con mensajes reales enviados al número de prueba. Teléfonos y nombres son los del propio usuario de pruebas.

**Envoltura común a todos los mensajes:**

```json
{
  "metadata": { "display_phone_number": "17116795925", "phone_number_id": "13845…430" },
  "contacts": [{ "profile": { "name": "Cliente de prueba" }, "wa_id": "5215500000000", "user_id": "MX.1000000000000000" }],
  "messages": [{ "from": "5215500000000", "from_user_id": "MX.1000000000000000", "id": "wamid.…", "timestamp": "1793817654", "type": "…" }]
}
```

| Tipo | Lo que trae Meta | Lo que guarda Colibly | Se pierde |
|---|---|---|---|
| `text` | `text.body` | `body` | — |
| `location` | `location.latitude`, `longitude` (y `name`, `address`, `url` si es un lugar) | `body = "[location]"` | **coordenadas, nombre y dirección** |
| `contacts` | `contacts[].name.formatted_name`, `phones[].phone`/`wa_id`/`type`, emails, organización, `vcard` (base64, con foto) | `body = "[contacts]"` | **todo el contacto compartido** |
| `document` | `filename`, `mime_type`, `sha256`, `id`, `url` | archivo, `filename`, `mimeType`; `body = "[document]"` | `sha256` (sirve para deduplicar) |
| `sticker` | `mime_type`, `sha256`, `id`, `url`, `animated: true` | archivo, `mimeType` | `animated` (llega al tipo pero no se guarda) |
| `audio` | `mime_type`, `id`, `url`, `sha256`, `voice` (nota de voz o archivo de audio) | archivo, `mimeType`, transcripción | `voice` (no capturado en vivo: llegó antes de encender el proxy) |
| `reaction` | `reaction.message_id`, `emoji` | `reactionEmoji` en el mensaje original ✅ | — |
| cualquier mensaje | `from_user_id`, `contacts[].user_id` | nada | **el identificador por negocio de Meta** |
| `image` | `image.caption`, `mime_type`, `sha256`, `id`, `url` (capturado en vivo) | archivo, `mimeType`, `caption`, **y el mismo pie también en `body`** | `sha256`; el pie queda duplicado en `body` y `caption` |
| respuesta citando | `context.id`, `context.from`, `context.from_user_id` (capturado en vivo, citando una imagen); además, según la documentación: `context.forwarded`, `frequently_forwarded`, `referred_product` | `replyToWamid` (solo `context.id`) ✅ enlazado a la imagen | `context.from`, `from_user_id`; reenviado / reenviado muchas veces / producto citado |
| `order`, `system`, `unsupported` | carrito, cambio de número del cliente, errores de tipo no soportado | `body = "[order]"` etc. | todo (según la documentación; no capturado en vivo) |

**Estados de un envío** (`statuses`), capturados en vivo:

```json
{ "id": "wamid.…", "status": "delivered", "timestamp": "1793817896",
  "recipient_id": "5215500000000", "recipient_user_id": "MX.1000000000000000",
  "pricing": { "billable": false, "pricing_model": "PMP", "category": "service",
               "type": "free_customer_service", "subtype": "free_tier" } }
```

Colibly usa `id`, `status` y `errors`. Ignora:
- `timestamp`: guarda la hora de llegada del webhook como `deliveredAt`/`readAt`, no la hora real del suceso;
- `pricing`: si el mensaje se cobra, su categoría (`marketing`, `utility`, `authentication` o `service`) y el tipo de tarifa;
- `recipient_user_id`.

Sin `pricing` no se puede saber cuánto cuesta una campaña ni separar lo gratis (`free_customer_service`) de lo que se cobra.

### Riesgo: el identificador nuevo de Meta (`user_id`)

Todo el stack de WhatsApp identifica al cliente por `from`/`wa_id`: los chats, los contactos, las reacciones y las ediciones. Meta ya manda `user_id`/`from_user_id` (`MX.…`), un id por negocio pensado para los nombres de usuario de WhatsApp.

El webhook agrupa por `msg.from` y lo usa como `remoteJid`, sin respaldo. Si un cliente escribe con nombre de usuario y Meta omite su número, el mensaje se procesaría sin `remoteJid`. Lo más probable es que falle el guardado y Meta reintente sin fin. No está verificado con un payload así, pero conviene:
- guardar `user_id` en el contacto ya;
- usarlo como respaldo cuando falte `from`.

## 8. Lo que entrega Colibly (API `/api/v1` y webhooks salientes)

**Webhooks salientes** (`lib/webhooks/payload.ts`): todos los eventos comparten la envoltura `{ id, type, occurredAt, account, contact, conversation, data }`. Para mensajes, `data` es solo:

- `message.received`: `{ messageId, messageType, text, interactiveReplyId }`
- `message.sent`: `{ messageId, messageType, text, source, senderId }`

Falta:
1. **Medios**: no viajan ni `mimeType`, ni `filename`, ni `caption`, ni una forma de descargarlos. La API tampoco tiene un endpoint de medios con API key, y la URL de Meta caduca en minutos (`ext=` en la URL capturada), así que un integrador no puede obtener el archivo.
2. **Contenido estructurado**: no viajan la ubicación (ni se guarda), el contacto compartido, la transcripción de la nota de voz ni los botones de un mensaje interactivo enviado.
3. **Contexto**: faltan el mensaje citado (`replyTo`), la reacción, el `wamid`/id externo y la hora real del mensaje (`occurredAt` es la hora del evento, no la de Meta).
4. **Estados**: no hay eventos `message.delivered`, `message.read` ni `message.failed`. Quien envía por API no tiene cómo enterarse de si llegó o por qué falló (Colibly sí lo sabe: `status`, `errorCode` y `errorMessage`).
5. **Costo**: no se expone `pricing` en ningún lado.
6. **Anuncios**: el `referral` de click-to-WhatsApp se guarda, pero solo sale indirectamente en `lead.ad_captured` (`adId`), sin titular ni URL del anuncio.

**API `/api/v1/conversations/{id}/messages`** (`lib/api/resources.ts:serializeMessage`) devuelve `id`, `conversationId`, `direction`, `type`, `text`, `caption`, `mimeType`, `filename`, `status`, `senderId`, `interactive` y `timestamp`. Le faltan los mismos puntos 1–4: descarga del medio, `replyTo`, `reaction`, `transcript`, `errorCode`/`errorMessage` y el id externo.

**Estructura:**
- El mismo mensaje se describe de tres formas distintas: la fila de la base, `serializeMessage` (API) y `data` del evento (webhook), y cada una con campos diferentes.
- `text` mezcla el texto real con marcadores como `"[location]"`, que un integrador no puede distinguir de un mensaje que diga eso.

### Propuesta — **implementada el 2026-11-04** (detalle en `docs/arquitectura/integraciones.md` y `whatsapp.md`)

Se hizo **sin romper el contrato**: los campos de la v1 siguen, lo nuevo se añadió detrás y no hizo falta versionar. Única corrección: `text` es `null` en vez de un marcador `[tipo]`. Migración `whatsapp_structured_content`: `WAMessage.content`, `pricing`, `delivered_at` y `read_at`, más `Contact.meta_user_id`; todas son columnas nulas sin valor por defecto, así que el cambio es instantáneo en tablas grandes. Verificado reenviando al webhook los payloads reales capturados, firmados con el App Secret, y leyendo la API y el payload del webhook saliente.

Plan original:

1. **Un solo serializador de mensaje** (`serializeMessage`) que usen la API y los webhooks, con un `content` tipado por tipo, en lugar de `text` con marcadores:
   - `{ type: "text", text }`
   - `{ type: "image", media: { id, mimeType, filename, caption, sha256, url } }`
   - `{ type: "location", latitude, longitude, name, address }`
   - `{ type: "contacts", contacts: [...] }`
   - `{ type: "interactive_reply", id, title }`
   - …

   Más `replyTo`, `reaction`, `transcript`, `externalId`, `sentAt`, `status` y `error`. Es un cambio de contrato: va con versión (por ejemplo, `message.received` v2, o un campo `version` en la envoltura).
2. **Endpoint de medios con API key**, `GET /api/v1/messages/{id}/media`, que sirva el archivo guardado (mismo proxy autenticado que la app). En `content.media.url` va esa URL, nunca la de Meta.
3. **Eventos de estado** `message.status_changed` (`sent`, `delivered`, `read`, `failed`, con `error` y `pricing`), con el mismo control de que el estado solo avance que ya existe en el webhook.
4. **Guardar lo que hoy se pierde**: una columna `content Json` en `WAMessage`/`ChannelMessage` para ubicación, contactos y pedido; `pricing`; `user_id`; y la hora real de los estados. Necesita una migración; las tablas de mensajes son las más grandes, así que hay que añadir columnas sin valor por defecto.

## Pendiente

- Conectar una cuenta en Coexistencia (Embedded Signup) y repetir este volcado: comparar `throughput`, `health_status`, `platform_type` y `messaging_limit_tier` con los de Cloud API, y guardar un ejemplo real de cada webhook de Coexistencia. Requiere que los webhooks lleguen (hallazgo 1).
- ~~Decidir los hallazgos 2–4~~: hechos en `ca42d00` (2026-11-04): calidad y `health_status` leídos de Graph (`lib/whatsapp/phone-health.ts`) y todo el código en `GRAPH_API_VERSION` (v25.0).
