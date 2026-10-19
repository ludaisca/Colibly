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

## 6. Estado de las correcciones (2026-10-19, tarde)

Luis aprobó las correcciones. Todas están en `feat/lanzamiento-pulido` (dev), sin push. Hay una migración nueva, `webhook_pause_owner`: agrega dos columnas a `webhook_endpoints` y se generó con `scripts/new-migration.sh`.

| # | Corrección | Estado | Dónde |
|---|---|---|---|
| 1 | IP confiable para los límites anti-fuerza-bruta | Hecho | `lib/net/client-ip.ts`; se usa en API keys inválidas, login, registro, recuperar/restablecer contraseña, verificar correo, invitaciones y solicitudes beta |
| 2 | `Idempotency-Key` en los POST | Hecho | `lib/api/idempotency.ts`, aplicado a `/messages`, `/contacts`, `/contacts/{id}/tags` y `/automations/{id}/runs`; documentado en OpenAPI |
| 3 | Candado Pro en el botón "Probar" (y en "Reintentar entrega") | Hecho | rutas `test` y `retry` de `/api/configuracion/webhooks` |
| 4 | Pausa de webhooks cuando su creador pierde el admin | Hecho | `lib/webhooks/ownership.ts`, `PATCH /api/usuarios`, `updateWebhook(takeOwnership)`, UI con "Reactivar y tomar propiedad" |
| 5 | Topes de 10 API keys activas y 10 webhooks por cuenta | Hecho | `lib/api/limits.ts`; responde 409 `limit_reached` con mensaje claro; las cuentas internas no tienen tope |
| 6 | Búsqueda de webhooks filtrada por `organizationId` | Hecho | `lib/webhooks/fanout.ts`: filtra por la organización de la cuenta del evento y exige que el dueño sea admin activo |
| 7 | `contact.created` en coexistencia | Hecho | `lib/whatsapp/coexistence/ingest.ts`: historial (`source: "history"`) y eco (`source: "echo"`). Los entrantes ya lo emitían (`source: "inbound"`). |
| 8 | Texto de marketing | Hecho | Landing, `/precios`, `plan-features.ts` → `pricing.generated.php` y `llms.txt` (regenerados), `index.php`, `precios.php` y `legal-layout.php` del cPanel |
| 9 | Documentación pública en `/docs/api` y headers de límite | Hecho | `app/(marketing)/docs/api` y `lib/api/openapi.ts` (ampliado); headers en `lib/api/rate-headers.ts` |

### Cómo funciona cada corrección

**1. IP confiable.** Detrás de Coolify/Traefik, Traefik borra los `X-Forwarded-*` y el `X-Real-Ip` que manda el cliente. En su lugar pone `X-Real-Ip` con la IP real y agrega esa misma IP al final de `X-Forwarded-For`. La regla es:
1. Si existe `TRUSTED_CLIENT_IP_HEADER`, se usa ese header. Es opcional y solo hace falta si algún día ponemos un CDN delante (p. ej. `cf-connecting-ip`); en ese caso, aceptar tráfico únicamente del CDN.
2. Si no, `X-Real-Ip`.
3. Si no, el **último** valor de `X-Forwarded-For`, nunca el primero.
4. Si no hay ninguno, `unknown`.

La variable ya está en `docker-compose.yml`. Con la regla anterior, rotar un `X-Forwarded-For` falso ya no salta el límite.

**2. Idempotencia.**
- Se guarda en Redis durante 24 h, por organización y clave: la huella (método + ruta + JSON con las claves ordenadas), el status y el cuerpo de la respuesta.
- Misma clave y mismo cuerpo: se devuelve la respuesta original con `Idempotent-Replayed: true` y la operación no se repite.
- Misma clave con otro cuerpo: 422 `idempotency_conflict`. Si la primera solicitud sigue en curso: 409.
- No se guardan 401/402/403/429 ni 5xx, para que el cliente pueda reintentarlos. Si la key está revocada, la respuesta guardada no se reproduce.
- Si Redis falla, la solicitud se procesa sin idempotencia (se prefirió no bloquear la API entera).
- `POST /webhooks` queda fuera a propósito: su respuesta trae el secreto `whsec_` y no debe guardarse en Redis.

**4. Pausa por pérdida de admin.**
- **Qué la dispara:** que el creador pase a ejecutivo o usuario, o que se desactive. En ese caso sus webhooks activos quedan con `active=false`, `pausedAt` y `pausedReason`, y su `status` es `paused`.
- **Aviso:** los demás admins activos reciben una notificación en la campana con enlace a Webhooks.
- **Reactivación:** para reactivarlo hay que tomar la propiedad. En la UI hay una confirmación; por API es `PATCH` con `takeOwnership: true`. El webhook pasa a nombre de quien lo reactiva y el recorte de cuentas se valida contra el nuevo dueño. Sin tomar la propiedad, la reactivación se rechaza con un mensaje claro.
- **Defensa extra:** el fanout ignora endpoints cuyo dueño no sea admin activo, aunque el rol haya cambiado por otra vía (p. ej. SQL o soporte).

**7. Ráfaga del historial: qué se decidió.** Se emite un evento por contacto, no por lotes:
- El receptor necesita cada contacto, y el total ya está acotado por el tope de contactos del plan.
- Los eventos del historial entran a la cola `domain-events` con prioridad baja (los eventos en vivo pasan primero) y espaciados 200 ms dentro de cada lote.
- Después, cada entrega sigue los reintentos y el backoff normales.
- El receptor puede filtrarlos por `data.source = "history"`. Así está documentado.
- `contact.created` no dispara automatizaciones, así que no sale ningún mensaje.

**9. Documentación pública.**
- **Qué es:** `app.colibly.com/docs/api` es una página del servidor, sin sesión, que se arma desde `buildOpenApiSpec()`. Los números (límites, reintentos, topes) salen de `lib/api/constants.ts`, que el código también usa, así que la página no se desfasa.
- **Qué cubre:** introducción, autenticación, límites y headers, idempotencia, errores, paginación, política de versiones, webhooks (eventos con ejemplo de `data`, payload, firma en Node y PHP, reintentos, desactivación y pausa) y la referencia de endpoints con `curl` y respuesta de ejemplo.
- **Indexación:**
  - En producción, `robots.txt` de app.* permite `/docs/` y bloquea el resto.
  - Si la página se pide en el dominio del sitio, se redirige a app.* (una sola URL canónica).
  - Solo muestra datos ficticios.
- **Enlaces:** se enlaza desde el pie de la landing ("API para desarrolladores"), `/precios`, el pie del cPanel (inicio y páginas legales), `precios.php` y `llms.txt`.
- **Headers de límite:** toda respuesta autenticada de `/api/v1` lleva `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset` (segundos). El 429 agrega `Retry-After`.

### Corrección de un dato de la auditoría

Los 6 intentos de entrega de un webhook suman unos **15 minutos**: esperas de 30 s, 1 m, 2 m, 4 m y 8 m. No 31, como decía el comentario de `lib/queue.ts`, que ya se corrigió.

### Verificación

- **Pruebas automáticas:** `tsc` limpio, `eslint` limpio y `vitest` con 46 archivos y 519 pruebas. Hay 12 archivos nuevos de pruebas: IP confiable, idempotencia, headers de límite, topes, pausa y toma de propiedad, ruta `PATCH /usuarios`, fanout por organización, candado del botón Probar, eventos de coexistencia, cobertura del OpenAPI y receta de firma de los snippets.
- **Prueba en vivo (dev, Vamex):**
  - `X-RateLimit-*` presentes.
  - `POST /contacts` con un teléfono que ya existía y una `Idempotency-Key`: 200; repetido: 200 con `Idempotent-Replayed: true`; con otro cuerpo: 422 `idempotency_conflict`. El contacto no se modificó.
  - La 11.ª API key se rechazó con 409 `limit_reached`.
  - Se borraron las 10 keys de prueba y las claves `idem:*` de Redis.
- **Lo que no se probó:** no se envió ningún WhatsApp, y la pausa por degradación no se probó en vivo porque Vamex tiene un solo admin (sí está cubierta por pruebas).
- **Capturas:** en `/workspace/api-docs/` (escritorio y celular).

### Pendiente o para decidir

- **Política de versiones:** la página promete mantener v1 al menos 12 meses después de una v2 y avisar por correo. Luis debe confirmar ese compromiso.
- **Publicar el cPanel:** el cPanel se publica a mano. Hay que subir `index.php`, `legal-layout.php`, `precios.php`, `pricing.generated.php` y `llms.txt`.
- **Rotar llave en un clic** (mejora 10): sigue pendiente; hoy se rota creando una nueva y revocando la vieja.
