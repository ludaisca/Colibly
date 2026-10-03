# Plan técnico: Embedded Signup v4 + WhatsApp Coexistencia

Estado: **análisis terminado, sin código escrito** (2026-10-03). Complementa `docs/PLAN_LANZAMIENTO.md` §4 (trámites de Meta) y la memoria `meta-app-colibly.md`.

## 1. Objetivo

Que un negocio conecte su número de WhatsApp a Colibly con un botón ("Conectar WhatsApp"), sin copiar tokens ni secretos, y que pueda **seguir usando la app WhatsApp Business en su teléfono** (coexistencia) con todo sincronizado en el inbox de Colibly.

Hoy el cliente pega Phone Number ID, token, WABA ID, App ID y App Secret de **su propia** app de Meta (`app/(dashboard)/whatsapp/cuentas/_form.tsx`). Ese flujo se conserva como modo "avanzado/manual".

## 2. Datos de Meta ya listos

- Portafolio `1471516364618796` (verificado, Tech Provider). App **Colibly** `3423949611118312`.
- Configuración de Login for Business (Embedded Signup): `1676025620523858` (plantilla "token que caduca en 60 días").
- Dominios OAuth y URI de redirección ya cargados (`app.colibly.com`, `/whatsapp/cuentas`).
- App Review enviada el 2026-10-02 (PENDING). Hasta que se apruebe el acceso avanzado, solo administradores/desarrolladores/evaluadores de la app pueden completar el flujo.
- Pendiente del usuario: App Secret (se captura en `/plataforma`, nunca en el chat).

## 3. Hallazgos del código actual (qué toca y por qué)

| Área | Archivo | Hallazgo |
|---|---|---|
| Firma del webhook | `app/api/whatsapp/webhook/route.ts`, `lib/meta/webhook-signature.ts` | Se valida con `WAAccount.appSecret` **por cuenta**. Con una app de plataforma hay un solo App Secret para todos los clientes. |
| Verificación GET | mismo archivo, `GET` | Busca `verifyTokenHash` por cuenta. La app de plataforma tiene **un** token de verificación global. |
| Campos no manejados | mismo archivo | Ya registra solo la *forma* de campos desconocidos tras validar la firma (útil para estudiar `history`, `smb_*` en DEV). |
| Ingesta | `lib/whatsapp/ingest-message.ts` | Todo es `INBOUND`: crea Contact/Chat, notifica, dispara automatizaciones y bot, emite eventos. Sirve de base, pero la importación de historial **no** debe disparar nada de eso. |
| Toma de control humana | `lib/bots/guards.ts:getBotControlState` | Cuenta como "humano" solo `OUTBOUND` con `senderId != null`. Un eco de la app del teléfono no tiene `senderId` → el bot respondería mientras el dueño atiende. **Cambio obligatorio.** |
| Mensaje | `prisma/schema.prisma` `WAMessage` | No distingue origen. Falta marcar mensajes de la app del teléfono y de historial. |
| Cuenta | `WAAccount` | Sin campos de modo de conexión, coexistencia, vencimiento de token ni estado de sincronización. `@@unique([phoneNumberId])`: un número no puede estar en dos organizaciones (hay que responder 409 claro). |
| Config de plataforma | `PlatformSettings` (`lib/platform-settings.ts`) | Aquí van los datos de negocio (no `.env`). Se añaden App ID, App Secret (cifrado), Config ID y token de verificación. |
| Creación de cuenta | `app/api/whatsapp/accounts/route.ts` | Plantilla de gates: `requireVerifiedEmail`, `checkPlanLimit` de canales, `requireOrgId`, rate limit. El flujo nuevo debe repetirlos. |
| Envío | `lib/whatsapp/send.ts`, `send-interactive.ts`, `send-template.ts` | Descifran `accessToken` por cuenta: sirve tal cual con tokens de negocio de clientes. Versión de Graph fija en `v21.0` en varios archivos. |
| CSP | `next.config.ts` | `script-src`/`connect-src` ya permiten `connect.facebook.net`/`www.facebook.com`. Falta `frame-src` para el diálogo de Facebook. |
| Eliminación de datos | `lib/org-data/delete.ts` | Reutilizable para el callback de eliminación de datos de Meta. |
| Proxy | `proxy.ts` | Las rutas públicas de callback de Meta no deben quedar bajo `PROTECTED`. |

**Árbol de trabajo del usuario:** hay ~60 archivos modificados/nuevos (reacciones, stickers, modo del bot, 3 migraciones nuevas) que **coinciden con los archivos que coexistencia tocaría** (`schema.prisma`, `webhook/route.ts`, `ingest-message.ts`, `lib/whatsapp.ts`, `lib/validations.ts`, `lib/bots/guards.ts`, `cuentas/_form.tsx`). Ver §8.

## 4. Diseño

### 4.1 Configuración de plataforma
`PlatformSettings` (+ migración):
- `metaAppId` (texto), `metaAppSecret` (**cifrado**, el 8.º campo secreto), `metaEmbeddedSignupConfigId` (texto), `metaWebhookVerifyToken` (**cifrado**).
- Editable en `/plataforma` → "Configuración" con el mismo patrón `has<Campo>`/"Quitar" de los otros secretos; registrar en el log solo los nombres de campo.
- Actualizar la lista de "7 campos secretos" en AGENTS.md y en `PATCH /api/plataforma/configuracion`.

### 4.2 Modelo de datos
`WAAccount` (+ migración, después de las 3 del usuario):
- `connectionType` enum `MANUAL | EMBEDDED_SIGNUP` (default `MANUAL`).
- `coexistence Boolean @default(false)`.
- `tokenExpiresAt DateTime?` (token de negocio con vida de 60 días).
- `syncStatus` enum `NONE | PENDING | CONTACTS_REQUESTED | HISTORY_REQUESTED | COMPLETED | HISTORY_DECLINED | EXPIRED | FAILED`, `syncDeadlineAt DateTime?`, `syncRequestIds Json?`.
- `businessAppOnboardedAt DateTime?`, `disconnectedReason String?`.

`WAMessage` (+ migración): `origin` enum `API | BUSINESS_APP_ECHO | HISTORY` (default `API`). Los ecos del teléfono van como `OUTBOUND`, `senderId = null`, `origin = BUSINESS_APP_ECHO`.

### 4.3 Webhook
- Firma: si `account.connectionType = EMBEDDED_SIGNUP`, validar con `metaAppSecret` de plataforma; si no, con el secreto de la cuenta (manual sigue igual).
- GET: aceptar el token global de plataforma además de los hashes por cuenta.
- Nuevos campos: `history`, `smb_app_state_sync`, `smb_message_echoes` (+ `account_update` ya existente: ampliar a `PARTNER_REMOVED`, `ACCOUNT_OFFBOARDED`, `ACCOUNT_RECONNECTED`).
- Cada handler en un módulo propio (`lib/whatsapp/coexistence/…`) para no engordar `route.ts` (601 líneas).

### 4.4 Ingesta sin efectos secundarios
Nueva función `ingestHistoryMessage()` / `ingestBusinessAppEcho()` (no `ingestInboundMessage`):
- Importación de historial: crea Contact/Chat/mensajes; **no** notifica, **no** encola bot, **no** dispara automatizaciones ni `emitDomainEvent` de mensaje, **no** auto-asigna.
- Eco: guarda `OUTBOUND` con `origin = BUSINESS_APP_ECHO`, actualiza `lastMessage`/`lastMessageAt`, pausa conversational runs del chat (como una respuesta manual) y cuenta para `firstResponseAt` solo si se decide (pregunta abierta §9).
- Cambio en `getBotControlState`: considerar también `origin = BUSINESS_APP_ECHO` como actividad humana.

### 4.5 Embedded Signup
Cliente (componente `"use client"` nuevo, p. ej. `whatsapp/cuentas/_conectar-whatsapp.tsx`):
1. Cargar el SDK de Facebook con `appId` de plataforma (viene de un endpoint, no hardcodeado) y versión de Graph.
2. `FB.login(cb, { config_id, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } })` para coexistencia; sin `featureType` para número nuevo.
3. Escuchar `message` de `facebook.com` (`WA_EMBEDDED_SIGNUP`): evento `FINISH` / `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` con `waba_id` y `phone_number_id`.
4. Enviar `{code, wabaId, phoneNumberId, coexistence}` a `POST /api/whatsapp/embedded-signup/complete`.

Servidor (`complete`):
1. Auth, `requireVerifiedEmail`, `checkPlanLimit` de canales, `rateLimit`, `requireOrgId`, solo admin.
2. Intercambiar `code` por token de negocio (GET `/oauth/access_token` con `client_id`, `client_secret` de plataforma, `code`). Cifrar y guardar; calcular `tokenExpiresAt`.
3. Suscribir la app a la WABA (`POST /{waba}/subscribed_apps`).
4. Leer datos del número (`display_phone_number`, `verified_name`, calidad) y `is_on_biz_app`/`platform_type`.
5. **Sin coexistencia:** registrar el número en Cloud API (PIN de 6 dígitos; decidir dónde se genera/guarda). **Con coexistencia: omitir el registro.**
6. Crear `WAAccount` (409 si el `phoneNumberId` ya existe en otra organización).
7. Con coexistencia: poner `syncStatus = PENDING`, `syncDeadlineAt = ahora + 24 h` y encolar el job de sincronización **de inmediato**.

### 4.6 Sincronización (cola nueva `coexistence-sync`)
- Dentro de las 24 h: `POST /{phoneNumberId}/smb_app_data` con `sync_type: smb_app_state_sync` (contactos) y luego `sync_type: history`. **Cada una solo una vez**; guardar `request_id`.
- Idempotencia: si el job se reintenta, no repetir una llamada ya hecha (comprobar `syncStatus`).
- Webhook `history`: puede venir en varias partes y con `error 2593109` si el negocio no comparte historial → `HISTORY_DECLINED`, no error.
- Si pasan 24 h sin completar: `EXPIRED` + notificación a admins + instrucciones de reconectar (Meta exige reofboarding).
- Tick de vigilancia cada 15 min para cuentas `PENDING/…_REQUESTED` próximas al límite.
- La importación respeta `read_only` de la organización y los límites de contactos (decisión §9).

### 4.7 Ciclo de vida
- `account_update`: `PARTNER_REMOVED` (el cliente se desconectó; guardar `disconnection_info`) → `DISCONNECTED` + notificación; `ACCOUNT_OFFBOARDED` (cambio de teléfono) → estado "pausada"; `ACCOUNT_RECONNECTED` → reactivar.
- Token de 60 días: tick diario que alerta y renueva antes de `tokenExpiresAt` (**mecanismo de renovación por verificar en la doc de Meta antes de implementar**).
- Mensaje `131060` (tipo no soportado) tras onboarding de un número de la app: mostrar placeholder, no error.

### 4.8 Callbacks obligatorios de Meta
- `POST /api/meta/deauthorize` y `POST /api/meta/data-deletion`: leer `signed_request` y verificar con `metaAppSecret`; el segundo desconecta la cuenta, borra sus datos con la lógica de `lib/org-data` (cuenta + medios) y devuelve `{url, confirmation_code}` con una página de estado. Rutas públicas fuera de `PROTECTED`, con rate limit.
- Cuando existan, cambiar la URL de "eliminación de datos" de la app de `colibly.com/privacidad` a la ruta real y rellenar los dos campos de callback en Login for Business → Configurar.

### 4.9 CSP y versión de Graph
- `next.config.ts`: `frame-src` += `https://www.facebook.com https://web.facebook.com`; revisar `connect-src` para `graph.facebook.com` si algo se llama desde el navegador.
- Centralizar la versión de Graph en `lib/meta/graph.ts` (hoy `v21.0` repetida en 5 archivos; la doc de Meta usa v25). Cambio mecánico, hacerlo aparte.

### 4.10 UI
- `/whatsapp/cuentas`: botón principal **"Conectar WhatsApp"** y elección "Uso mi número de la app WhatsApp Business (coexistencia)" / "Número nuevo". El formulario manual pasa a "Conexión avanzada".
- Detalle de cuenta: estado de sincronización con barra y aviso "mantén abierta la app WhatsApp Business hasta terminar", fecha límite, botón "Reconectar".
- Banner si la cuenta está en `EXPIRED`/`DISCONNECTED`/`token por vencer`.
- Textos legales: la política debe mencionar la sincronización de historial y los ecos (revisar con el abogado).

## 5. Fases y orden

| Fase | Contenido | Depende de |
|---|---|---|
| F0 | Usuario: commit de su trabajo; App Secret en `/plataforma`; número de prueba | — |
| F1 | `PlatformSettings` + UI de plataforma; firma/verify con secreto de plataforma; `lib/meta/graph.ts` | F0 |
| F2 | Embedded Signup sin coexistencia: SDK, `complete`, suscripción, registro, `WAAccount` nuevo | F1 |
| F3 | Coexistencia: `featureType`, omitir registro, cola de sync, ecos, historial, guard del bot | F2 |
| F4 | Ciclo de vida (offboarding, reconexión, token), callbacks deauth/borrado, alertas | F3 |
| F5 | Pruebas con número real, revisión de seguridad multi-tenant, docs (AGENTS.md/CLAUDE.md) | F4 |

## 6. Pruebas

Unitarias (vitest, funciones puras): selección de secreto de firma; parseo y verificación de `signed_request`; normalizadores de `history`/`smb_message_echoes`/`smb_app_state_sync`; `getBotControlState` con eco; transición de estados de sync; cálculo de vencimientos.

Manuales: con un segundo `Organization` (aislamiento), con la app en modo desarrollo usando un administrador. **Advertencia de Meta:** una app sin publicar solo recibe webhooks de prueba del panel, no de producción; hay que comprobar si la coexistencia recibe eventos reales en ese modo antes de depender de él. Para webhooks en DEV hace falta URL pública HTTPS (el trabajo en curso del usuario ya añade `WHATSAPP_WEBHOOK_BASE_URL` en `lib/whatsapp/webhook-url.ts` para usar un túnel HTTPS en DEV).

## 7. Cosas que verificar en la documentación de Meta antes de programar

1. Forma exacta de los payloads `history`, `smb_app_state_sync`, `smb_message_echoes` (campos, paginación, fases).
2. Cómo se renueva o intercambia el token de negocio de 60 días.
3. Países y versiones de la app WhatsApp Business admitidos para coexistencia (el cliente piloto es de México; confirmar), y límites de envío en este modo.
4. Qué funciones de la app no se sincronizan (grupos, difusión, mensajes temporales…).
5. Si hay que registrar el número en Cloud API con PIN para números **nuevos** (no coexistencia) y dónde guardarlo.
6. Webhooks reales en app sin publicar.

## 8. Cómo trabajar sin pisar tu trabajo

1. **Tú:** haz commit de tus cambios actuales (o dime y lo hago yo en una rama, sin push).
2. **Yo:** crear un `git worktree` en `../Colibly-coexistencia` con la rama `feat/wa-coexistencia` a partir de ese commit. Todo el código nuevo va ahí.
3. Las migraciones nuevas deben llevar timestamp **posterior** a `20261003040455_whatsapp_team_reactions_stickers`.
4. No levantar un segundo stack con el mismo nombre de proyecto `colibly` (puertos y contenedores chocan): usar otro nombre de proyecto y puerto, o ejecutar `tsc`/lint/tests en contenedores desechables montando el worktree.
5. Merge a la rama principal con revisión; nada de despliegue a producción sin respaldo previo de la base (regla del proyecto para migraciones).

## 9. Preguntas abiertas para el usuario

1. ¿La importación de historial debe **contar contra el límite de contactos del plan**? (Propuesta: sí se crean, pero sin bloquear; avisar si se excede.)
2. ¿Los ecos de la app del teléfono cuentan para las métricas de "primer respuesta" del equipo? (Propuesta: no se mezclan con agentes de Colibly; se muestran aparte.)
3. ¿Quieres que Colibly pida al cliente compartir el historial por defecto, o dejarlo a su elección? (La elección ocurre en el teléfono; solo cambia el texto que mostramos.)
4. ¿Cliente piloto y número de prueba definidos?
5. ¿Habilitar coexistencia para todas las organizaciones o con una bandera por organización durante la beta?

## 10. Estimación gruesa

F1 ~medio día; F2 ~1 día; F3 ~2 días; F4 ~1 día; F5 ~1 día con número real. Dependen de la aprobación de App Review para probar con terceros.
