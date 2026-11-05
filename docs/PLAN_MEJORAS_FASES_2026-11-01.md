# Plan de mejoras por fases y bitácora de decisiones

**Creado:** 2026-11-01
**Rama de trabajo:** `feat/inbox-operativa`
**Estado:** Fases 0, 1, 2 y 3 completas. Fase 4 parcial (calendario hecho; SLA, equipos, FAQ suggestions y merge pendientes).
**Producción:** `main` sigue en `9a99cdd` y no se ha mergeado nada. `origin/feat/inbox-operativa` se quedó en `de4ad4a` (el commit de claim); los **7 commits posteriores** y este documento están solo en local.

Este documento es el índice para retomar el trabajo: qué se hizo, por qué se tomó cada decisión, qué migraciones hay y qué falta. El detalle técnico vive también en `AGENTS.md` (secciones “Inbox operations”, “Contact timeline, reports and command actions”, “Contact import, CSAT, campaign analytics and calendar” y “Macros / Conversation attributes”).

---

## 1. Punto de partida

Se instalaron dos productos de referencia en un stack aislado, sin tocar Colibly:

| App | URL local | Uso |
|---|---|---|
| Chatwoot | `http://localhost:3001` | Referencia de bandeja, snooze, prioridad, equipos, CSAT, SLA, macros, reportes |
| Twenty CRM | `http://localhost:3002` | Referencia de vistas, filtros, timeline, importación, command menu, side panel |
| Mailpit | `http://localhost:18026` | Correo de pruebas |

Repos clonados en `/data/Proyectos/colibly-bench/{chatwoot,twenty}`. El análisis comparativo está en `/data/Proyectos/colibly-bench/GAP_ANALYSIS.md`.

**Conclusión del benchmark:** Chatwoot aporta el modelo de operación de bandeja; Twenty aporta el modelo de datos/vistas/UX. Colibly ya estaba por delante en automatizaciones, webhooks, API, billing, multicanal y créditos de IA, así que se copiaron **modelos de producto**, no motores internos. No se portó código de Chatwoot Enterprise ni de Twenty (AGPL/enterprise).

---

## 2. Plan de 4 fases

| Fase | Objetivo | Estado |
|---|---|---|
| **Fase 0** | Cerrar sistema visual y búsqueda global; dejar `main` desplegable | **Completa** (`9a99cdd`, desplegada en producción) |
| **Fase 1** | Bandeja operativa: reclamar, snooze, prioridad, filtros/vistas, bulk, typing y borradores | **Completa** |
| **Fase 2** | Contexto y control: timeline, reportes, acciones del palette, deep link y capa compartida de chats | **Completa** |
| **Fase 3** | Calidad y crecimiento: CSV, CSAT, campañas, macros y atributos de conversación | **Completa** |
| **Fase 4** | Soporte avanzado: calendario, SLA, equipos, FAQ suggestions y merge | **Parcial** (solo calendario) |

---

## 3. Fase 0 — sistema visual y búsqueda

**Commit:** `9a99cdd feat(ui): cerrar sistema de controles y búsqueda global` (en `main`, desplegado).

### Hecho
- Controles de **38 px** de alto y **9 px** de radio.
- Superficies/cards/tablas/dropdowns a **12 px**; modales a **16 px**; badges/pills full.
- `Button md` 38 px; `sm` 32 px para acciones densas; `lg` 44 px para CTAs.
- Sidebar sticky a `h-svh`, expandido por defecto, scrollbar oculto.
- Rail de chats y pills de canal sin scrollbar visible.
- Layout global a **6XL** (`max-w-6xl`), con excepciones para chat full-bleed y editor de automatizaciones.
- Command palette: chats de los 5 canales + contactos + secciones, debounce 250 ms, deep link a contacto/chat.

### Decisiones
- **6XL global**: estandariza lectura y deja el chat/flow builder como excepciones deliberadas.
- **Jerarquía de radios**: 9 px controles, 12 px superficies, 16 px modales. No todo 9 px.
- **Jerarquía de alturas**: 38 px estándar, 32 px acciones de fila, 44 px CTA.
- **Sidebar expandido por defecto**: el usuario trabaja con etiquetas visibles; el estado se guarda en `colibly:sidebar-collapsed`.
- **No `dark:`**: el tema usa tokens semánticos; `dark:` de Tailwind lee el OS, no el toggle de la app.

---

## 4. Fase 1 — bandeja operativa

### Commits
- `de4ad4a feat(bandeja): reclamar chat y notificar asignación` (único commit pusheado antes de la instrucción de no push).
- `0389c0b feat(bandeja): snooze y prioridad por conversación`.
- `eb7fe2e feat(bandeja): acciones masivas, vistas, borradores y typing`.
- `9a53da1 docs(bandeja): documentar snooze, prioridad, bulk, typing y borradores`.

### 4.1 Reclamar chat y notificación
- `PATCH /api/whatsapp/chats/[chatId]/assign` acepta `{ self: true }`.
- Banner “Este chat no está asignado → Asignarme” en el composer para chats abiertos no resueltos.
- `NotificationType.CHAT_ASSIGNED`; se envía solo cuando **otro** agente asigna, nunca en autoasignación.
- Acción “Asignarme” también en el selector de asignación.

**Decisión:** el auto-claim no notifica al actor; el aviso existe para el agente que recibe el chat, no para quien lo reclama.

### 4.2 Snooze
- `WAChat.snoozedUntil` y `Conversation.snoozedUntil`.
- No se añadió un estado `SNOOZED`: el chat conserva `OPEN`/`PENDING`; una fecha futura lo oculta de la bandeja activa.
- `GET /chats` acepta `snoozed=only|all`; por defecto oculta pospuestos.
- Un inbound limpia `snoozedUntil` y reabre si estaba `RESOLVED`.
- Un snooze vencido cuenta como activo sin job de limpieza.
- UI: atajos 1 h / mañana 9:00 / 1 semana / quitar, en Detalles; reloj en la fila.

**Decisión:** no usar `ChatStatus.SNOOZED` para no romper automatizaciones, filtros y métricas que ya asumen OPEN/PENDING/RESOLVED. El campo es más barato y no requiere migrar semántica.

### 4.3 Prioridad
- `ChatPriority` (`LOW/NORMAL/HIGH/URGENT`) en ambas tablas; default `NORMAL`.
- `PATCH /chats/[chatId]/priority`.
- Selector en Detalles; bandera compacta en la fila; filtro en la bandeja.

**Decisión:** no reordenar la bandeja por prioridad por defecto; se filtra/pinta, pero el orden natural sigue siendo `lastMessageAt`.

### 4.4 Filtros y vistas guardadas
- Filtros: `assigned=me|unassigned`, `priority`, `snoozed`, campaña, `hasReplied`, búsqueda; sincronizados con la URL.
- `ChatFiltersPanel` los expone.
- Vistas guardadas en `localStorage` (`colibly:chat-views`) con nombre + query; se aplican reconstruyendo los filtros.
- **No se reintrodujeron pestañas de estado**: se quitaron a propósito antes; las vistas guardadas cubren “Míos / Sin asignar / Pospuestos” sin llenar la cabecera.

**Decisión:** vistas por navegador, no compartidas. Si se necesitan compartidas, migrar a un modelo `SavedView`; no meter permisos en localStorage.

### 4.5 Acciones masivas
- `POST /api/whatsapp/chats/bulk` con `{ chatIds, action }`, máximo 100.
- Acciones: asignar (`self` o `assignedToId`), resolver/reabrir, prioridad, snooze.
- Verifica acceso con `getUserAccountIds` + `getUserChannelAccountIds`; no revela ids fuera de alcance.
- Emite `conversation.assigned`/`conversation.resolved` por chat cambiado; una sola notificación resumen si asigna a otro usuario.
- UI: modo selección explícito, checkbox y barra flotante (Asignarme, Resolver, 1 h, Alta).

**Decisiones:** límite 100 para no bloquear el request; no notificar en autoasignación masiva; actualizar ambas tablas.

### 4.6 Typing y borradores
- Redis sorted set `typing:<chatId>` con ventana de 6 s y TTL 10 s; `GET/POST /chats/[chatId]/typing`, poll cada 5 s.
- Indicador “X está escribiendo…” en el header.
- Borradores en memoria + `localStorage` `colibly_chat_draft:<userId>:<chatId>`; se vacían al enviar y se conservan al cambiar/cerrar chat.

**Decisión:** no websockets; el polling de 5 s ya existe y el TTL corto evita zombies.

---

## 5. Fase 2 — contexto y control

**Commit:** `4e36a34 feat(fase-2): timeline, reportes, acciones y consulta compartida`.

### 5.1 Timeline del contacto
- Modelo `ContactActivity` append-only (`type`, `title`, `body`, `actorId`, `metadata`, `dedupeKey`).
- El worker de `domain-events` registra: creado, etapa, etiquetas, asignación, resolución, citas, scoring y lead de anuncio.
- Notas, tareas y campos personalizados escriben directo.
- `dedupeKey` = `event.id` para idempotencia; errores del timeline no bloquean webhooks/automatizaciones.
- `GET /api/whatsapp/contacts/[id]/activities`.
- UI: sección “Actividad” en el drawer con refresh manual.

**Decisiones:** no registrar cada mensaje (el hilo ya es el timeline); no usar triggers de DB; el worker es best-effort y las acciones manuales son inmediatas.

### 5.2 Reportes por periodo
- `/estadisticas/reportes` + `lib/estadisticas/reports.ts`.
- Rango `?from=YYYY-MM-DD&to=YYYY-MM-DD`, default 30 días, máximo 90.
- KPIs: chats nuevos, resueltos, mensajes, FRT, resolución, sin asignar, CSAT.
- Tabla por agente con drilldown modal a sus chats; tabla por canal; export CSV de ambas.
- Fechas en `America/Mexico_City` con límite exclusivo al día siguiente.
- Índices `(accountId, createdAt)`, `(accountId, resolvedAt)` y equivalentes en `Conversation`.

**Decisión:** página separada, no bolted range en `/estadisticas`: el caché actual está keyed por usuario y agrega todo el histórico.

### 5.3 Command palette con acciones
- Acciones contextuales en chat: asignarme, resolver, posponer 1 h, prioridad alta.
- Acciones de creación/navegación filtradas por rol.
- Recientes en `localStorage` (`colibly:command-recent`).
- Las acciones llaman a las mismas APIs del inbox; no hay segunda ruta de mutación.

**Decisión:** no persistir comandos en DB como Twenty; el registro vive en código y se filtra por rol.

### 5.4 Deep link del contacto
- `?contacto=<id>` abre el drawer sin depender del chat.
- El workspace preserva `contacto` al reconstruir filtros con `history.replaceState`.
- Botón “Copiar enlace” en el drawer.

**Decisión:** el drawer es independiente del chat seleccionado; el chat sigue siendo el contexto de mensajes.

### 5.5 Capa compartida de chats
- `lib/chats/query.ts`: `parseChatListFilters`, `buildWaChatWhere`, `buildChannelChatWhere`, selects y mappers compartidos.
- Usada por `/api/whatsapp/chats` y `lib/channel-chats.ts`.
- **No hay endpoint único `/api/chats`**: cada tabla pagina sobre su propio total; un merge sobrefetcharia. La capa unifica reglas y shape, no la paginación.

---

## 6. Fase 3 — calidad y crecimiento

**Commits:**
- `260033a feat(fase-3-4): importación CSV, CSAT, campañas y calendario`
- `f6a29dd feat(macros): acciones manuales reutilizables por chat`
- `3375f5b feat(atributos): campos personalizados de conversación`

### 6.1 Importación CSV de contactos
- `POST /api/whatsapp/contacts/import` `{accountId, csv}`.
- Cabecera requerida (`telefono/nombre` o `phone/name`); parser compartido con campañas.
- Normaliza y deduplica teléfonos; máximo 2 MB / 5,000 filas.
- Valida límite de contactos con `evaluatePlanLimit`.
- `createMany({skipDuplicates:true})`; `source=csv_import`; no crea chats.
- Funciona con WhatsApp y canales genéricos.
- UI: “Importar CSV” en `/whatsapp/contactos`, con preview.

**Decisiones:** no emitir `contact.created` por cada fila (evita miles de jobs); el timeline de esos contactos empieza vacío. No sobrescribe nombres existentes.

### 6.2 CSAT
- `WAAccount.csatEnabled` (off por defecto) + `CsatResponse` (una por chat, token único).
- Al resolver WhatsApp: `maybeSendCsat()` solo si la ventana de 24 h sigue abierta; envía enlace, guarda `WAMessage`, marca `sentAt`.
- Si el envío falla, se borra la encuesta y **no** falla la resolución.
- Página pública `/csat/[token]`; `POST /api/csat/[token]` rating 1–5 + comentario, rate-limited, una respuesta.
- Reportes incluyen enviadas/respuestas/promedio.
- Toggle por cuenta en la ficha de la cuenta.

**Decisiones:** v1 por enlace, no mensaje interactivo (más simple y permite comentario); una encuesta por chat; apagada por defecto porque es un mensaje al cliente final.

### 6.3 Analítica de campañas
- Detalle de campaña: tasas de entrega/lectura, filtro por estado y export CSV de destinatarios.
- `GET /api/whatsapp/campaigns/[id]?status=`.
- Contadores de `WACampaign` siguen siendo la fuente de verdad; no se recalculan desde recipients.

**Decisión:** tasa de entrega/lectura sobre intentos (`sent+delivered+read+failed`), no sobre el total de destinatarios.

### 6.4 Macros
- `Macro` por organización (`name`, `description`, `actions Json`).
- Acciones: `assign_self`, `status`, `priority`, `snooze` (1h/tomorrow/week), `send_message`.
- `lib/macros/execute.ts` reutiliza `sendOutbound`, eventos de dominio y CSAT.
- CRUD `/api/whatsapp/macros`; ejecución `/macros/[id]/run {chatId}`.
- UI: `/configuracion/macros` + “Aplicar macro” en el menú del chat.
- Cualquier rol con acceso al chat puede ejecutar; `ejecutivo` no administra.

**Decisiones:** no crear un segundo motor; no incluir tags/assign_user en v1; el mensaje respeta la ventana de 24 h (si está cerrada, la macro falla con el error de Meta).

### 6.5 Atributos de conversación
- `ChatCustomFieldDefinition` por cuenta (`waAccountId` XOR `channelAccountId`, key/label/type/options/required/order).
- Valores en `WAChat.customFields` / `Conversation.customFields` como `{ [key]: string }`.
- APIs: `/api/whatsapp/chat-custom-fields` + `/[id]`; valores en `/chats/[chatId]/custom-fields`.
- UI: sección en Configuración y “Atributos de la conversación” en Detalles del chat.
- Tipos: TEXT/NUMBER/DATE/BOOLEAN/SELECT; SELECT valida opciones.

**Decisiones:** sin tabla de valores (JSON en el chat); borrar una definición deja claves huérfanas que se filtran al leer; `ejecutivo` no administra definiciones.

### 6.6 Bug de hidratación corregido
- “Miembro desde” en Configuración formateaba la fecha con zona del servidor/cliente y al cambiar de mes producía mismatch (octubre vs noviembre), regenerando el árbol y dejando secciones sin hidratar.
- Se fijó `timeZone: "America/Mexico_City"` y se eliminó el fallback `new Date()`.

---

## 7. Fase 4 — soporte avanzado

### 7.1 Calendario de citas — hecho
- `/whatsapp/citas` tiene toggle Lista/Calendario.
- Grid mensual cliente sobre las citas ya cargadas; respeta filtros; click abre `AppointmentFormModal`.
- Navegación de mes; celdas de hoy y días fuera del mes.

### 7.2 SLA — hecho (2026-11-05)
Implementado con los defaults de la tabla (60 min / 8 h / horario laboral / pausa al posponer), **apagado por defecto** y editable por organización. Avisos: campana + push (no correo: con un retraso general serían decenas de correos). Detalle: `docs/arquitectura/bandeja.md` → "Tiempos de atención / SLA". Falta: métricas históricas de cumplimiento.

Propuesta original:
Propuesta de defaults (a confirmar por el negocio):

| Regla | Default propuesto |
|---|---|
| Primera respuesta | 60 min |
| Resolución | 8 h |
| Horario | Solo horas laborales de la organización |
| Canales | WhatsApp + canales genéricos |
| Avisos | Campana + email al asignado y admins |
| Pausa | No contar tiempo con el chat pospuesto |
| Configuración | Por organización, editable |

Implementación prevista: campos de breach en chats, tick de 5 min, notificaciones deduplicadas y métricas en reportes. No empezar hasta confirmar reglas.

### 7.3 Equipos — hecho (2026-11-05)
`Team`/`TeamMember`, `teamId` en chats, equipo por defecto por cuenta, autoasignación dentro del equipo, vista "Mis equipos" y selector en la conversación; sin roles nuevos. Detalle: `docs/arquitectura/bandeja.md` → "Equipos". Falta: API pública, automatizaciones y reportes por equipo.

Propuesta original:
`Team`/`TeamMember` por organización, `teamId` en chats, filtros y asignación por equipo. Solo vale la pena si el ICP opera con más de ~5 agentes; no añadir roles nuevos.

### 7.4 Pendiente: FAQ suggestions con IA
Detectar preguntas repetidas en chats resueltos, proponer artículos para la base RAG del bot, aprobación humana y creación de `WABotKnowledge` + `rag-index`. Usar créditos de IA existentes.

### 7.5 Pendiente: merge de duplicados
Detección por teléfono normalizado y merge limitado; el merge completo de chats es riesgoso por `WAChat.contactId` único y las relaciones. Empezar por duplicados sin chat o por detección en importación.

---

## 8. Decisiones transversales

1. **No push ni merge** hasta que el usuario lo indique. `main` y producción no se tocaron durante estas fases.
2. **Migraciones siempre con `scripts/new-migration.sh`**; nunca `db push`/`migrate dev`.
3. **Una sola fuente de envío**: cualquier feature que mande mensajes usa `sendWhatsAppMessage`/`sendOutbound` y respeta `assertOrgCanSend` + ventana de 24 h.
4. **Eventos de dominio como bus**: timeline y automatizaciones consumen los mismos eventos; no duplicar lógica.
5. **Permisos en 3 capas**: nav/UI, `proxy.ts` donde aplica y API (`forbidRoles`, scoping por cuenta/org).
6. **Scoping por organización/cuenta**: nunca `userId` para recursos compartidos; usar `getUserAccountIds`/`getUserChannelAccountIds`/`resolveChatChannel`.
7. **JSON para datos flexibles** (macros, atributos, metadata de timeline), con validación en API; no añadir tablas de valores si no hacen falta.
8. **Caché**: reportes nuevos sin caché; stats existentes conservan su TTL de 60 s y key por usuario.
9. **Sin websockets**: polling de 5 s/15 s y Redis TTL para señales efímeras.
10. **Vistas guardadas locales** hasta validar necesidad de compartirlas.
11. **CSAT opt-in por cuenta**, no global.
12. **Macros son acciones manuales**, no automatizaciones.
13. **Atributos de conversación no son campos de contacto**; se guardan en el chat.
14. **No reintroducir pestañas de estado ni notas internas de chat** sin pedirlo.
15. **No copiar motores de Chatwoot/Twenty**: solo modelos de producto.

---

## 9. Migraciones nuevas

Aplicadas en dev; se ejecutarán en producción al desplegar la rama:

| Migración | Qué hace |
|---|---|
| `20261030225113_chat_assigned_notification` | `NotificationType.CHAT_ASSIGNED` |
| `20261030230248_chat_snooze_priority` | `ChatPriority`, `priority`, `snoozedUntil`, índices |
| `20261101033531_contact_activity_timeline` | `ContactActivity` |
| `20261101050700_report_date_indexes` | Índices de fecha para reportes |
| `20261101052130_csat_surveys` | `CsatResponse` + `WAAccount.csatEnabled` |
| `20261101053312_macros` | `Macro` |
| `20261101055329_chat_custom_fields` | `ChatCustomFieldDefinition`, `customFields` JSON en chats |

**Antes de desplegar:** backup de la base y `scripts/db-migrate.sh` (lo corre el startup). Las migraciones no se han probado contra una copia de producción.

---

## 10. Verificación

- `npx tsc --noEmit`: OK.
- `eslint` sobre los módulos tocados: OK.
- **665 tests** (`npm test`): OK.
- Build de producción con el stage `builder`: OK.
- Pruebas manuales en dev:
  - Claim en WhatsApp y Telegram, notificación al otro agente.
  - Snooze, prioridad, filtros y vistas guardadas.
  - Bulk asignar/prioridad/snooze/resolver.
  - Typing y borrador tras recargar.
  - Timeline con nota, tarea, cambio de etapa y actividad del worker.
  - Reportes con drilldown y calendario de citas.
  - Importación CSV con deduplicación.
  - CSAT: página pública + guardado de respuesta.
  - Macros: crear, aplicar y verificar estado/prioridad.
  - Atributos de conversación: definición SELECT + valor guardado en el chat.
- Datos de prueba y usuarios temporales de dev limpiados.

---

## 11. Mapa rápido de archivos

| Área | Archivos clave |
|---|---|
| Bandeja | `app/components/whatsapp/chat-workspace.tsx`, `chat-list-panel.tsx`, `chat-conversation-header.tsx`, `chat-filters-panel.tsx`, `chat-views-menu.tsx`, `chat-claim-banner.tsx` |
| Snooze/prioridad | `app/api/whatsapp/chats/[chatId]/{snooze,priority}/route.ts`, `chat-priority-picker.tsx`, `chat-snooze-controls.tsx` |
| Bulk | `app/api/whatsapp/chats/bulk/route.ts` |
| Typing/drafts | `lib/typing.ts`, `app/api/whatsapp/chats/[chatId]/typing/route.ts` |
| Filtros compartidos | `lib/chats/query.ts`, `lib/channel-chats.ts` |
| Timeline | `lib/contacts/activity.ts`, `app/api/whatsapp/contacts/[id]/activities/route.ts`, `contact-timeline.tsx` |
| Reportes | `lib/estadisticas/reports.ts`, `app/(dashboard)/estadisticas/reportes/*` |
| Command palette | `app/components/ui/command-palette.tsx` |
| CSV | `app/api/whatsapp/contacts/import/route.ts`, `contact-import-modal.tsx` |
| CSAT | `lib/csat/send-survey.ts`, `app/csat/[token]/*`, `app/api/csat/[token]/route.ts` |
| Macros | `lib/macros/*`, `app/api/whatsapp/macros/*`, `app/(dashboard)/configuracion/macros/*`, `macro-picker-modal.tsx` |
| Atributos | `app/api/whatsapp/chat-custom-fields/*`, `app/api/whatsapp/chats/[chatId]/custom-fields/route.ts`, `chat-custom-fields.tsx`, `_atributos-conversacion*` |
| Citas | `app/(dashboard)/whatsapp/citas/_view.tsx` |

---

## 12. Cómo retomar

1. Confirmar reglas de SLA (sección 7.2).
2. Implementar SLA con migración, tick y reportes.
3. FAQ suggestions con IA.
4. Equipos y merge de duplicados al final, solo si el ICP lo pide.
5. Cuando el usuario lo autorice: `git push origin feat/inbox-operativa`, abrir PR, revisar migraciones y desplegar.

**Recordatorio:** `origin/feat/inbox-operativa` sigue en `de4ad4a`; los 7 commits siguientes y este documento están en local. `main`/producción siguen en `9a99cdd`.
