# Licencias por usuario: plan de implementación (2026-11-04)

Decisión del dueño del producto (2026-11-04): el precio sube por **funciones**, no por cupos de canales. Cada persona dentro de Colibly paga una **licencia** de un plan; una organización mezcla licencias de distintos planes.

## 1. El modelo

| Por licencia (una persona) | Básico $59 | Avanzado $89 | Pro $149 |
|---|---|---|---|
| Canales: WhatsApp (con Coexistencia), Instagram, Messenger, Telegram, chat web | 1 de cada uno | 1 de cada uno | 1 de cada uno |
| Bandeja compartida, CRM, pipeline, tareas, citas, respuestas rápidas | ✓ | ✓ | ✓ |
| Automatizaciones, secuencias, macros, difusiones, fuentes de leads | — | ✓ | ✓ |
| Asignación automática, encuesta de satisfacción (CSAT) | — | ✓ | ✓ |
| Asistente de IA (sugerencias, resúmenes, reescritura, transcripción) | — | ✓ | ✓ |
| Agente de IA (bot) en su canal | — | ✓ | ✓ |
| Calificación de leads, monitores de temas, recuperación de leads con IA | — | — | ✓ |
| API, webhooks, Meta Ads (conversiones), llamadas de WhatsApp | — | — | ✓ |
| Contactos (se suman en la organización) | 2,000 | 5,000 | 10,000 |
| Leads activos (se suman en la organización) | 500 | 1,500 | 3,000 |
| Créditos de IA al mes (personales, sin bolsa) | 0 | 1,000 | 2,500 |

Reglas:

1. **Todo usuario paga una licencia.** El rol (admin, usuario, ejecutivo) es independiente: un admin puede tener cualquier licencia.
2. **Cada licencia ocupa como máximo un canal de cada tipo.** La organización tiene tantos WhatsApp como licencias, y cada canal tiene un **dueño** (el usuario cuya licencia ocupa).
3. **Cada canal tiene el plan de su dueño.** Bots, difusiones, asignación automática, CSAT, calificación, recuperación, llamadas y la ejecución de automatizaciones sobre una conversación dependen de la licencia del dueño del canal de esa conversación.
4. **Lo que pide una persona depende de su licencia:** el asistente de IA, crear una automatización o una macro, aplicar una macro.
5. **Las integraciones de la organización** (API keys, webhooks, Meta Ads) las crea y las mantiene vivas **un admin con licencia Pro**. Si su licencia baja o deja de ser admin, se pausan (ya existe el patrón `pausedAt` en webhooks).
6. **Créditos de IA:** lo que pide una persona gasta los suyos; lo automático sobre un chat gasta los del **dueño del canal**; un monitor gasta los de quien lo creó. Sin créditos, solo se apaga la IA de esa persona.
7. **Configuración:** la decide el plan del canal, no el del admin. Un admin Básico puede configurar el bot del canal de un Pro; no puede activar uno en un canal Básico.

## 2. Qué cambia en el código

### Datos (`prisma/schema.prisma`)
- `User.license PlanId` (`license`) y, en la invitación (`AuthToken` tipo `INVITE`), `license`.
- Créditos por usuario: `User.aiCreditsUsed`, `aiCreditsBonus`, `aiCreditsPeriodStart`, `aiCreditsAlertLevel`. Los de `Organization` quedan sin uso y se quitan en una migración posterior.
- Canales: columna nueva `ownerId` (**dueño**, la licencia que ocupa) en `WAAccount` y `ChannelAccount`, aparte de `userId` (quien lo conectó, que sigue decidiendo los permisos de edición). Unicidad en la base: `owner_id` único en `wa_accounts` y `(owner_id, channel)` en `channel_accounts`; los NULL (sin dueño) no chocan.
- `TopicMonitor.createdById` (hoy solo tiene organización).
- `Organization.plan` se queda solo para la prueba; `seatQuantity` se reemplaza por la cantidad por plan que trae Stripe (`licensesEssential`, `licensesBusiness`, `licensesPro`), y `legacyUntil` marca a los clientes del catálogo anterior.

### Catálogo y reglas puras (`lib/billing/plans.ts`, `state.ts`)
- Un solo `Plan.features` booleano por función (los de la tabla) y `Plan.perLicense` (`contacts`, `activeLeads`, `aiCreditsPerMonth`). Se va `SeatQuota`/`includedPlus`.
- `orgLimits(licenses)`: contactos y leads = suma; `funnels` y `customFields` = los del plan más alto de la organización (son de la organización, no de un canal).
- `licenseChangeImpact()` reemplaza a `planChangeImpact()`: bloquea bajar una licencia si su dueño quedaría con algo que el plan nuevo no permite (pide confirmación y lo pausa) y avisa qué se apaga.
- Pruebas unitarias para todo lo anterior.

### Candados (`lib/billing/gates.ts` y sus llamadas)
- `licenseOf(userId)` y `channelPlan(accountRef)` con la misma caché de 15 s.
- Por persona: asistente de IA (`writing-assist`, `rewrite`, `reply-suggestion`, `transcribe`, tareas con IA), crear automatizaciones/secuencias/macros, crear campañas, crear calificadores y monitores.
- Por dueño del canal (rutas y workers): `bot-worker` ×3 y `bot-send-worker`, `campaign-worker`, `sequences`, `lead-recovery-worker`, `lead-scoring`, ejecución de automatizaciones (`dispatchInboundMessage`), auto-asignación, CSAT, llamadas.
- Por admin Pro: `authenticateApiKey` (dueño de la key), `fanout` de webhooks (dueño del endpoint), creación de webhooks por API y por pantalla, `replay`, Meta Ads CAPI.
- `reserveAiCredit(userId)` en las 13 llamadas, con el usuario según la regla 6.
- Corrige los 3 huecos encontrados en la revisión: webhooks creados por API, `replay` por API y campañas programadas tras bajar de plan.

### Cobro (`lib/billing/stripe.ts`, `seats.ts`, rutas `/api/billing/*`)
- Una suscripción por organización con hasta 3 líneas (un precio por plan, `quantity` = licencias de ese plan). Stripe lo soporta; misma factura.
- Checkout: el admin elige cuántas licencias de cada plan. Cambiar la licencia de una persona o invitar a alguien con una licencia que no hay libre actualiza la línea correspondiente con las mismas reglas de prorrateo de hoy (subir = cobra al momento; bajar = prorrateo).
- `syncSubscription()` lee las 3 líneas; `planPriceError()` valida cada precio contra `plans.ts`.
- Prueba completa en modo test de Stripe antes de producción, como en 2026-10-29.

### Pantallas
- `/usuarios` e invitaciones: licencia por persona (selector), con el costo.
- `/configuracion/plan`: licencias compradas y usadas por plan, total del mes, créditos por persona.
- Conectar un canal: elegir el dueño (personas sin un canal de ese tipo). Ficha del canal: "Dueño" y su plan, con cambio de dueño.
- Avisos en contexto: "Este número es Básico: el bot está disponible desde Avanzado".
- `/plataforma`: licencias por organización, bono de créditos por usuario.

### Textos públicos
- Landing, `/precios` (matriz nueva, "Todo lo de X, más…"), términos, `/docs/api` (API y webhooks: Pro), sitio de cPanel (`scripts/gen-cpanel-pricing.mjs`), correos de bienvenida y de prueba.
- Quitar "Más popular"; "Recomendado" en Avanzado.

## 3. Fases

| Fase | Qué | Riesgo |
|---|---|---|
| 1 | Datos y catálogo: licencia por usuario e invitación, créditos por usuario, dueño de canal, reglas puras con pruebas. Migración que deja a cada usuario con el plan actual de su organización (nadie cambia de funciones todavía) | bajo, solo dev |
| 2 | Candados por persona, por dueño de canal y por admin Pro; créditos por usuario en las 13 llamadas | medio: probar cada candado con una organización por plan |
| 3 | Stripe con varias líneas, `/configuracion/plan`, `/usuarios`, invitaciones, dueño del canal | alto: prueba completa en modo test de Stripe |
| 4 | Textos públicos, landing, `/precios`, cPanel, correos, docs | bajo |
| 5 | Migración de clientes reales y despliegue (ver §4) | alto |

**Estado:** Fase 1 y Fase 2 terminadas en dev el 2026-11-05 (sin desplegar; la Fase 2 solo puede salir junto con la 5, que primero pone `legacyUntil` a los clientes actuales). Detalle técnico en [`arquitectura/billing.md`](arquitectura/billing.md) → "Per-user licenses".

Cada fase se verifica en dev (tsc, lint, pruebas, build, recorrido real) antes de pasar a la siguiente. Producción solo al final, con confirmación.

## 4. Clientes actuales

- La migración pone a cada usuario la licencia del plan que hoy tiene su organización; la suscripción de Stripe queda válida (una sola línea con todos del mismo plan).
- Lo que **pierden** con el catálogo nuevo: Básico pierde IA y API; Avanzado pierde API; los cupos de canales pasan a 1 por licencia; contactos y créditos bajan. Antes de desplegar hay que contar en producción cuántas organizaciones pagadas están en cada caso.
- Propuesta: respetar lo que tienen hoy **60 días** (bandera `legacyUntil` en la organización) y avisarles por correo con la opción de cambiar licencias.

## 5. Decisiones (confirmadas por el dueño del producto el 2026-11-04)

1. **Prueba gratis:** 14 días, hasta 3 usuarios, todos con licencia Pro; créditos de IA de la prueba: 500 por persona (hoy son 1,000 para toda la organización).
2. **Embudos y campos personalizados:** de la organización, según su licencia más alta: Básico 1 / 10, Avanzado 5 / 50, Pro sin tope / 400.
3. **Canales que ya exceden** (p. ej. una organización con 3 WhatsApp y 1 usuario): no se desconectan; quedan sin dueño válido y la pantalla pide asignarles dueño o comprar licencias. Mientras tanto se tratan como Básico.
4. **Clientes actuales:** 60 días con lo de hoy, con aviso por correo (§4).
