# Auditoría: API pública y webhooks (plan Pro) — 2026-10-19

Rama `feat/lanzamiento-pulido`, entorno dev. Auditoría de solo lectura: no se cambió código. La prueba en vivo se hizo con la org Vamex (Pro en prueba), y la API key y el webhook de prueba se borraron al terminar.

## 1. Resumen para el fundador

- **Qué es.** Un cliente Pro puede conectar su tienda, ERP o Zapier/Make con Colibly de dos formas:
  - **API:** su sistema le pide datos a Colibly o le manda órdenes (crear contacto, enviar mensaje, lanzar una automatización).
  - **Webhooks:** Colibly avisa al sistema del cliente cuando pasa algo (llegó un mensaje, se creó un contacto, etc.).
- **Estado.** Está completo y bien hecho para lanzar. Tiene autenticación con llaves cifradas, permisos por llave, límite de velocidad, firma de webhooks como la de Stripe, reintentos, bitácora de entregas, botón de prueba y protección contra URLs internas (SSRF).
- **Riesgos.** No hay agujeros graves. Los pendientes son mejoras de robustez (sección 5).

## 2. API pública

| Tema | Cómo funciona hoy |
|---|---|
| URL base | `https://<dominio>/api/v1` (solo existe la v1; no hay política de versiones escrita) |
| Autenticación | `Authorization: Bearer sk_live_…`. La llave se genera con 32 bytes aleatorios, se guarda solo su hash sha256 y se muestra una única vez. El prefijo visible son los primeros 14 caracteres. |
| Quién crea llaves | Solo un admin, desde Configuración → API. Al crear se valida el plan (`checkApiAccess`). |
| Permisos (scopes) | `contacts:read`, `contacts:write`, `conversations:read`, `messages:send`, `webhooks:manage`, `automations:run` |
| Restricción por cuenta | Opcional: la llave puede limitarse a ciertas cuentas/canales del dueño. El alcance efectivo es la intersección entre las cuentas del dueño y la restricción de la llave. |
| Caducidad | 30, 90 o 365 días, o sin caducidad |
| Revocar / borrar | Sí; revocar es irreversible. **No hay "rotar"** (se crea una llave nueva y se revoca la vieja). |
| Si el dueño deja de ser admin o se desactiva | La llave deja de funcionar |
| Aislamiento entre empresas | Todas las consultas se filtran por organización y por cuentas del dueño |
| Límite de velocidad | 120 solicitudes/min por llave (`429 rate_limited`). Las llaves inválidas se frenan a 30/min por IP. |
| Paginación | Por cursor: `limit` de 1 a 100 (25 por defecto) y `nextCursor` opaco |
| Errores | `{ "error": { "code", "message" } }`. Códigos: unauthorized, forbidden, not_found, invalid_request, conflict, rate_limited, window_closed, plan_limit, read_only, upstream_error, internal_error. |
| Idempotencia | `POST /contacts` es idempotente por teléfono. **`POST /messages` no acepta `Idempotency-Key`**: si el cliente reintenta, el mensaje se duplica. |
| Plan | Básico → `402 plan_limit`. Prueba = Pro, así que sí tiene API. Una org en solo lectura (impago) solo puede hacer GET; el resto devuelve `402 read_only`. |

### Endpoints

| Endpoint | Permiso necesario |
|---|---|
| `GET /me`, `GET /accounts` | ninguno |
| `GET /contacts`, `GET /contacts/{id}` | `contacts:read` |
| `POST /contacts`, `PATCH /contacts/{id}`, `POST/DELETE /contacts/{id}/tags` | `contacts:write` (al crear se respeta el límite de contactos) |
| `GET /conversations`, `GET /conversations/{id}`, `GET /conversations/{id}/messages` | `conversations:read` |
| `POST /messages` | `messages:send`. Acepta texto, botones o plantilla. Fuera de la ventana de 24 h devuelve `422 window_closed`. |
| `POST /automations/{id}/runs` | `automations:run` |
| `GET/POST /webhooks`, `GET/PATCH/DELETE /webhooks/{id}` | `webhooks:manage` |
| `GET /openapi.json` | público, con CORS `*` y caché de 5 min |

### Documentación

- **Dónde está:** la documentación vive dentro de la app (Configuración → API, `_docs.tsx`) y en `/api/v1/openapi.json` (OpenAPI 1.0.0).
- **Exactitud:** el OpenAPI cubre las mismas rutas que el código. El límite de 120/min, el formato de errores y la firma coinciden con la implementación.
- **Faltantes:**
  - No hay página pública de documentación, así que un prospecto no puede verla antes de pagar.
  - `llms.txt` solo menciona "API y webhooks", sin detalle.
  - Algunas respuestas del OpenAPI son `{type: object}` genéricas (`/me`, `/webhooks`).

### Promesas en el sitio de marketing

- **Qué dice:** el landing promete "API y webhooks para conectar tu tienda o ERP"; precios, cpanel y llms.txt los listan solo para Pro.
- **¿Es cierto?** Sí, existe. Pero no hay conectores listos (Shopify, ERP); la integración la tiene que programar el cliente o hacerse con Zapier/Make. Conviene decir "vía API/webhooks" para no sugerir integraciones nativas.

## 3. Webhooks

- **Eventos disponibles:** message.received, message.sent, contact.created, contact.lead_status_changed, tag.added, conversation.assigned, conversation.resolved, appointment.created, appointment.status_changed, lead.scored, lead.ad_captured, y `*` (todos). `webhook.test` sale del botón de prueba.
- **Payload:** `{id, type, occurredAt, account{id,channel,name}, contact{id,name,phone,externalId,leadStatus,leadOrigin}, conversation{id,channel,status,assignedToId}, data}`.
- **Firma:** header `X-Colibly-Signature: t=<unix>,v1=HMAC_SHA256(secret, "t.cuerpo")`, más `X-Colibly-Event` y `X-Colibly-Delivery`. El secreto (`whsec_…`) se guarda cifrado, se muestra una vez y se puede rotar.
- **Envío:**
  - Tiempo máximo de 20 s por intento; se leen como máximo 4 KB de la respuesta y no se siguen redirecciones.
  - Hay 6 intentos con espera exponencial que empieza en 30 s.
  - Después de 20 fallos seguidos el webhook se desactiva solo y se avisa al dueño. Reactivarlo reinicia el contador.
- **Bitácora:** tabla `WebhookDelivery` con estado, intentos, código de respuesta y error. Hay pantalla de "Entregas" con reintento manual. Se purga a los 30 días.
- **No duplicados:** una entrega por cada par (endpoint, evento), garantizado con un índice único.
- **SSRF (URLs internas):**
  - En producción solo se acepta https y la IP se revalida al resolver el DNS.
  - En dev se permiten http y redes privadas, a propósito; la IP de metadatos 169.254.169.254 se rechaza incluso en dev (verificado).
- **Plan:** crear un webhook exige Pro. Las entregas solo salen si la org tiene API y no está en solo lectura.
- **Límites:** no hay tope de webhooks por organización.

## 4. Prueba en vivo (dev, Vamex)

| Prueba | Resultado |
|---|---|
| Crear llave (contacts:read + conversations:read, 30 días) | 201; secreto `sk_live_…` mostrado una vez |
| `GET /me` | 200; muestra la llave, el dueño y las cuentas |
| `GET /contacts?limit=2` | 200, con datos y cursor |
| `GET /conversations?limit=1` | 200, con `nextCursor` |
| Sin llave / llave falsa | 401 con mensaje claro |
| `GET /webhooks` y `POST /messages` sin el permiso | 403 forbidden (no se envió nada) |
| `GET /openapi.json` sin llave | 200 |
| Webhook a 169.254.169.254 | 400 "dirección interna o reservada" |
| Webhook a un receptor temporal + botón "Enviar prueba" | 202. Llegó al receptor en ~70 ms con los 3 headers; **la firma HMAC se verificó correctamente**; la bitácora muestra SENT, 1 intento, 200. |
| Limpieza | Llave revocada (después devuelve 401) y borrada; webhooks borrados; receptor detenido. En BD quedan 0 registros. |

No se envió ningún mensaje de WhatsApp.

## 5. Hallazgos y mejoras priorizadas

**Seguridad / riesgo**

1. **Freno de llaves inválidas engañable.** Usa el primer valor de `X-Forwarded-For`, que el cliente puede falsificar para saltarse el límite de 30/min. Usar la IP del proxy de confianza (el último salto o `x-real-ip` del ingress). *Esfuerzo: 1 h.*
2. **`POST /messages` sin `Idempotency-Key`.** Un reintento del cliente por timeout duplica el WhatsApp, lo que molesta al contacto y gasta plantillas. Guardar la llave 24 h en Redis por API key. *Esfuerzo: 3–4 h.*
3. **Botón de prueba de webhook sin chequeo de plan.** Una org que bajó a Básico puede seguir disparando entregas `webhook.test` a webhooks viejos. El impacto es bajo (tiene rate limit de 10/min). Agregar `checkApiAccess`. *Esfuerzo: 15 min.*
4. **Webhooks de un admin degradado a agente.** Siguen entregando eventos, solo de sus cuentas propias. Las llaves, en cambio, sí se apagan. Decidir si se pausan igual. *Esfuerzo: 1 h.*
5. **Sin tope de llaves ni de webhooks por org.** Cada webhook multiplica el trabajo de la cola. Poner un tope (p. ej. 10 llaves y 10 webhooks). *Esfuerzo: 1 h.*
6. **Consulta de fan-out no filtrada por org.** Hoy se valida endpoint por endpoint, así que no hay fuga, pero va contra la regla de AGENTS.md. Filtrar por `organizationId` en la consulta. *Esfuerzo: 30 min.*

**Producto / documentación**

7. **Docs públicas.** Página pública `/docs/api` que renderice el OpenAPI (Redoc/Scalar) y enlace desde precios y llms.txt. *Esfuerzo: 3 h.*
8. **Headers de límite de velocidad.** Agregar `X-RateLimit-Remaining` y `Retry-After` en el 429. *Esfuerzo: 1 h.*
9. **Esquemas faltantes en el OpenAPI.** Completar los esquemas de respuesta de `/me` y `/webhooks`; documentar la caducidad de llaves y la política de versiones ("v1 estable; cambios incompatibles irán a v2"). *Esfuerzo: 2 h.*
10. **Rotar llave en un clic.** Crear una llave nueva con los mismos permisos y revocar la vieja tras N horas. *Esfuerzo: 2 h.*
11. **Contactos de coexistencia sin evento.** Los contactos creados por las fuentes nuevas de coexistencia (`whatsapp_*`) no emiten `contact.created`. Revisar si debe emitirse. *Esfuerzo: 1 h.*
12. **Texto de marketing.** Cambiar a "conecta tu tienda o ERP vía API y webhooks (o Zapier/Make)" para no prometer conectores nativos. *Esfuerzo: 15 min.*

**Lo que ya está bien y no hay que tocar:** hash de llaves (sha256 basta con 256 bits de entropía), firma HMAC con marca de tiempo, protección SSRF, aislamiento por organización y bitácora con purga.
