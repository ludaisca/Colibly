# Plan de implementación — segunda revisión Chatwoot/Twenty

## Contexto

`docs/BENCHMARK_CHATWOOT_TWENTY_2026-11-01.md` dejó 18 funciones y 10 patrones de UI/UX que faltan en Colibly. Este plan los convierte en trabajo ejecutable por bloques, con un objetivo explícito del usuario: **que nada falle**. Por eso cada bloque define esquema, backend, UI, permisos, billing, eventos, documentación, pruebas y verificación real, y todo lo que manda mensajes nace **apagado**.

Decisiones ya tomadas por el usuario (2026-11-01):
- **"Esperando respuesta"** se limpia con la respuesta de una persona, del bot de IA o de una automatización conversacional. Los avisos automáticos (fuera de horario, CSAT, auto-resolver, campañas, recuperación) **no** cuentan.
- **Disponibilidad**: un interruptor por cuenta, "Solo asignar a ejecutivos en línea", **apagado por defecto**. Si está encendido y nadie está en línea, el chat queda sin asignar.
- **Fuera de horario**: si la cuenta tiene un bot activo, o una automatización tomó el chat, el aviso no se manda.

Restricciones que se mantienen: no se reintroducen las pestañas de estado ni las notas internas/@menciones; no hay websockets (todo es polling); no se copia código de Chatwoot (Enterprise) ni de Twenty (AGPL).

---

## Paso 0 — antes de escribir código

1. **Commitear lo pendiente** (con el OK del usuario). Hoy hay cambios sin commit: los arreglos de import/CSAT, la división de AGENTS.md (`docs/arquitectura/`), la actualización de CLAUDE.md para Docker y el informe del benchmark. Van en commits separados (`fix`, `docs`).
2. **Rama nueva**: `feat/bandeja-v2`, creada desde `feat/inbox-operativa`, con un commit por función. No hacer push ni merge hasta que el usuario lo pida (decisión 1 del plan anterior).
3. **Datos de prueba reproducibles**: un script `dev/qa/seed-bandeja.sh` que use solo las APIs públicas:
   - registra una organización QA, la verifica por Mailpit y crea una cuenta **WEBCHAT**;
   - genera mensajes entrantes **reales** con `POST /api/webchat/[accountId]/session` y `/messages`, sin Meta;
   - al terminar, borra la organización con `DELETE /api/organizacion`.

   Con esto se prueban esperando respuesta, fuera de horario, auto-resolver, búsqueda y contadores de punta a punta. Telegram se simula con `dev/telegram-webhook/`.
4. **Capturas**: el contenedor de Playwright del benchmark (`node:22-bookworm` + `npx playwright install --with-deps chromium`) se reconstruye cuando haga falta y al final se borra **solo con `docker rmi <imagen>`**. Nunca `docker builder prune`: la vez anterior se llevó 48 GB de caché de otros proyectos.

---

## Definición de "terminado" (aplica a CADA función)

| # | Verificación | Cómo |
|---|---|---|
| D1 | Tipos, lint y tests | `docker compose exec app npx tsc --noEmit`, `npm run lint`, `npm test` |
| D2 | Migración aditiva y revisada | Solo con `sh scripts/new-migration.sh`. Columnas nuevas nullable o con default; nunca un rename como DROP+ADD. Leer el `migration.sql` antes del commit |
| D3 | Reinicio del contenedor | `docker compose restart app` después de una migración o de tocar workers |
| D4 | Aislamiento entre organizaciones | Cada ruta nueva se prueba con una 2.ª organización: los ids ajenos deben dar 404 |
| D5 | Roles en 3 capas | Ocultar en el nav → `proxy.ts` (si es página nueva, en `PROTECTED`) → `forbidRoles()` en la API |
| D6 | Billing | Todo envío pasa por `sendOutbound()`/`sendWhatsAppMessage()` (esos llaman a `assertOrgCanSend`). Cada tick salta las organizaciones que no se pueden escribir (`isOrgWritable`). Cada llamada a IA usa `getPlatformApiKey` → `reserveAiCredit` → proveedor → registro de uso |
| D7 | Eventos de dominio | Si cambia un hecho del catálogo, se emite el evento (`emitDomainEvent`) |
| D8 | Documentación en el mismo commit | El doc de `docs/arquitectura/` que corresponda; una regla nueva va a `AGENTS.md`; las colas nuevas a `colas.md`; cualquier cambio en `/api/v1` actualiza `lib/api/openapi.ts` |
| D9 | Recorrido real | Script de seed + capturas de Playwright en claro y oscuro, y comprobar que la página hidrata (abrirla como `localhost`) |
| D10 | Build de producción al cerrar cada bloque | `docker build --target builder -t colibly-buildcheck:tmp . && docker rmi colibly-buildcheck:tmp && docker image prune -f` |

---

## Bloque A — Base compartida (prerrequisito)

**A1. Fechas por zona horaria de la organización** (arregla el defecto de los reportes y lo necesitan A2, B y E)
- Nuevo módulo `lib/dates/zoned.ts`, puro y con tests:
  - `zonedDayKey(date, tz)`;
  - `zonedDayStart(key, tz)`, que calcula el offset con `Intl` por fecha, sin el `-06:00` fijo;
  - `zonedHourAndDow(date, tz)`.
- `lib/estadisticas/reports.ts`: quitar `const TZ` y `T00:00:00-06:00`, y usar `getOrgBusinessHours(orgId).timezone`. `getRangeReport` recibe el `organizationId` (desde `requireOrgId`).
- Tests en `lib/dates/__tests__/zoned.test.ts`: México, Tijuana (con horario de verano) y un día fronterizo.

**A2. `<RelativeTime>` (U8)**
- `app/components/ui/relative-time.tsx` (client): muestra "hace 2 días" y pone la fecha absoluta en `title`.
- Para no repetir el error de hidratación de "Miembro desde": se renderiza `null` en el servidor y se calcula después del montaje, o se le pasa `now` desde el servidor.
- Reemplazar los formateos sueltos en `chat-list-panel.tsx`, `contact-timeline.tsx` y `lead-card.tsx`.

**A3. Registro único del uso de IA de asistencia** (lo necesitan transcripción, monitores y los que ya existen)
- Modelo `AiAssistUsage` (`organizationId`, `kind` enum `REWRITE|TASK|SUGGEST|TRANSCRIBE|MONITOR`, `model`, `promptTokens`, `completionTokens`, `estimatedCost`, `createdAt`) con `onDelete: Cascade`.
- Ajustar `lib/ai/writing-assist.ts` para que registre su uso (hoy reserva el crédito pero no lo registra).
- Extender `lib/ai/budget.ts:getOrgAiCost()`.
- Documentarlo en `ia.md`.

---

## Bloque B — Bandeja que no deja leads sin atender

### B1. "Esperando respuesta" (#4)
**Esquema**: `waitingSince DateTime? @map("waiting_since")` en `WAChat` y `Conversation`, con índices `@@index([accountId, waitingSince])` / `@@index([channelAccountId, waitingSince])`.

**Backfill en la misma migración**: con `DISTINCT ON (chat_id) … ORDER BY timestamp DESC` sobre `wa_messages`/`channel_messages`. Si el último mensaje es `INBOUND` y el chat no está `RESOLVED`, se pone `waiting_since` igual al timestamp de ese mensaje.

**Helper único** `lib/chats/waiting.ts`:
- `markWaiting(ref, at)` hace `updateMany({ where: { id, waitingSince: null }, data: { waitingSince: at } })`, así conserva la espera más antigua.
- `markReplied(ref)` pone `waitingSince: null`.
- `ref` es `{kind:"whatsapp"|"channel", id}`, el mismo discriminador que `ChatRef`.

Dónde se llama:

| Llama a | Archivo |
|---|---|
| `markWaiting` | `lib/whatsapp/ingest-message.ts`, `lib/telegram/ingest-message.ts` (cubre todos los canales genéricos). **No** desde la importación del historial de coexistencia |
| `markReplied` (persona) | `app/api/whatsapp/chats/[chatId]/send/route.ts`, `send-template`, `sendOutbound()` cuando `countsAsReply !== false` (cubre la API v1, `send_message` de las macros y los pasos de automatización), el eco de coexistencia en `lib/whatsapp/coexistence/ingest.ts` |
| `markReplied` (bot) | `lib/workers/bot-worker.ts` (envío directo), `lib/workers/bot-send-worker.ts` (primer chunk), `lib/telegram/bot-worker.ts`, `lib/meta-messaging/bot-worker.ts` |
| `markReplied` (resolver) | rutas `status` y `bulk`, `lib/macros/execute.ts` y el auto-resolver (B2) |
| **No** llaman | campañas, secuencias, recuperación, CSAT, fuera de horario, mensaje del auto-resolver |

`sendOutbound()` en `lib/messaging/outbound.ts` gana la opción `countsAsReply?: boolean` (default `true`).

**Control anti-olvidos**: un test `lib/chats/__tests__/waiting-callsites.test.ts` lee los archivos de la tabla y verifica que importan `markReplied`/`markWaiting`. Es barato y avisa si alguien quita una llamada.

**Filtro**: `awaiting=1` en `lib/chats/query.ts` (`parseChatListFilters` + los dos builders) equivale a `waitingSince: { not: null }` y `status: { not: "RESOLVED" }`, dentro de `and[]`, nunca en `where.OR`. Se agrega `waitingSince` a los selects y mappers.

**UI**:
- `WaitingBadge` en `chat-list-panel.tsx` muestra "espera 25 min", en ámbar a partir de 15 min y en rojo a partir de 60. Las constantes viven en `lib/chats/waiting.ts`.
- Opción "Esperando respuesta" en `chat-filters-panel.tsx` y vista predefinida en `chat-views-menu.tsx`.
- Colores solo con tokens (`text-warning`, `text-danger`).

**Pruebas**: test unitario del builder (que `awaiting` no pise el `OR` de la búsqueda). En el recorrido real: un mensaje de webchat → aparece en "Esperando"; el agente responde → sale; el bot responde → sale.

### B2. Auto-resolver por inactividad (#6)
**Esquema (Organization)**:
- `autoResolveAfterHours Int?` (null = apagado);
- `autoResolveMessage String?`;
- `autoResolveTagName String?`;
- `autoResolveSkipWaiting Boolean @default(true)`.

**Cola nueva `inbox`** (concurrencia 1, `attempts: 1`) con jobs por nombre: `tick` (repeatable `*/15 * * * *`, jobId `inbox-tick`), `away-message` (B3) y `transcribe` (C1). Se registra en `lib/queue.ts` y `lib/workers/index.ts` (por `job.name`), y se documenta en `colas.md` (pasan a ser 24 colas).

**`lib/inbox/auto-resolve.ts`**:
- Una función pura `autoResolveCandidateWhere(org, now)` con tests.
- Un runner que, por cada organización con la función activa y escribible:
  - toma hasta 200 chats `OPEN/PENDING` con `lastMessageAt < now - N h`, sin posponer y, si `skipWaiting`, con `waitingSince = null`;
  - para cada uno hace un claim atómico: `updateMany({ where: { id, status: {in:[OPEN,PENDING]}, lastMessageAt: <el mismo valor leído> }, data: { status: RESOLVED, resolvedAt, waitingSince: null } })`. Si `count === 0`, entró un mensaje en medio y no se toca;
  - luego emite `conversation.resolved`;
  - si hay etiqueta, la agrega por el camino existente (`afterContactTagAdded` / upsert `waAccountId_name`);
  - si hay mensaje, lo manda con `sendOutbound(..., { countsAsReply: false })`. Un `window_closed` se ignora y se registra en el log.
- **No manda CSAT**: nadie atendió el chat. Se documenta en `bandeja.md`.

**UI**: tarjeta "Resolver chats inactivos" en `/configuracion/ia` (la página de ajustes de la organización, solo admin). El PATCH va en `app/api/configuracion/ia/route.ts` y valida con zod un rango de 1 a 720 h.

### B3. Mensaje fuera de horario (#5)
**Esquema**:
- Organization: `awayMessageEnabled Boolean @default(false)`, `awayMessageText String?`, `businessDays Int[] @default([0,1,2,3,4,5,6])`. Todos los días por defecto, para no cambiar cómo se comportan hoy la recuperación de leads y la condición "en horario".
- Chats: `awayMessageSentAt DateTime?` en `WAChat` y `Conversation`.

**`isWithinBusinessHours()`** (`lib/whatsapp/lead-recovery.ts`): acepta `days?: number[]`, con default todos los días, y calcula el día de la semana en la zona horaria (`zonedHourAndDow` de A1). `getOrgBusinessHours()` devuelve también `days`. Se agregan tests de borde: domingo 23:59 y medianoche en otra zona.

**Decisión pura** `lib/inbox/away-message.ts:shouldSendAwayMessage({ enabled, inHours, lastSentAt, now, isGroup, isFromComment })`, con un cooldown de 12 h por chat. Tests incluidos.

**Ingest** (WA y genérico): después de calcular `activeBot`, si `!suppressBot && !activeBot && shouldSend…`, se encola `inbox/away-message` con `delay: BOT_REPLY_DEBOUNCE_MS` y `jobId: away:<chatId>:<bucket de 12h>` para que sea idempotente.

**Worker**:
1. Vuelve a comprobar las condiciones.
2. Hace un claim atómico de `awayMessageSentAt` (`updateMany` con `awayMessageSentAt` nulo o anterior al cooldown).
3. Envía con `sendOutbound(..., { countsAsReply: false })`. Ese camino ya respeta billing y la ventana de 24 h, que siempre está abierta porque el mensaje acaba de entrar.

Está en todos los planes (no es una automatización). No aplica a grupos ni a comentarios de Facebook.

**UI**: en la misma página de ajustes, los días de la semana (casillas), el horario que ya existe y el texto del mensaje con su vista previa.

### B4. Contadores de vistas (U4)
- `GET /api/whatsapp/chats/counts` devuelve `{ mine, unassigned, awaiting, all }`, contando chats activos (sin posponer ni resolver).
- Usa los mismos builders de `lib/chats/query.ts` sobre las dos tablas, con el alcance de `getUserAccountIds()` y `getUserChannelAccountIds()`.
- Rate limit de 60/min por usuario.
- `chat-views-menu.tsx` muestra el número junto a cada vista predefinida y lo refresca cada 30 s **solo con la pestaña visible** (`document.visibilityState`).
- **No** se agregan pestañas en la cabecera.

### B5. Atajos de teclado y ayuda (#12, U7)
- Las acciones del palette se extraen a `lib/inbox/actions.ts` (asignarme, resolver, posponer 1 h, prioridad alta, siguiente/anterior). El palette y los atajos comparten esa lista, así no hay una segunda ruta de mutación.
- Hook `useInboxShortcuts` en `chat-workspace.tsx`:
  - usa `event.code` (`KeyJ`, `KeyK`, `KeyE`, `KeyA`, `KeyS`), porque en macOS Alt cambia `event.key`;
  - se ignora si el foco está en un `input`, un `textarea`, un elemento `contenteditable` o hay un modal abierto.
- `?` abre `shortcuts-modal.tsx`, y el palette muestra el atajo a la derecha de cada acción.
- Test unitario del filtro de foco y del mapa de teclas.

**Cierre del bloque B**: D1–D10, actualizar `bandeja.md` y `colas.md`, y documentar la regla `markReplied` en `AGENTS.md` (CRM e inbox).

---

## Bloque C — Voz y búsqueda

### C1. Transcribir notas de voz (#1)
**Esquema**:
- `transcript String? @db.Text` y `transcribedAt DateTime?` en `WAMessage` y `ChannelMessage`.
- `autoTranscribeAudio Boolean @default(false)` en `Organization`.

**`lib/ai/transcribe.ts`**:
1. `resolvePlatformModel({ needsAudio: true })`; si no hay Gemini, error claro ("La transcripción requiere Google configurado").
2. `getPlatformApiKey` → `checkAiAccess` (bandera del plan) → `reserveAiCredit`.
3. Leer los bytes con `resolveAbsolutePath(mediaUrl)`, con un tope de 20 MB (el límite de `inlineData`). Si pasa del tope, error y no se gasta el crédito: el tamaño se valida antes de reservar.
4. Armar la parte `audio_url` con un data URI, igual que `bot-worker.ts:buildUserContent()`.
5. Prompt: transcripción literal en el idioma original, sin comentarios. Temperatura 0.
6. Guardar el texto y registrar el uso en `AiAssistUsage` (kind `TRANSCRIBE`).

**Ruta** `POST /api/whatsapp/messages/[messageId]/transcribe`:
- Resuelve el mensaje en `WAMessage` o `ChannelMessage` con la misma autorización que la ruta de media (`getUserAccountIds`/`getUserChannelAccountIds`).
- Solo acepta `messageType` `audio`, rate limit de 20/min por usuario, y responde 402 `ai_credits` cuando no quedan créditos.
- Si el mensaje ya tiene `transcript`, lo devuelve sin gastar crédito (idempotente).

**Modo automático**: el worker de `media-download`, al guardar un audio, encola `inbox/transcribe` solo si la organización lo tiene activo, es escribible y `hasAiCredits()`.

**UI**: la burbuja de audio en `chat-thread-panel.tsx` tiene el botón "Transcribir"; el texto aparece debajo, plegable, con estado de carga y error. El interruptor automático va en ajustes, con el aviso "consume 1 crédito por audio".

### C2. Buscar dentro de los mensajes (#2)
**Índices fuera de Prisma**, con el mismo patrón que el de pgvector: `prisma/sql/ensure-search-indexes.sql`, que `scripts/db-migrate.sh` ejecuta después de `migrate deploy`.
- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- `CREATE INDEX IF NOT EXISTS … USING gin (body gin_trgm_ops)` sobre `wa_messages` y `channel_messages`, y lo mismo para `transcript`.
- **Riesgo en producción**: en tablas grandes, crear el índice al arrancar puede tumbar el healthcheck de Coolify. **Runbook (va a `desarrollo.md`)**: antes del deploy, medir `SELECT count(*) FROM wa_messages` y crear los índices a mano con `CREATE INDEX CONCURRENTLY IF NOT EXISTS` desde `psql`, una sentencia a la vez. Al arrancar, el script solo comprueba que existan.
- Como el índice no está en el esquema ni en las migraciones, `new-migration.sh` no lo ve como drift. Se verifica corriendo `new-migration.sh` en seco.

**Endpoint** `GET /api/whatsapp/search/messages?q=`:
- Mínimo 3 y máximo 100 caracteres, 30 resultados por tabla y rate limit de 30/min.
- Usa `$queryRaw` parametrizado con `ILIKE '%' || ${escaped} || '%' ESCAPE '\'`, escapando `%`, `_` y `\`; Prisma `contains` no los escapa.
- Filtra por `"accountId" = ANY(${waIds})` y `"channelAccountId" = ANY(${chIds})`.
- Devuelve `{messageId, chatId, channel, snippet, timestamp, contactName}`.
- Solo lectura, así que la puerta de solo lectura no aplica.

**Saltar al mensaje**: la ruta `chats/[chatId]/messages` gana el parámetro `around=<messageId>`, que devuelve 25 mensajes antes y 25 después (validando que el mensaje sea de ese chat). El hilo resalta el mensaje con `bg-accent-subtle` durante 2 s.

**UI**: debajo de los chats, en la búsqueda de la lista, una sección "En mensajes"; también un grupo en el palette.

**Cierre del bloque C**: D1–D10. Hacer un `EXPLAIN` del query en dev con datos sembrados (unos 50 mil mensajes generados por script en la organización QA) para confirmar que usa el índice GIN. Actualizar `ia.md`, `bandeja.md` y `desarrollo.md` (runbook).

---

## Bloque D — Ventas con montos

### D1. Valor del trato (#3)
**Esquema (Contact)**:
- `dealValueCents Int?` (pesos × 100). Se usa un entero y no `Decimal` porque `Decimal` no se puede pasar del RSC al cliente.
- `expectedCloseAt DateTime?`.

`LeadOutcomeEvent` gana `valueCents Int?`, una foto del monto en el momento del cambio, escrita en `lib/contacts/side-effects.ts` (línea 43).

**API**: en `lib/validations.ts:contactUpdateSchema` se agrega `dealValue` (número entre 0 y 1e9, en pesos, que se convierte a centavos en el servidor; `null` lo borra) y `expectedCloseAt`. El `PATCH /api/whatsapp/contacts/[id]` existente:
- lo persiste;
- escribe una `ContactActivity` ("Valor del trato: $12,500") con una dedupeKey;
- puede usarlo cualquier rol con acceso al contacto, igual que `leadStatus`.

`lib/org-data/export.ts` incluye los dos campos nuevos. `/api/v1` queda sin cambios en esta fase (se anota en `integraciones.md`).

**Formato**: `lib/money.ts:formatMxn(cents)` con `Intl.NumberFormat("es-MX", {style:"currency", currency:"MXN"})` y tests.

### D2. Totales del kanban y tarjeta (U2, U10)
- `ventas/page.tsx` (RSC) hace un `prisma.contact.groupBy({ by: ["pipelineStageId"], _sum: { dealValueCents: true }, _count: true, where: <el mismo alcance que el tablero> })` y pasa los totales en `BoardData`.
- Al arrastrar una tarjeta, `_board.tsx` recalcula los totales de forma optimista.
- `lead-card.tsx` muestra el monto y la fecha de cierre (con icono) y el avatar del asignado.
- "＋ Nuevo" por columna **queda fuera**: no existe una ruta de sesión para crear contactos a mano. Se anota como pendiente.

### D3. Reportes de ventas
`lib/estadisticas/reports.ts` suma `LeadOutcomeEvent.valueCents` por `outcome` (WON/LOST) dentro del rango y en la zona horaria de la organización (A1). Se agregan KPIs "Ganado $" y "Perdido $" y su columna en el CSV.

### D4. Drawer del contacto con pestañas (U1)
- `contact-drawer.tsx` pasa a 4 pestañas: **Resumen** (datos, valor del trato, próxima cita), **Actividad** (timeline), **Tareas y citas** y **Campos**.
- La pestaña se guarda en la URL (`&tab=`). `chat-workspace.tsx` tiene que **conservar** `tab` además de `contacto` cuando reconstruye los filtros. Es el riesgo principal del cambio: se prueba cambiando filtros con el drawer abierto.
- Las acciones principales quedan fijas abajo; "Copiar enlace" incluye la pestaña.

**Cierre del bloque D**: D1–D10, actualizar `crm.md`.

---

## Bloque E — Equipo en tiempo real

### E1. Disponibilidad (#7, U9)
**Esquema**:
- `User.availability` (enum `ONLINE|BUSY|OFFLINE`, default `ONLINE`) y `User.lastSeenAt DateTime?`.
- `autoAssignOnlineOnly Boolean @default(false)` en `WAAccount` y `ChannelAccount`.

**Latido sin websockets**: `GET /api/whatsapp/notifications`, que ya se consulta cada 25 s, hace `updateMany({ where: { id, OR: [{lastSeenAt:null},{lastSeenAt:{lt: now-60s}}] }, data: { lastSeenAt: now } })`. Es una escritura por minuto por usuario como máximo.

**Estado efectivo**: función pura `lib/users/availability.ts:effectiveAvailability(user, now)`, con tests. Da `OFFLINE` si el usuario lo eligió o si `lastSeenAt` tiene más de 5 min.

**Cambiar el estado**: `PATCH /api/usuarios/me/disponibilidad`. Va bajo `/api/usuarios` para heredar la allowlist de solo lectura de `proxy.ts`.

**Autoasignación**: `lib/whatsapp/auto-assign.ts` y `lib/telegram/auto-assign.ts` filtran por `effectiveAvailability === "ONLINE"` **solo si** la cuenta tiene `autoAssignOnlineOnly`. Si nadie califica, devuelven `null` (el chat queda sin asignar). Con el interruptor apagado, el comportamiento es idéntico al de hoy, y un test lo comprueba.

**UI**: el punto de estado en el avatar de `app-shell`, el selector en el menú de perfil y el interruptor en el detalle de cada cuenta (WhatsApp y los canales).

### E2. Panel en vivo (#10, U5)
- `GET /api/estadisticas/en-vivo` (admin y user; 403 para ejecutivo) devuelve los chats abiertos, sin asignar, esperando y pendientes, y el estado de los agentes.
- Una franja `KpiStrip` arriba de `/estadisticas/reportes`, con el punto `animate-pulse-live`, refrescada cada 30 s solo con la pestaña visible.

### E3. Mapa de calor (#9)
- `reports.ts` agrega `$queryRaw`: `extract(dow|hour from timestamp AT TIME ZONE ${tz})`, con `count(*)` de los mensajes INBOUND y de `resolvedAt`, sobre las dos tablas, con el alcance por ids y el rango del reporte.
- Componente `heatmap.tsx` (7×24) cuyo color es `color-mix` del acento sobre `--surface` según la intensidad, sin colores literales y con valores visibles al pasar el ratón.
- Se agrega el par de contraste a `contrast.test.ts` si aparece un token nuevo.

### E4. Notificaciones push en el navegador (#8)
**Dependencia**: `web-push`, instalada dentro del contenedor (`docker compose exec app npm install web-push`).

**Configuración**: `vapidPublicKey` y `vapidPrivateKey` en `PlatformSettings`, más un botón "Generar llaves" en `/plataforma`. La privada se suma a `PLATFORM_SECRET_FIELDS` (pasan a ser 12; se actualizan los "11" que aparecen en los docs y en el doctor).

**Modelo** `PushSubscription`: `userId` con cascade, `endpoint` único, `p256dh`, `auth`, `userAgent`, `createdAt`.

**Rutas**: `POST/DELETE /api/usuarios/me/push` (también bajo la allowlist).

**Service worker**: `public/sw.js` maneja `push` y `notificationclick` (abre el `link`). Hay que verificar que `proxy.ts` no redirija `/sw.js` ni `/manifest.webmanifest` entre los hosts del sitio y de la app, y que la CSP permita el worker (`worker-src 'self'` si hace falta).

**Envío**:
- `lib/notifications/push.ts:queuePush(userId, {title, body, link})` encola un job en la cola `inbox`.
- El worker envía con `web-push` y borra la suscripción si recibe 404/410.
- Se engancha solo en: `CHAT_MESSAGE` (los dos ingests), `CHAT_ASSIGNED` (rutas `assign` y `bulk`) y la llamada entrante (`calling/ingest.ts`).

**UI**: en el perfil, "Activar notificaciones" con el permiso del navegador. En iOS se muestra el aviso "instala la app en la pantalla de inicio".

**Cierre del bloque E**: D1–D10. La prueba de push se hace en Chrome real; Playwright no cubre push.

---

## Bloque F — Resto (cada uno es un commit independiente)

| # | Función | Notas clave para que no falle |
|---|---|---|
| F1 | Rendimiento del bot (#11) | Sin esquema nuevo. Para cada chat con bot en el rango: "resuelto sin humano" = `RESOLVED` y ningún `WAMessage` OUTBOUND con `senderId`. "Traspaso" = existe un OUTBOUND humano después de una respuesta del bot, o hubo un paso `handoff`. Se agrega el CSAT por grupo. Funciones puras con tests y sección nueva en reportes |
| F2 | Monitores de temas con IA (#15) | Modelos `TopicMonitor` (organización, nombre, descripción, activo) y `TopicMatch` (`monitorId`, `chatRef`, `evidenceMessageIds Json`, `createdAt`, único por `(monitorId, chatId)`). Un tick cada hora en la cola `inbox` revisa los chats con mensajes nuevos desde su `lastScanAt`, con 50 por organización. Usa `hasAiCredits`, una reserva por chat y `wrapUserPrompt` sobre la descripción. Si el modelo devuelve un JSON inválido, se descarta. Está gateado por plan (`checkLeadScoringAccess`, solo Pro). Apagado por defecto |
| F3 | Importación con mapeo de columnas (#13) | `contact-import-modal.tsx` agrega el paso "mapear columnas" (teléfono, nombre, etiqueta, campo personalizado o ignorar) y la vista previa con errores. La API acepta `{csv, mapping}` y valida que la etiqueta y los campos sean de esa cuenta (`tagBelongsTo`, definición por cuenta). Se conservan el límite del plan, el evento `contact.created` y el rate limit actuales |
| F4 | Atributos obligatorios al resolver (#14) | Helper `lib/chats/required-fields.ts:missingRequiredFields(chat)`. La ruta `status` responde 422 `required_fields` con la lista. `bulk` excluye esos chats y reporta `skipped`. Las macros fallan con un mensaje claro. El auto-resolver los **salta**. La UI muestra un modal que pide los campos y reintenta |
| F5 | Variables en respuestas rápidas (#16) | Se reutiliza `lib/automations/graph.ts:renderText()` en `insertCannedResponse()` (`chat-workspace.tsx:1119`) con `{nombre, agente, negocio}`. Una variable desconocida queda tal cual. Tests del render |
| F6 | Firma personal (#17) | `User.messageSignature String?` y `User.signatureEnabled Boolean`. Se agrega **solo** en la ruta `send` manual de texto, nunca en plantillas, botones ni media sin caption. Vista previa en el compositor |
| F7 | 2FA y sesiones (#18) | TOTP con secreto cifrado (`lib/crypto.ts`), códigos de respaldo hasheados y un paso extra en `authorize` de NextAuth. "Cerrar las demás sesiones" incrementa `sessionVersion`. Rate limit en la verificación. El dueño de la plataforma no queda exento. Va al final por riesgo: hace falta un flujo de recuperación probado antes de activarlo |
| F8 | Pie de tabla con conteos (U3) | En Contactos: un conteo y los % sin teléfono/sin etiqueta, calculados en el servidor con el mismo alcance |
| F9 | Estados vacíos que enseñan (U6) | La bandeja y Contactos vacíos reutilizan `getOnboardingSteps()` (`lib/onboarding.ts`) como tarjetas de acción, respetando el rol |

---

## Orden y puntos de control

`0 → A → B → C → D → E → F (F1 → F5 → F6 → F3 → F4 → F8 → F9 → F2 → F7)`.

Al terminar cada bloque se para y se presenta al usuario: capturas, resultado de D1–D10 y lista de migraciones. Push y PR solo con su orden. Antes de desplegar a producción:
1. respaldo de la base;
2. revisar todas las migraciones juntas;
3. crear los índices trigram a mano (runbook de C2);
4. desplegar;
5. correr el doctor de `/plataforma`.

## Archivos críticos (referencia)

- Bandeja: `lib/chats/query.ts`, `app/components/whatsapp/{chat-workspace,chat-list-panel,chat-filters-panel,chat-views-menu,contact-drawer}.tsx`, `app/components/ui/command-palette.tsx`
- Ingest y envío: `lib/whatsapp/ingest-message.ts` (dispatch → bot, líneas 259–291), `lib/telegram/ingest-message.ts`, `lib/messaging/outbound.ts`, `app/api/whatsapp/chats/[chatId]/send/route.ts`, bot workers
- Ticks y colas: `lib/queue.ts`, `lib/workers/index.ts` (patrón de repeatables, líneas 204–313)
- Ajustes de la organización: `app/api/configuracion/ia/route.ts`, `lib/organizations.ts:getOrgBusinessHours`, `lib/whatsapp/lead-recovery.ts:isWithinBusinessHours`
- IA: `lib/ai/{platform,credits,writing-assist,budget}.ts`, `lib/workers/bot-worker.ts:buildUserContent`
- Ventas: `app/(dashboard)/ventas/{page,_board}.tsx`, `app/components/pipeline/lead-card.tsx`, `lib/contacts/side-effects.ts`
- Reportes: `lib/estadisticas/reports.ts`
- Plataforma: `lib/platform-settings.ts` (`PLATFORM_SECRET_FIELDS`), `next.config.ts` (CSP), `proxy.ts`, `app/manifest.ts`

## Verificación de punta a punta (al cerrar todo)

1. `dev/qa/seed-bandeja.sh` crea la organización QA con webchat y Telegram simulado.
2. Escenarios, cada uno con capturas:
   - un mensaje fuera de horario recibe el aviso una sola vez en 12 h, y el chat sigue "esperando";
   - el agente responde → sale de "esperando";
   - 25 h de inactividad (simuladas moviendo `lastMessageAt` en la base de la organización QA) → el auto-resolver lo resuelve y no manda CSAT;
   - un audio transcrito aparece en la búsqueda;
   - el valor del trato se suma en el kanban y en los reportes;
   - con disponibilidad OFFLINE y "solo en línea", el chat queda sin asignar;
   - llega el push en Chrome.
3. Barrido de aislamiento con una 2.ª organización sobre todas las rutas nuevas (404).
4. `tsc`, lint, tests y la build `builder`.
5. Limpieza: borrar las organizaciones QA por la API y la imagen de Playwright con `docker rmi` (sin `builder prune`).
