# Rendimiento: diagnóstico y plan (2026-11-04)

Objetivo: que Colibly se sienta rápido con bandejas grandes y muchos agentes conectados, tomando como referencia cómo resuelven lo mismo Chatwoot (bandeja) y Twenty (CRM). Restricción vigente: **no hay websockets**, todo lo "en vivo" es polling (AGENTS.md).

## Cómo se midió

- **Volumen sembrado** en la organización QA (`qa-bandeja-…`, cuenta web "QA web"): 8 000 conversaciones y 320 000 mensajes, con ids `perf-c-*` / `perf-m-*`. Para borrarlo: `DELETE FROM conversations WHERE id LIKE 'perf-c-%';` (los mensajes caen en cascada).
- **Build de producción** (`docker build --target runner`) contra una copia de la base (`colibly_perf`), sin workers (`COLIBLY_BUILD=1`), en el puerto de preview `127.0.0.1:1901`. Así los tiempos no los distorsiona Turbopack.
- **Navegador real** (Playwright): carga de cada página y peticiones durante 60 s con la bandeja abierta, un chat seleccionado y sin tocar nada.

## Lo que encontramos

1. **La base no es el cuello de botella hoy.** Con 8 000 chats, la lista, los contadores y los mensajes responden en 25–50 ms. La consulta de la lista hace `Seq Scan` + top-N sort (2,7 ms): `ORDER BY "lastMessageAt" DESC NULLS LAST` no coincide con el índice `(accountId, lastMessageAt)` (ASC). Es lineal, así que hay que corregirlo antes de las 100 000 conversaciones por cuenta, pero no es urgente.
2. **El costo está en el polling, multiplicado por agente y por pestaña.** Con la bandeja abierta y sin actividad, una pestaña hacía **~85 peticiones por minuto**:
   - **Dock de llamadas**: `GET /api/whatsapp/calls` cada 2 s en **todas** las páginas, aunque ninguna cuenta tuviera la Calling API. Cada petición: sesión, `getUserAccountIds()`, un `UPDATE` de llamadas caducadas y un `SELECT`. Eran 30 peticiones/min y unas 120 consultas/min por pestaña.
   - **Lista de chats**: 5 endpoints (uno por canal) cada 15 s, cada uno con `findMany` + `count`, aunque el usuario solo tuviera cuentas en un canal.
   - **Mensajes del chat abierto**: los últimos 50 completos cada 5 s, unos **260 KB/min**. Además, cada poll hacía un `UPDATE … unreadCount = 0` (y renovaba `updated_at`) aunque no hubiera no leídos.
   - **"Está escribiendo"**: otra petición cada 5 s.
3. Carga de páginas en producción (con caché del navegador): 1,0–1,3 s hasta `networkidle`, con TTFB de 80–170 ms y 9–19 llamadas a la API al montar. El shell repite en cada página `push`, `disponibilidad`, `notifications` y `calls`.

## Lo que ya se corrigió (en `main`, sin commit)

| Cambio | Archivos | Efecto medido |
|---|---|---|
| El dock de llamadas solo sondea si alguna cuenta de la organización tiene `callingEnabled`. Con la pestaña oculta, cada 10 s en lugar de cada 2 s (el push cubre el timbre). Durante una llamada no cambia nada. | `app/(dashboard)/layout.tsx`, `dashboard-shell.tsx`, `components/whatsapp/call-dock.tsx` | de 29 a 0 peticiones/min en organizaciones sin llamadas |
| La bandeja no pide la lista de canales donde el usuario no tiene cuentas. | `components/whatsapp/chat-workspace.tsx` | de 5 a N endpoints por refresco (N = canales con cuentas) |
| Al leer mensajes, el contador de no leídos solo se pone en cero si había no leídos (`updateMany … unreadCount > 0`). | `api/whatsapp/chats/[chatId]/messages/route.ts` | de 12 escrituras/min a 0 por chat abierto |
| ETag + `Cache-Control: private, no-cache` en los endpoints sondeados (mensajes, listas de los 5 canales, contadores, notificaciones). Si nada cambió, la respuesta es 304 sin cuerpo. | `lib/http/etag.ts` + esas rutas | de 360 a 49 KB/min con la bandeja quieta (mensajes: de 261 a 18 KB) |

En conjunto, una pestaña de bandeja inactiva pasó de ~85 a ~32 peticiones/min y de ~360 a ~49 KB/min.

### R1 hecho: sincronización única de la bandeja (`GET /api/inbox/sync`)

- **Qué devuelve** en una respuesta: `chats` (delta), `total` (solo si algo cambió de verdad), `thread` (últimos 50 mensajes y quién escribe en el chat abierto) y `counts` (contadores de vistas, cuando el cliente pide `counts=1`, cada 6.º tick ≈ 30 s).
- **Parámetros**: los filtros de la lista (`lib/chats/query.ts`) más `since` (el `updatedAt` más reciente que el cliente ya tiene), `floor` (el `lastMessageAt` de su chat más antiguo cargado) y `thread` (el id del chat abierto; no `chatId`, que en la lista es un filtro).
- **Delta**: chats con `updatedAt > since − 3 s` y `lastMessageAt ≥ floor`. El solape cubre escrituras que se confirman tarde; el cliente fusiona por id. El piso evita meter chats que se modificaron más abajo de lo cargado (descuadraría "Cargar más", que pagina por canal). Un chat con mensaje nuevo sube arriba y siempre entra.
- **Estable cuando nada cambia**: el cursor lo calcula el cliente con sus propios chats, así que dos ticks sin cambios producen la misma respuesta y el ETag da 304.
- **Consultas por tick**: sesión, alcance, un `findMany` sobre `wa_chats` y otro sobre `conversations` (todos los canales genéricos juntos), y los mensajes y el "está escribiendo" del chat abierto. Los `count` solo corren si hubo cambios, y los contadores de vistas cada 30 s.
- **Cliente** (`chat-workspace.tsx`): un efecto cada 5 s (`INBOX_SYNC_MS`). No consulta con la pestaña oculta y sincroniza de inmediato al volver. No solapa peticiones (`inFlight`) y descarta la respuesta si cambiaron los filtros (`chatsGenerationRef`). Sustituye los sondeos de la lista (uno por canal, 15 s), los mensajes (5 s), el "está escribiendo" (5 s) y los contadores del menú de vistas (30 s).
- **Código compartido**: `lib/chats/messages.ts` (carga de mensajes y marcar como leído, usado también por `GET …/messages`), `lib/chats/counts.ts` (contadores, también en `GET /api/whatsapp/chats/counts`) y `lib/typing.ts:getTypingUsers()`.
- **Medido** (dev, bandeja con un chat abierto y quieta durante 60 s): **15 peticiones/min** (12 de sync y 3 de la campana). Antes de R1 eran 32 y al principio ~85. Prueba funcional: un mensaje entrante aparece en el hilo en ~3 s y un chat que estaba en el puesto 500 sube a la lista en ~5 s, sin errores de consola.

## Cómo lo resuelven Chatwoot y Twenty, y qué tomamos

| Patrón | Chatwoot / Twenty | Propuesta para Colibly (con polling) |
|---|---|---|
| **Un solo canal de actualizaciones** | Chatwoot: un solo websocket (ActionCable `RoomChannel`) por agente que empuja `message.created`, `conversation.updated`, `typing_on`… Twenty: suscripciones GraphQL. | **R1. Endpoint único de sincronización** `GET /api/inbox/sync?since=<cursor>`. Una petición cada 5–15 s que devuelve solo lo que cambió: chats modificados de todos los canales, mensajes nuevos o con estado nuevo del chat abierto, quién está escribiendo, contadores de vistas y no leídos de la campana. Reemplaza 5 + 2 + 1 + 1 sondeos. |
| **Deltas en lugar de páginas completas** | Chatwoot pide mensajes con `after`/`before` sobre el id y lista conversaciones con `updated_within`. | **R2. Cursores incrementales.** Mensajes con `after=<timestamp,id>`. Los cambios de estado de mensajes ya cargados necesitan una columna `updatedAt` en `WAMessage`/`ChannelMessage`, o una tabla de eventos breve en Redis. Lista de chats con `updatedSince=<updatedAt>`. |
| **Contadores precalculados** | Chatwoot cachea los conteos de la bandeja (`conversations/meta`) y los invalida por evento. | **R3. `count` solo en la primera página.** En el poll se reutiliza el total, o se lee de Redis (`inbox:counts:<orgId>`), que las ingestas y los cambios de estado invalidan. |
| **Polling adaptativo** | Chatwoot baja el ritmo con la pestaña inactiva y reconecta al volver. | **R4. Un hook `usePoll()` compartido** con pausa en pestaña oculta, *backoff* tras inactividad (5 s → 15 s → 60 s) y refresco inmediato al volver el foco. Lo usarían la bandeja, la campana, los contadores, el modo bot y los reportes en vivo (hoy cada uno tiene su `setInterval`). |
| **Caché de sesión y alcance** | Twenty cachea los metadatos del workspace por request y en Redis; Chatwoot memoiza `Current.account`/`inboxes` por petición. | **R5. Caché corta de `getUserAccountIds()` / `getUserChannelAccountIds()`** (Redis o LRU en memoria, 30 s, invalidada al compartir, crear o borrar cuentas). Hoy se recalcula en cada petición sondeada. |
| **Índices alineados con el orden** | Chatwoot indexa `(account_id, last_activity_at)` en el sentido en que se ordena. | **R6. Índice `(accountId, lastMessageAt DESC NULLS LAST)`** en `wa_chats` y `conversations` (migración), y paginación por cursor (`lastMessageAt,id`) en lugar de `skip`. |
| **Caché normalizada y respuestas optimistas** | Twenty: caché de Apollo normalizada y escritura optimista; la UI no espera al servidor. Chatwoot: store de Vuex por conversación. | **R7. Navegación sin esperar.** Precargar los datos del chat al pasar el ratón, mantener en memoria los hilos ya abiertos (no recargar 50 mensajes al volver a un chat), y precargar con `<Link prefetch>` las secciones del nav. |
| **Shell ligero** | Ambos cargan el usuario y la configuración una vez y la reutilizan en toda la SPA. | **R8. Datos del shell en un solo fetch** (`/api/me/shell`: disponibilidad, push, contadores de la campana), o servidos por el layout RSC, en lugar de 4 peticiones al montar cada página. |

## Estado de R2–R8 (hecho el 2026-11-04)

| Punto | Qué se hizo | Archivos | Efecto |
|---|---|---|---|
| **R2** hilo por cursor | El sync pide el hilo desde el 20.º mensaje más reciente cargado (`threadSince`). Vuelven ese y los posteriores (hasta 100): los nuevos más los cambios de estado de los últimos 20, no 50 en cada tick. La lista ya iba por delta desde R1. | `lib/chats/messages.ts` (`since`), `app/api/inbox/sync/route.ts`, `chat-workspace.tsx` | menos filas y bytes por tick |
| **R3** contadores | Los 8 `count` de las vistas se guardan 20 s por usuario en Redis (`inbox:counts:<userId>`). El total de la lista ya solo se recalculaba si había cambios (R1). | `lib/chats/counts.ts:getViewCountsCached()` | varias pestañas comparten el cálculo |
| **R4** sondeo común | `usePoll()`: no solapa peticiones, no consulta con la pestaña oculta (o la espacia), sondea de inmediato al volver y espacia ×3 tras 2 min y ×6 tras 10 min sin actividad, con tope. Lo usan el sync de la bandeja (tope 30 s), la campana (latido cada 100 s con la pestaña oculta), el modo bot y el panel en vivo de reportes. | `app/components/ui/use-poll.ts` | calculado: un agente inactivo 10 min pasa de 12 a 2 syncs/min |
| **R5** alcance | `getUserAccountIds()` y `getUserChannelAccountIds()` se guardan 10 s en memoria por usuario y se invalidan (`invalidateAccountScopes()`) en cada alta, baja o compartición de cuenta. | `lib/shared-accounts.ts` + 12 sitios de mutación | 1–2 consultas menos por petición |
| **R6** índice de la lista | `(account, "lastMessageAt" DESC NULLS LAST)` en `wa_chats` y `conversations`, fuera de Prisma (que no sabe declarar `NULLS LAST`). La paginación sigue por `skip`: con el índice, saltar unas páginas solo lee esas filas del índice. | `prisma/sql/ensure-search-indexes.sql` | medido: la primera página pasa de 2,7 ms (recorrido completo y ordenación) a 0,05 ms (Index Scan) con 8 000 chats |
| **R7** navegación | La bandeja guarda en memoria los últimos 15 hilos abiertos: volver a un chat lo pinta al instante y lo refresca detrás. Las secciones del menú ya se precargan solas (`<Link>` de Next en producción). | `chat-workspace.tsx` (`threadCacheRef`) | medido: hilo visible en ~0,4 s al volver, sin spinner |
| **R8** shell | El layout trae la disponibilidad y la llave push pública. El menú de usuario ya no pide `/api/usuarios/me/disponibilidad` ni `/api/usuarios/me/push` (el layout persiste al navegar, así que el ahorro es por carga completa). | `app/(dashboard)/layout.tsx`, `user-dropdown.tsx` | 2 peticiones menos por carga |

**Resultado medido** con la bandeja abierta y quieta durante 60 s (dev): **15 peticiones/min y 45 KB/min**, frente a ~85 peticiones y ~360 KB al principio. De las 15, 11–12 son la sincronización, casi todas resueltas con 304.

Pendiente de medir: el tiempo de carga de páginas en el build `runner`. Esta ronda no toca el render del servidor ni el bundle, salvo el layout, que lee un campo más y `getPlatformSettings()` (con caché).

Ideas que quedan fuera (no hacen falta con el volumen actual): paginación de la lista por cursor, invalidar los contadores por evento en lugar de por TTL, y un `updatedAt` en los mensajes para pedir solo los cambiados. Este último requiere una migración sobre las tablas más grandes.

## Medición final en producción: antes y después (2026-11-04)

Dos builds `runner`: "antes" es `main` sin estos cambios (`a5d1d0a`) y "después" es esta rama. Cada uno corre contra su propia copia de la base (8 000 conversaciones, 321 000 mensajes; la de "antes" sin los índices nuevos), sin workers y en `127.0.0.1:1901/1902`. Para la carga se usaron 10 agentes reales, usuarios distintos de la organización QA. Script: Playwright, mediana de 5 cargas por página y de 3 aperturas de chat; carga durante 92 s con un mensaje entrante cada 10 s. Tres rondas de "antes"; las cifras de servidor coinciden entre rondas con un margen de ±5 %.

| Medida | Antes | Después |
|---|---|---|
| Abrir un chat (local) | 317 ms | **151 ms** |
| Abrir un chat (red 4G: 150 ms RTT, 10 Mbps) | 882 ms | **281 ms** |
| Volver a un chat ya abierto (4G) | 949 ms | **126 ms** |
| Lista de chats visible al entrar (4G) | 1 118 ms | 1 094 ms (igual) |
| 1 agente con la bandeja quieta: peticiones/min | 62 | **14** |
| 1 agente con la bandeja quieta: KB/min | 434 | **44** |
| 10 agentes: peticiones/min al servidor | 627 | **144** |
| 10 agentes: tráfico | 4,3 MB/min | **1,5 MB/min** |
| 10 agentes: CPU del contenedor de la app | 21,8 % | **9,8 %** |
| 10 agentes: transacciones de Postgres/min | 2 288 | **1 194** |
| 10 agentes: filas leídas por Postgres/min | 1,23 M | 1,14 M (casi igual) |
| Mensaje entrante visible para el agente (mediana) | 4,6 s | 3,1 s |
| Peticiones de la API al cargar una página | 7–16 | 3–10 |
| TTFB y `load` de páginas | 40–63 / 116–170 ms | 45–61 / 113–168 ms (igual; el ruido entre rondas es de ±30 ms) |

Lo que se encontró midiendo y se corrigió antes de la ronda final:
- **Abrir un chat navegaba.** `router.push` pedía la página al servidor y volvía a montar toda la bandeja (lista e hilo) en cada clic. Ahora usa `history.pushState` y sigue Atrás/Adelante con `popstate`. Es la mayor mejora que se nota a simple vista: con red móvil, cambiar de chat pasa de casi 1 s a 0,1–0,3 s.
- **La caché de hilos (R7) no sobrevivía** a ese remontaje. Ahora vive a nivel de módulo.
- **El layout encadenaba consultas.** Las nuevas (llamadas, llave push) se sumaban en serie; ahora todo va en paralelo.
- **El delta del sync filtraba ~1 300 chats por tick.** Se añadió `@@index([cuenta, updatedAt])` (migración `inbox_sync_updated_at_index`).

Lo que no cambió y por qué:
- **Carga de páginas:** esta ronda no tocó el render del servidor ni el bundle.
- **Filas leídas por Postgres:** las dominan los contadores de vistas, sobre ~4 700 chats activos por usuario y cada 30 s. Son baratos en tiempo (<1 ms cada consulta). **Hecho después de esta medición:** "Todos", "Míos" y "Sin asignar" salen de un solo `groupBy` por asignado (`lib/chats/counts.ts:countsFromAssigneeGroups()`, con prueba), más el `count` de "Esperando". Son 2 consultas por tabla en vez de 4. Los números coinciden con los anteriores (7/2/3 338/3 340 con los datos sembrados) y Postgres lee la mitad: 132 bloques y ~1,3 ms contra 264 y ~2,5 ms.
- **Cada sincronización tarda más que las peticiones sueltas de antes** (p50 69 ms bajo carga contra 23 ms). Por separado son 7–12 ms; bajo carga, los 10 navegadores y el servidor compartían la máquina. Aun así, el CPU total del servidor baja a menos de la mitad.

## Orden en que se hizo

R1 → R4 → R3 → R2 → R5 → R6 → R7 → R8. Cada paso se verificó con el mismo script de Playwright (peticiones y KB por minuto con la bandeja quieta, más la prueba funcional: mensaje entrante en el hilo, un chat lejano que sube y volver a un chat) y con `EXPLAIN ANALYZE` sobre el volumen sembrado.
