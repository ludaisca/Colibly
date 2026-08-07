# Roadmap competitivo — CRM conversacional (originado vs Pancake, ampliado a otros CRM)

**Fecha de creación:** 2026-08-06
**Estado:** En progreso — P0/P1/P2 cerrados. Dos pasadas de investigación regeneradas el 2026-08-06 (contra Pancake, y luego ampliada contra otros 6 CRM de paga/código abierto) produjeron 6 candidatos P3, pendientes de priorización con el usuario — nada de P3 está construido todavía.
**Cómo se generó:** empezó como investigación competitiva contra Pancake (CRM de social commerce) en una sesión anterior de Claude Code. **Ese análisis original no se persistió como documento** — solo sobrevivió fragmentado en 3 mensajes de commit y en un par de notas dentro de `AGENTS.md`. La sección "Cerrado" reconstruye lo que se pudo recuperar de esas fuentes. Como ese análisis original no era recuperable en su totalidad, se optó por **regenerar la investigación desde cero** (ver "Investigación regenerada") y luego, a pedido explícito del usuario, **ampliarla más allá de Pancake** contra un panorama más amplio de CRM de paga y código abierto (ver "Panorama ampliado") — para no basar el roadmap en un solo competidor.

## Alcance decidido

Mantenerse dentro de **CRM conversacional** — explícitamente **fuera de alcance**: POS, inventario, marketplaces. (Decisión registrada en el commit `4c66ce8`, sin más detalle sobre qué otras categorías se evaluaron y descartaron.)

## Cerrado

### P0 — Bug de recuperación/calificación de leads por canal
Commit `86f9da9` (2026-08-05).

- `lib/workers/lead-recovery-worker.ts` despachaba el envío de reactivación asumiendo siempre Telegram; una cuenta de Messenger/Instagram (credenciales sin `botToken`) fallaba en silencio y la recuperación nunca ocurría para esos dos canales.
- Fix: despacho por `channel` real de la `ChannelAccount` + nuevo `lib/meta-messaging/lead-recovery.ts:sendMetaChannelRecoveryMessage()`.
- De paso, `lib/workers/lead-scoring-worker.ts` se corrigió para filtrar explícitamente `channel: "TELEGRAM"` antes de calificar `Conversation` (antes calificaba conversaciones de Messenger/Instagram que la API ya bloquea manualmente con 400 — inconsistencia entre el tick programado y la UI).

### P1 — Citas / Appointments
Commit `4c66ce8` (2026-08-05). Ver `AGENTS.md` → sección "Appointments/Citas" para el detalle de schema/API/UI.

- Gap identificado: Pancake y competidores similares venden hacia verticales de servicio (spas, clínicas, escuelas) con agenda de citas vía call center manual; SundayCRM no tenía ningún concepto de cita.
- Implementado: modelo `WAAppointment` (colgado de `Contact`, no de `WAChat`/`Conversation`), API `/api/whatsapp/appointments`, recordatorios vía cola `appointment-reminders`, UI en `/whatsapp/citas` + sección en `ContactDrawer`.
- **Fase 2 deliberadamente diferida, no construida todavía**: el bot de IA proponiendo una cita durante la conversación (`source: AI_BOT`, ya existe en el enum pero no hay generador). Motivo documentado: ninguna otra feature justificaba aún construir infraestructura de tool-calling estructurado (los providers OpenRouter/Google la implementan distinto); el plan recomendado era un marcador estructurado en la respuesta del modelo, no function-calling real.

### P2 — Campos personalizados
Mismo commit `4c66ce8`. Ver `AGENTS.md` → sección "Custom fields".

- Gap identificado: mismo motivo que Citas (verticales de servicio necesitan campos ad-hoc por negocio: "Talla preferida", "Fecha de nacimiento", etc.) que el schema fijo de `Contact` no cubre.
- Implementado: `ContactCustomFieldDefinition` + `ContactCustomFieldValue`, normalizado (no `Json` blob), mismo patrón dual `waAccountId`/`channelAccountId` que `CannedResponse`. UI en `/configuracion` + `ContactDrawer`.
- Sin pendientes anotados en el commit para este ítem puntual.

## Qué falta (conocido)

1. **Citas — Fase 2**: bot de IA propone citas en la conversación (`WAAppointment.source: AI_BOT`). Requiere diseñar el marcador estructurado en la respuesta del modelo (no tool-calling nativo) y el parseo/confirmación en `bot-worker.ts`.
2. **6 candidatos P3** (P3-a a P3-f, ver sección siguiente) — 3 de la investigación original contra Pancake, 3 nuevos de la investigación ampliada contra otros 6 CRM. Priorizar/aprobar con el usuario antes de construir cualquiera; ninguno está construido todavía.

## Investigación regenerada (2026-08-06)

El análisis original no era recuperable (ver historial arriba), así que se volvió a correr desde cero contra Pancake vía búsqueda web (WebSearch/WebFetch), cruzando cada feature encontrada contra el inventario actual de SundayCRM documentado en `AGENTS.md`. Fuentes consultadas: [pancake.vn](https://pancake.vn/), [pancake.biz](https://pancake.biz/), [docs.pancake.biz](https://docs.pancake.biz), [Pancake CRM (GitBook)](https://pancake-crm.gitbook.io/pancake-crm_en/ii.-pancake), [Zaapi vs Pancake.biz (comparativa de terceros)](https://www.zaapi.com/compare/pancake), [Botcake — el builder de automatización/chatbot del ecosistema Pancake](https://botcake.io/features/chat-automation).

Hallazgo estructural relevante: **Pancake no es un solo producto sino un ecosistema modular** — el "core" de chat/inbox se complementa con apps separadas: **Pancake POS** (ventas/inventario, ya excluido de nuestro alcance), **Botcake** (chatbot/automatización), **Pancake CRM** (datos de cliente), **Pancake Work** (colaboración/tareas de equipo), **Webcake Landing/Storefront** (landing pages), **Fintab** (contabilidad). Esto ayuda a delimitar mejor qué comparar: la comparación relevante para SundayCRM es contra el **core de chat + Botcake + Pancake CRM**, no contra el ecosistema completo.

## Panorama ampliado: otros CRM investigados (2026-08-06)

A pedido del usuario, se ampliaron las fuentes más allá de Pancake — buscando CRM de paga y de código abierto para entender **cómo funcionan, qué features priorizan y qué enfoque de negocio siguen**, no solo qué botones tienen. 6 plataformas adicionales:

| Plataforma | Tipo | Enfoque de negocio | Rasgo distintivo relevante para este roadmap |
|---|---|---|---|
| [Chatwoot](https://www.chatwoot.com/) | Código abierto (self-host gratis o cloud de paga) | Soporte/helpdesk omnicanal — alternativa abierta a Zendesk/Intercom, arquitectura Rails+Vue+Postgres+Redis (muy parecida a la nuestra en espíritu) | **Copilot** (IA sugiere respuesta, el agente humano aprueba/edita/envía — no autónomo), **widget de chat en vivo embebible en sitio web**, **Help Center público** con búsqueda IA |
| [Kommo (ex amoCRM)](https://www.kommo.com/) | Paga, SaaS | CRM de ventas para pymes, WhatsApp/Instagram/Telegram en una "tarjeta de lead" ligada al pipeline | Cobra por asiento **y** por "leads activos" (tope 2500/5000/10000 por plan) + add-ons de WhatsApp API/telefonía — modelo de precios agresivo con costos ocultos, contraste útil de posicionamiento |
| [respond.io](https://respond.io/) | Paga, SaaS | Automatización omnicanal para equipos B2C mid-market — "conversaciones que importan a los ingresos" | **Flow Builder visual con ramas condicionales** + **enrutamiento por atributo/score** (ej. VIP por lead score → asignación prioritaria a ejecutivo senior, saltándose el bot), soporta múltiples agentes simultáneos en un mismo número |
| [Wati](https://www.wati.io/) | Paga, SaaS | WhatsApp-commerce first — capa fina de CRM sobre la WhatsApp Business API | Catálogo de producto + recuperación de carrito abandonado nativos (cruza a comercio/inventario, fuera de nuestro alcance) |
| [Take Blip](https://www.blip.ai/) | Paga, enterprise (Brasil) | Plataforma de "inteligencia conversacional" para banca/retail/salud — venta consultiva de alto ticket, precio a cotización | Builder visual de bots ("Blip Builder"), stack de cumplimiento LGPD nativo, integraciones de pago PIX/Boleto (fuera de alcance) — referencia de qué exige el mercado brasileño si algún día se expande ahí |
| [Erxes](https://erxes.io/) | Código abierto ("fair-code"), arquitectura de plugins | Suite de growth marketing + CRM + soporte, todo-en-uno extensible | Formularios/pop-ups de captura de leads embebibles en sitio web, lead scoring nativo, arquitectura de plugins para extender sin fork |
| [HubSpot](https://www.hubspot.com/) | Paga, SaaS freemium | CRM generalista de ventas/marketing — no es un competidor directo de nicho, pero es la referencia de la industria en automatización | **Workflows** (branching, enrutamiento round-robin o por territorio/tamaño de empresa) vs. **Sequences** (outreach lineal por representante) — confirma que "automatización visual + enrutamiento inteligente" es un patrón de industria, no una idiosincrasia de Pancake/Botcake |

### Enfoques de negocio observados (síntesis)

Cinco arquetipos claros entre los investigados:
1. **WhatsApp-commerce first** (Wati, y el propio Pancake): CRM delgado, comercio (catálogo/carrito) grueso. Fuera del alcance que ya decidimos.
2. **Automatización/enrutamiento omnicanal para mid-market B2C** (respond.io, Kommo): pipeline + bots + reglas de enrutamiento como producto central; precio por asiento con topes de leads y add-ons.
3. **Conversational intelligence enterprise/regional** (Take Blip): venta consultiva, cumplimiento y medios de pago locales como diferenciador, precio a cotización.
4. **Helpdesk omnicanal de código abierto** (Chatwoot, Erxes): self-host o cloud, soporte-first (no ventas-first), arquitectura extensible, modelo open-core.
5. **CRM generalista freemium** (HubSpot): land-and-expand, automatización avanzada como upsell premium.

SundayCRM hoy es un híbrido entre el arquetipo 2 (pipeline + lead scoring + bots) y el 4 (self-hosted, sin tope de leads ni cobro por asiento por diseño de despliegue) — pero le faltan las piezas que en los arquetipos 2 y 4 son el producto central: el builder de automatización/enrutamiento de (2) y el widget de sitio web + copiloto de (4). Esto no es solo una lista de features sueltas — es una brecha de posicionamiento entre "lo que ya somos" y "lo que el mercado espera de cualquiera de esos dos arquetipos".

> **Corrección (2026-08-06, mismo día):** el usuario confirmó que SundayCRM **pasará de self-hosted a producto de pago**. El párrafo anterior trataba "sin tope de leads ni cobro por asiento" como ventaja estructural permanente — ya no aplica igual: los modelos de precios de Kommo (asiento + tope de leads), HubSpot (freemium) y Take Blip (cotización enterprise) vuelven a ser referencia directa de pricing a futuro, no solo curiosidad competitiva. No cambia los candidatos P3 en sí, pero sí es una señal a tener en cuenta antes de diseñar cualquiera que asuma implícitamente una instancia single-tenant (sobre todo P3-a y P3-d). Ver seguimiento en `docs/PLAN_ROADMAP.md`.

## Candidatos P3

### P3-a — Automatización multi-paso disparada por evento/tag (secuencias tipo drip)
- **Gap identificado**: patrón confirmado en **5 de 7** plataformas investigadas — Botcake/Pancake, Kommo, respond.io, Take Blip y HubSpot todas ofrecen un builder visual sin código de flujos multi-paso (trigger → espera → condicional → envío). No es una idiosincrasia de un solo competidor. Fuentes: [Botcake – Chat Automation](https://botcake.io/features/chat-automation), [respond.io – Chat Routing Workflows](https://respond.io/blog/chat-routing-contact-routing-workflows-module-respondio), [HubSpot Workflows](https://www.hubspot.com/products/workflow-automation).
- **Estado actual en SundayCRM**: no existe un builder de automatización genérico. Lo más cercano es `lib/whatsapp/lead-recovery.ts` (cadencia fija de máx. 2 intentos, horas fijas por config global, un solo propósito: reactivar leads silenciosos) y el bot reactivo de IA (responde, no inicia secuencias por evento/tag). El grupo de nav "Automatización" (`dashboard-shell.tsx`) hoy solo contiene Bots IA + Calificadores — no hay ítem de flujos.
- **Pendiente**: diseñar un builder de secuencias (trigger: tag agregado / `leadStatus` cambia / cita completada / etc. → pasos con espera + envío + condición). Alcance de diseño no trivial — antes de construir, decidir si conviene una versión mínima (secuencia lineal, sin ramas condicionales) en vez de replicar el builder visual completo de Botcake/respond.io.

### P3-b — Segmentación de campañas por tag/segmento
- **Gap identificado**: Pancake CRM permite dirigir broadcasts a segmentos de clientes generados por tags de comportamiento ("Interesado en zapatos", "Cliente VIP"). Fuente: [Botcake – Chat Automation](https://botcake.io/features/chat-automation).
- **Estado actual en SundayCRM**: `WACampaign` construye la lista de destinatarios manualmente o vía import CSV (`lib/whatsapp/parse-csv.ts`) — no hay selección de audiencia por `Tag`/`ChatTag` existente, aunque el catálogo de tags ya existe y se usa en Contactos/Pipeline/Chats.
- **Pendiente**: agregar un modo de selección de audiencia "por tag" en `campanas/nueva`, reutilizando el catálogo de `Tag` ya existente — probablemente el candidato P3 de menor esfuerzo relativo, ya que la pieza que falta es solo el paso de selección de audiencia, no el motor de envío.

### P3-c — Captura de comentarios de publicación/livestream → conversación
- **Gap identificado**: la propuesta de valor central de Pancake es convertir comentarios de posts/livestreams de Facebook/Instagram en conversaciones de inbox gestionables ("comment-to-inbox"). Fuente: [Pancake Docs – Comment Inbox Management](https://docs.pancake.biz/v/english/comment-inbox-management), [pancake.vn](https://pancake.vn/).
- **Estado actual en SundayCRM**: el webhook de Meta (`/api/meta/webhook/messaging`) solo procesa mensajes directos (Messenger/Instagram DM) — no hay suscripción/manejo del campo de comentarios de Meta (`feed`/comments), que es un tipo de evento distinto al de mensajería.
- **Zona gris**: la parte de "capturar el comentario como hilo de conversación" es CRM conversacional puro (dentro de alcance). La parte de "convertir automáticamente en pedido" que Pancake también ofrece cruza a territorio de pedidos/POS (fuera de alcance ya decidido).
- **Decisión (2026-08-06)**: confirmado con el usuario — **solo la mitad conversacional**. "Convertir en pedido" queda explícitamente descartado, no solo pospuesto.
- **Implementado (2026-08-06)**: Facebook Page únicamente (Instagram queda para una iteración futura). Detalle técnico en AGENTS.md → "Canal genérico" → "Comment-to-inbox"; registro de verificación en `docs/PLAN_ROADMAP.md`.

### P3-d — Enrutamiento inteligente por atributo/score, no solo por carga
- **Gap identificado**: respond.io enruta automáticamente por VIP/score/atributo (país, fuente del lead, plan) antes o en vez de pasar por el bot, saltando directo a un ejecutivo senior en casos de alto valor. HubSpot hace lo mismo por territorio/tamaño de empresa. Fuente: [respond.io – Chat Routing Workflows](https://respond.io/blog/chat-routing-contact-routing-workflows-module-respondio), [HubSpot Workflows](https://www.hubspot.com/products/workflow-automation).
- **Estado actual en SundayCRM**: `lib/whatsapp/auto-assign.ts:autoAssignChat()` solo balancea por **carga** (candidato elegible con menos chats `OPEN`/`PENDING`, respetando `maxOpenChats`) — no considera `WALeadScore`, `Contact.leadOrigin`/tags, ni ninguna regla de "si es VIP, asignar a X". Ya tenemos las piezas de datos (`WALeadScore`, tags, `leadOrigin`) pero no la lógica de enrutamiento condicional sobre ellas.
- **Pendiente**: depende del diseño de P3-a si se resuelve como una regla más dentro del mismo builder de automatización, o como una extensión puntual de `autoAssignChat()` con una lista de reglas simples (if-this-then-assign-that) sin necesidad de un builder visual completo. Priorizar esta segunda opción si P3-a se posterga — es de mucho menor alcance.

### P3-e — Modo copiloto de IA para agentes humanos (sugerencia, no autonomía)
- **Gap identificado**: Chatwoot Copilot sugiere una respuesta redactada por IA que el agente humano revisa/edita/envía — distinto del bot 100% autónomo. Fuente: página principal de [Chatwoot](https://www.chatwoot.com/).
- **Estado actual en SundayCRM**: el único modo de IA en un chat es el `WABot` autónomo (responde solo, sin pasar por un humano) — no hay un modo intermedio donde la IA redacte un borrador y un agente humano decida si lo envía tal cual, lo edita o lo descarta desde la UI del chat.
- **Pendiente**: útil sobre todo para cuentas sin bot activo pero con volumen alto — daría valor de IA sin el riesgo de reputación de un bot 100% autónomo. Diseño: un botón "Sugerir respuesta" en el compositor del chat que llame al mismo pipeline de `bot-worker.ts` pero inserte el resultado como texto editable en el input en vez de enviarlo.

### P3-f — Widget de chat en vivo para sitio web (nuevo canal)
- **Gap identificado**: Chatwoot y Erxes ofrecen un widget de chat embebible en cualquier sitio web como canal de entrada adicional (con formularios/pop-ups de captura de leads en el caso de Erxes). Fuente: [Chatwoot](https://www.chatwoot.com/), búsqueda sobre Erxes.
- **Estado actual en SundayCRM**: los canales soportados son exclusivamente de mensajería social (WhatsApp/Telegram/Messenger/Instagram) — no hay ningún canal "sitio web propio". Esto es una diferencia estructural, no solo de features: añadirlo implicaría un quinto adapter de canal (¿`ChannelAccount` con `channel: WEBCHAT`? necesitaría script embebible + API pública sin auth de usuario final, un modelo de seguridad distinto al resto).
- **Zona gris**: es el candidato de mayor esfuerzo de los seis y el que más se aleja del posicionamiento "mensajería social" actual del producto.
- **Decisión (2026-08-06)**: confirmado con el usuario — **sí encaja** en la visión del producto.
- **Implementado (2026-08-06)**: MVP solo texto (sin medios/botones/lead scoring/copiloto de IA). Detalle técnico en AGENTS.md → "Canal genérico" → "Live chat widget"; registro de verificación en `docs/PLAN_ROADMAP.md`.

### Fuera de alcance / zona gris — no agregado a la lista, requieren confirmación explícita si se quieren reconsiderar
- **Canal Zalo**: Pancake soporta Zalo (dominante en Vietnam) además de Meta/WhatsApp/TikTok/Shopee/Lazada. No hay evidencia de que el mercado objetivo de SundayCRM (LATAM, foco en Meta Ads) necesite Zalo — no se agrega sin que el usuario confirme el mercado.
- **Pancake Work (tareas/colaboración de equipo, SLA)**: se acerca a gestión de proyectos genérica más que a CRM conversacional; SundayCRM ya cubre una porción (`agentPerformance` en Estadísticas) pero no task management. Zona gris — preguntar antes de tratarlo como gap.
- **Webcake Landing/Storefront (landing pages)** y **Fintab (contabilidad)**: claramente fuera de "CRM conversacional" tal como está definido el alcance; no se listan como candidatos.
- **IA que "finaliza ventas 24/7"**: la parte conversacional (bot respondiendo y vendiendo) ya está cubierta por `WABot`; la parte de "finalizar" (checkout/pago) cae en POS, ya excluido.
- **Shopee/Lazada/TikTok Shop**, **catálogo/carrito abandonado (Wati)**, **pagos PIX/Boleto (Take Blip)**: comercio/pagos/marketplaces, ya excluidos por decisión de alcance previa.
- **Cumplimiento LGPD-nativo y medios de pago regionales (Take Blip)**: solo sería relevante si SundayCRM se expande a Brasil específicamente — no hay evidencia de eso hoy.
- **Telefonía/llamadas de voz (Kommo las integra en el mismo inbox)**: fuera de "CRM conversacional" tal como está usado en este repo (mensajería de texto/media, no voz) — no se agrega sin confirmación de que el producto quiere sumar voz.
- **Help Center / base de conocimiento pública (Chatwoot)**: distinto del RAG interno que ya tenemos (que solo alimenta al bot, no es un portal público de autoservicio). Zona gris — self-service de soporte, no necesariamente "CRM conversacional de ventas". Preguntar antes de sumarlo.

## Cómo continuar desde otro equipo

1. Leer este documento + las secciones referenciadas en `AGENTS.md` ("Appointments/Citas", "Custom fields").
2. Si se retoma Citas Fase 2: empezar por el diseño del marcador estructurado, no por el código — es una decisión de contrato entre el prompt del bot y el parser, y afecta a los dos providers de IA por igual.
3. Si se retoman los candidatos P3, orden sugerido por esfuerzo/riesgo creciente: **P3-b** (segmentación de campañas por tag, reutiliza el catálogo `Tag` existente) → **P3-d** (reglas simples de enrutamiento por atributo/score, extensión acotada de `autoAssignChat()`) → **P3-e** (copiloto de IA, reutiliza el pipeline de `bot-worker.ts` en modo sugerencia) → **P3-a** (builder de automatización completo, el de mayor diseño previo) → **P3-c** y **P3-f** (ambos requieren primero resolver una zona gris de alcance con el usuario antes de diseñar nada). No empezar a construir ninguno sin confirmación explícita.
4. Si aparecen más gaps en el futuro: seguir el mismo formato "gap identificado → estado actual → fuente" y clasificar explícitamente cualquier hallazgo de zona gris en vez de omitirlo o colarlo silenciosamente como si ya estuviera aprobado. Preferir seguir ampliando **este mismo archivo** en vez de fragmentar en documentos nuevos — la fragmentación entre commits y `AGENTS.md` fue justamente lo que obligó a regenerar la investigación dos veces.
