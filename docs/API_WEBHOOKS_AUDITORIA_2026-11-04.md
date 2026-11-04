# API pública y webhooks: auditoría en producción y plan (2026-11-04)

Objetivo: que lo que entrega Colibly a un integrador (API `/api/v1` y webhooks salientes) sea completo, coherente y estable. Fuentes:
- auditoría **solo de lectura** contra `https://app.colibly.com/api/v1` con la key de una organización real con una cuenta en Coexistencia (141 mensajes reales de 3 conversaciones, todas las rutas GET y casos de error; datos personales enmascarados);
- el análisis externo del webhook recibido el mismo día (puntos 2.1–4.3);
- `docs/META_JSON_CUENTAS_WA_2026-11-04.md`, con lo que manda Meta.

Restricciones que se mantienen (sección 6 del análisis externo): no cambiar la envoltura `id / type / occurredAt / account / contact / conversation / data`, no quitar ni renombrar campos, no agrupar eventos, no tocar la firma HMAC ni los límites (120/min, 6 reintentos, 20 s). **Todo lo de abajo es aditivo.**

## 1. Lo que se vio en producción

| # | Hallazgo | Evidencia |
|---|---|---|
| A1 | **Los salientes no dicen quién los mandó.** `senderId` es null en el 99 % de los mensajes y no hay otro campo que lo explique. En una cuenta en Coexistencia casi todo sale desde la app WhatsApp Business (`WAMessage.origin = BUSINESS_APP_ECHO`), pero la API no expone `origin`. | 57 salientes de texto; solo 1 con `senderId` |
| A2 | **La mayoría de los salientes no emite `message.sent`.** Solo lo emiten la bandeja, `sendOutbound()` (API, automatizaciones y avisos) y la plantilla desde el chat. No lo emiten: los ecos de la app (Coexistencia), el bot IA, las campañas, las secuencias ni la recuperación de leads. | `grep "type: \"message.sent\""` → 3 archivos |
| A3 | **Estados incoherentes.** Hay salientes `status: "read"` con `readAt` y `deliveredAt: null`. Cuando Meta salta directo a `read` (o el `delivered` llega tarde y se descarta por el rango), no se rellena `deliveredAt`. | mensaje de texto del 2026-11-04 20:35 |
| A4 | **`status` null en salientes.** Los ecos de la app no traen estado inicial: un integrador no distingue "sin estado" de "estado desconocido". | 96 % de los mensajes con `status: null` |
| A5 | **`media_placeholder` sin explicar.** El historial de Coexistencia trae mensajes con `type: "media_placeholder"`, `text` y `media` en null y nada que diga qué son. | 4 mensajes |
| A6 | **Teléfonos sin formato estándar.** `account.phoneNumber = "+52 1 55 3040 3388"` (con espacios y el "1" móvil antiguo); `contact.phone = "521…"` (el `wa_id` crudo, sin `+`). Ninguno es E.164. | `/accounts`, `/contacts` |
| A7 | **`media.sha256` siempre null.** Los medios revisados son anteriores al despliegue de hoy, y en salientes Meta nunca manda sha256. | 11 medios |
| A8 | **Parámetros inválidos que no fallan.** `limit=abc` y `limit=100000` responden 200 (se corrigen en silencio). Sí falla `cursor` inválido (400). | casos de borde |
| A9 | **404 en HTML.** Una ruta inexistente bajo `/api/v1` devuelve la página 404 de la app, no el JSON de error `{ error: { code, message } }`. | `GET /api/v1/no-existe` |
| A10 | **Sin sincronización incremental de mensajes.** `/conversations/{id}/messages` solo pagina hacia atrás; no hay `since`/`updatedSince` (contactos sí lo tienen) ni un listado global de mensajes recientes. `/conversations` tampoco filtra por `updatedSince`. | parámetros del OpenAPI |
| A11 | **El OpenAPI no documenta headers que ya existen.** Se mandan `X-Colibly-Event`, `X-Colibly-Delivery`, `X-Colibly-Event-Id` y `X-Colibly-Attempt`, pero solo `X-Colibly-Delivery` está documentado. `info.version` sigue en `1.0.0`. | `deliver.ts` vs spec |
| A12 | **Límite distinto por endpoint sin documentar.** `/conversations` informa `X-RateLimit-Scope: endpoint` con 60/min; el resto, 120/min por key. | headers |
| A13 | **Latencia.** ~190 ms de servidor por petición, incluido `GET /openapi.json`, que es estático (se arma en cada petición). La red agrega ~180 ms (RTT) y el TLS ~200 ms; con keep-alive desaparecen. | `curl -w` |

## 2. Análisis externo, verificado

| # | Pedido | Veredicto |
|---|---|---|
| 2.1 | `message.sent` para envíos desde la app + `origin` | **Correcto y se queda corto** (ver A2): faltan también bot, campañas, secuencias y recuperación. P0. |
| 2.2 | `contact.phoneE164` + `account.phoneNumber` | Correcto (A6). P0. |
| 2.3 | `previousStatus`, `played`, `error` completo | `previousStatus` y el error de Meta completos: correcto. `played`: **por verificar**, se vio en el historial de Coexistencia (`PLAYED`), no en un estado de Cloud API capturado. |
| 2.4 | Headers de evento y versión | **Casi todo existe** (A11). Falta `X-Colibly-Schema-Version` y documentar los otros. |
| 3.1 | `sentBy` + `senderName` | Correcto (A1). |
| 3.2 | `referral` (CTWA) | Correcto: ya se guarda en `WAMessage.referral` y `Contact.ctwaClid`/`adId`, solo falta exponerlo. |
| 3.3 | Backfill de `deliveredAt`/`readAt` | **No se puede como se pide**: Meta no tiene API para consultar estados pasados. Se documenta el corte (**confiables desde 2026-11-04 19:47 UTC**, despliegue `3f4166d`). Salvedad: para mensajes de campaña sí hay horas guardadas en `WACampaignRecipient` y se pueden copiar. |
| 3.4 | `realName` y `tags` en el sobre | `contact.name` **ya es** `realName ?? name`; se agrega `realName` explícito y `tags`. |
| 4.1 | `deliveries` + `replay` | Correcto. El historial existe solo en la UI interna. |
| 4.2 | Changelog / versión | Correcto (A11). |
| 4.3 | `media.sha256` | Correcto (A7). Solución robusta: calcularlo Colibly al guardar el archivo, así cubre también los salientes. |

## 3. Plan

### P0: lo que hoy hace perder información o confundir

> **Estado (2026-11-04): hecho en dev, verificado** (ver §5). Diferencias con lo planeado:
> - los salientes de Colibly siguen naciendo `sent` (la bandeja no tiene estado `pending`); solo los ecos de la app, que antes nacían `null`, ahora nacen `sent`;
> - `limit` mayor que 100 se sigue recortando (rechazarlo rompería a quien ya lo manda); solo un `limit` no numérico o menor que 1 da 400;
> - un 405 (método no soportado en una ruta que sí existe) lo sigue respondiendo Next sin cuerpo.
> - Adelantados de P1 y P2: `contact.realName` en el sobre, el backfill de horas de campaña, el changelog (`x-colibly-changelog`) y la caché de `openapi.json`.

1. **`message.sent` desde todos los orígenes**, emitido en un solo lugar: donde se persiste el saliente. Añade `data.origin`, con uno de estos valores:
   - `agent`: bandeja;
   - `api`;
   - `automation`;
   - `bot`;
   - `campaign`;
   - `sequence`;
   - `recovery`;
   - `system`: avisos de ausencia, CSAT, auto-resolver;
   - `business_app`: eco de Coexistencia;
   - `history`: importación, sin evento por defecto para no inundar.

   Más `sentBy` (`user`, `bot`, `system`, `business_app`), `senderId` y `senderName`. `source` se mantiene igual que hoy. El mismo `origin` va en el mensaje serializado (A1).
2. **Estados coherentes:**
   - `message.status_changed` con `previousStatus`;
   - `error` con `{ code, title, message, details, href }`, conservando el `message` legible actual;
   - un `read` sin `delivered` previo rellena `deliveredAt = readAt` (A3);
   - los salientes nuevos nacen con `status: "pending"` hasta el primer estado de Meta, y los ecos de la app con `sent`. Esto último se decide al implementar; hay que revisar la UI de la bandeja.
3. **Teléfonos:**
   - `contact.phoneE164`: para México, `521XXXXXXXXXX` → `+52XXXXXXXXXX`;
   - `account.phoneNumber` y `account.phoneE164` en el sobre de los eventos;
   - los mismos campos en `/accounts` y `/contacts`. Se mantienen los campos actuales (A6).
4. **Headers:**
   - `X-Colibly-Schema-Version: 2026-11-04` en cada entrega y en cada respuesta de `/api/v1`;
   - documentar `X-Colibly-Event`, `X-Colibly-Event-Id` y `X-Colibly-Attempt`;
   - `info.version` del OpenAPI pasa a `1.1.0` (A11).
5. **Errores de la API siempre en JSON:** un 404 o 405 bajo `/api/v1/*` devuelve `{ error: { code, message } }`; `limit` fuera de rango o no numérico da 400 en vez de corregirse en silencio (A8, A9).

### P1: completar el contrato

6. **`referral`** en `message.received` y en el mensaje serializado: `sourceType`, `sourceId`, `sourceUrl`, `headline`, `body` y `ctwaClid`. Y `contact.adId`/`ctwaClid` en `/contacts`.
7. **Sobre del contacto:** `realName` y `tags[]` (id y nombre), además de `phoneE164`.
8. **`media_placeholder`:** `content.placeholder = { reason: "history_media" }` y documentarlo como "el medio llega aparte; se actualiza el mismo mensaje". Opcional: emitir `message.updated` cuando llega (A5).
9. **Sincronización incremental:**
   - `updatedSince` en `/conversations`;
   - `since` en `/conversations/{id}/messages`;
   - `GET /messages?since=…` global, paginado, para quien no quiera depender solo de webhooks (A10).
10. **Fecha de corte documentada** para `deliveredAt`/`readAt` y `pricing`. Backfill desde `WACampaignRecipient` para los mensajes de campaña.

### P2: operación

11. **`GET /api/v1/webhooks/{id}/deliveries?status=failed`** (paginado: código de respuesta, intentos, error) y **`POST …/deliveries/{deliveryId}/replay`**: reenvía el mismo `eventId` con un intento nuevo y respeta la idempotencia del receptor.
12. **Changelog público** (`/api/v1/changelog` o una sección del OpenAPI, `x-colibly-changelog`) con fecha y campos o eventos nuevos.
13. **`media.sha256` calculado por Colibly** al guardar el archivo (entrante y saliente); el de Meta se conserva aparte, para comparar.
14. **Rendimiento:**
    - cachear `GET /openapi.json` en memoria y con `Cache-Control`;
    - documentar el límite de 60/min de `/conversations` (A12, A13).

### Por verificar antes de prometer

- `played` (Cloud API) y `deleted` (mensaje borrado por el cliente): capturar un payload real con el proxy de captura (`docs/META_JSON_CUENTAS_WA_2026-11-04.md` §7) antes de añadirlos al enum.

## 4. Cómo se verifica

- Pruebas unitarias del serializador, del normalizador de teléfonos, de `origin`/`sentBy` y del rango de estados.
- Contrato: una prueba de que cada campo del serializador y de la envoltura está en el OpenAPI (y al revés).
- En dev: reenviar los payloads reales capturados (firmados con el App Secret) y leer la API y el payload del webhook.
- En producción: repetir esta misma auditoría de solo lectura (`api-audit.py`) y comparar las tasas de nulos y los casos de borde. Un webhook de prueba solo con autorización explícita: la organización auditada es real.

## 5. Verificación del P0 (dev, 2026-11-04)

- `tsc`, `npm run lint` y 97 archivos de pruebas (889 casos) en verde. Nuevas: `lib/phone/__tests__/e164.test.ts`, `lib/messages/__tests__/origin.test.ts`, `lib/api/__tests__/page-params.test.ts`, más pruebas de contrato en `openapi.test.ts` (el esquema `Message`, el `data` de cada evento y el sobre deben coincidir con el código).
- De punta a punta en dev, con un endpoint y una API key temporales (borrados al terminar):
  - dos ecos de la app WhatsApp Business generaron `message.sent` con `origin: business_app`, `sentBy: business_app`, `status: sent`;
  - un `read` sin `delivered` previo generó `message.status_changed` con `previousStatus: sent` y `deliveredAt = readAt`; el `delivered` rezagado no generó evento;
  - un `failed` llegó con el error en español más `title`, `details` y `href` de Meta, en el evento y en la API;
  - en la API, cada mensaje trae `origin`/`sentBy` (entrantes `contact`, saliente de la bandeja `agent`/`user` con `senderName`); los contactos traen `phoneE164` (`521…` → `+52…`); `limit=abc` da 400; una ruta inexistente da JSON 404; todas las respuestas traen `X-Colibly-Schema-Version: 2026-11-04`.
- No probado de punta a punta (requiere enviar por Meta a un número real): bot, campañas, secuencias, recuperación y CSAT. Usan el mismo emisor (`emitMessageSent`) y lo cubre la revisión de tipos.
