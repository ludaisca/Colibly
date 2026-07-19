# Fork de SundayCRM a un CRM multi-tenant y multi-canal

## Contexto

SundayCRM nació como un CRM de WhatsApp Business para un modelo de negocio concreto: una sola empresa/usuario dueño de sus cuentas de WhatsApp, con roles fijos (`admin`/`user`/`ejecutivo`) y presupuesto de IA por persona. El objetivo ahora es tomar esa base (Next.js 16 + Prisma 5 + PostgreSQL/pgvector + Redis/BullMQ, ~29 modelos, workers de IA/campañas/scoring de leads ya maduros) y evolucionarla a un **CRM mucho más robusto**: multi-empresa (varias organizaciones clientas aisladas entre sí, un mismo usuario puede pertenecer a varias) y **multi-canal desde el diseño** (hoy solo WhatsApp, pero la arquitectura debe dejar espacio para email/SMS/Instagram sin reescribir el núcleo otra vez).

Esto se hace como un **fork a un repositorio Git nuevo e independiente** (no branch, no monorepo), preservando toda la historia de commits de SundayCRM — es útil precisamente para la tarea de auditar qué reglas de negocio heredadas siguen aplicando y por qué existen.

No se ejecuta código en esta ronda: este documento es la hoja de ruta de las 3 fases. Se implementa fase por fase, cada una verificada end-to-end antes de pasar a la siguiente.

## Fase 0 — Fork mecánico

Objetivo: un repo nuevo, idéntico en comportamiento a SundayCRM, sin ningún cambio de lógica.

1. En el repo actual: `git tag fork-point-2026-07-18` sobre `main` — marcador de punto de divergencia (útil si algún fix de seguridad futuro necesita aplicarse en ambos lados vía cherry-pick).
2. Crear el repo nuevo vacío (nombre de producto aún por definir — usar un placeholder, ej. `sunday-crm`, hasta decidirlo).
3. `git clone` del repo actual al nuevo destino → `git remote remove origin` → `git remote add origin <url-nueva>` → push. Se preserva toda la historia.
4. Primer commit del repo nuevo: **solo** renombrado cosmético, sin tocar lógica:
   - `package.json`: `"name": "sunday-crm"` → nombre del nuevo producto.
   - `docker-compose.yml`/`docker-compose.override.yml`: `POSTGRES_DB: sunday_crm_db` → nuevo nombre. Los nombres de servicio (`db`, `redis`, `app`, `db-init`) ya son genéricos, no cambian.
   - `README.md`, `<title>`/metadata de `app/layout.tsx`, y cualquier string literal `"SundayCRM"` en `app/**/*.tsx` que sea branding de producto (no tocar donde el texto describe correctamente "WhatsApp" como canal).
5. **Criterio de salida de la fase**: `docker compose up --build` arranca igual, login funciona, un mensaje de WhatsApp entra y sale sin cambio de comportamiento.

No se toca en esta fase: `prisma/schema.prisma`, `lib/whatsapp/*`, `app/api/whatsapp/*`, el sistema de roles, `lib/shared-accounts.ts`.

## Fase 1 — Multi-tenancy (Organization / Membership)

La fase de mayor riesgo e impacto — se hace **antes** que la abstracción de canal porque ambas tocan las mismas tablas, y hacerlas a la vez multiplicaría el riesgo de rollback.

### Modelo de datos

`Organization` como entidad raíz de tenant. Relación usuario↔organización **muchos-a-muchos vía `Membership`** (patrón Slack/Linear: un usuario — ej. una agencia u operador multi-cuenta — puede pertenecer a varias organizaciones con un rol distinto en cada una):

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  members       Membership[]
  waAccounts    WAAccount[]
  appSettings   AppSettings?
  googleAccount GoogleAccount?
}

model Membership {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           String   // "admin" | "user" | "ejecutivo", scoped a esta org
  status         String   @default("active")
  createdAt      DateTime @default(now())
  organization Organization @relation(fields: [organizationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])
  @@unique([organizationId, userId])
}
```

- `User.role` (hoy global) deja de ser la fuente de verdad de permisos de negocio; la reemplaza `Membership.role`. Se añade un flag separado y explícitamente distinto, `User.isPlatformSuperAdmin` (soporte/ops de la plataforma, no un rol de cliente), para no repetir la confusión rol-global-vs-rol-de-negocio que tiene el modelo actual.
- `AppSettings` y `GoogleAccount` pasan de 1:1 con `User` a 1:1 con `Organization` — el presupuesto de IA y la integración de Sheets son recursos de la empresa, no de la persona que los configuró.
- `SystemConfig` (config de plataforma: pricing de modelos, `allowRegistration`) se queda igual, sin `organizationId` — no es negocio del cliente.
- `WAAccount.userId` deja de ser "dueño" y pasa a ser metadata `createdBy`; el dueño real pasa a ser `WAAccount.organizationId`.

**`organizationId` denormalizado** (no solo confiar en el join transitivo vía `WAAccount`, por costo de queries calientes en chats/mensajes y en cada job de BullMQ) en: `WAAccount`, `Contact`, `WAChat`, `WAMessage`, `WATemplate`, `CannedResponse`, `WACampaign`/`WACampaignRecipient`, `LeadSheetSource`/`LeadSheetImportedRow`, `WABot`/`WABotConversation`/`WABotKnowledge`/`WABotKnowledgeBot`/`WABotUsage`, `WALeadScorerBot`/`WALeadScorerUsage`/`WALeadScore`, `WALeadRecoveryAttempt`, `Tag`, `ContactTag`, `ChatTag`, `WANote`, `Notification`.

`WAAccountShare` **no se descarta** — cambia de propósito: hoy es el único mecanismo de tenancy improvisado; con `Organization` real pasa a ser un ACL fino **intra-organización** (qué cuenta específica ve un `ejecutivo` dentro de su propia empresa). Gana `organizationId` denormalizado para poder validar en una sola condición que no se comparte una cuenta de otra organización.

### Cambios de código (los de mayor fan-out)

- **`lib/shared-accounts.ts:getUserAccountIds(userId)`** — usado en **40 call sites** (`app/api/whatsapp/**`, `dashboard/page.tsx`, `estadisticas/page.tsx`, etc.), siempre como `getUserAccountIds(session.user.id)`. Se reescribe a algo como `getOrganizationAccountIds({ organizationId, userId, role })`:
  - `admin`/`user` de la organización → todas las `WAAccount` de `organizationId`.
  - `ejecutivo` → intersección con `WAAccountShare` (solo las cuentas explícitamente asignadas).
  - Cada uno de los 40 call sites debe pasar a resolver también el `organizationId` activo de sesión, no solo `userId`.
- **Sesión (`lib/auth.ts`, NextAuth JWT)**: el JWT/`Session.user` debe llevar el `organizationId` activo y la lista de memberships del usuario, para soportar un workspace switcher sin re-login. Cambia la forma de los callbacks `jwt`/`session`.
- **`proxy.ts`**: el rol usado para `EXECUTIVE_BLOCKED`/`USER_BLOCKED` pasa de `session.user.role` a `Membership.role` de la organización activa.
- **`dashboard-shell.tsx`**: el `NAV[]` condicional por rol usa el mismo rol scoped por organización.
- **Centralizar permisos**: hoy la lógica de roles está duplicada en 3 capas (nav hiding, prefix lists en `proxy.ts`, checks 403 por handler de API). Se introduce una función única `can(membership, action, resource)` reusada en las tres capas, en vez de mantener listas de rutas hardcodeadas paralelas a checks de API sueltos.
- **"Primer usuario admin"**: se re-escala a "primer miembro de una organización es admin de ESA organización" (`count()` de `Membership` por `organizationId`, transacción atómica igual que hoy pero scoped). Se diseña el flujo de **bootstrap**: el primer `User` que se registra en todo el sistema crea automáticamente su propia `Organization` y queda admin de ella; usuarios subsiguientes crean su propia organización (quedando admin de esa) o se unen a una existente por invitación.
- **Backfill**: script de migración que envuelve todos los datos existentes de la BD actual (efectivamente single-tenant hoy) en una `Organization` por defecto, con todos los `User` actuales como `Membership` con su `role` actual preservado.

### Criterio de salida

Login, chats, envío/recepción de WhatsApp, bots, campañas y scoring de leads funcionan igual que antes, pero todo scoped por `organizationId`; se puede crear una segunda organización de prueba y verificar que sus datos están completamente aislados de la primera.

## Fase 2 — Abstracción de canal (multi-canal)

Renombrado y extracción, **después** de que multi-tenancy esté estable.

### Patrón: tabla base + tabla de extensión 1:1 por canal

No usar una tabla única con campos nullable por canal — con 9 modelos `WA*` ya existentes, cada canal nuevo ensancharía la tabla base indefinidamente. En su lugar, tabla base genérica + extensión 1:1 (simulación de herencia, ya que Prisma no la soporta nativamente):

```prisma
model ChannelAccount {
  id             String  @id @default(cuid())
  organizationId String
  channel        Channel // enum, hoy solo WHATSAPP
  displayName    String
  status         String
  createdById    String  // metadata, no ownership
  whatsappConfig WhatsAppChannelConfig?
  conversations  Conversation[]
}

model WhatsAppChannelConfig {
  channelAccountId String @id
  channelAccount   ChannelAccount @relation(fields: [channelAccountId], references: [id])
  phoneNumberId    String
  wabaId           String
  appId            String
  accessToken      String // cifrado, AES-256-GCM (se mantiene igual)
  verifyTokenHash  String
  appSecret        String // cifrado
  qualityRating    String?
  messagingTier    String?
}
```

Renombrados: `WAAccount`→`ChannelAccount`, `WAChat`→`Conversation`, `WAMessage`→`Message`. **Usar `@@map`** para mantener el nombre físico de tabla igual (`@@map("wa_accounts")` etc.) — el riesgo del renombrado queda contenido al código de aplicación (imports/tipos/queries), sin forzar una migración física de tablas en producción en el mismo movimiento. El renombrado físico, si se quiere por prolijidad, se difiere a una migración SQL de bajo riesgo posterior.

En `Message`: lo universal (`id`, `organizationId`, `conversationId`, `contactId`, `direction`, `messageType`, `externalId` — generalización de `wamid`, concepto casi universal entre proveedores — `senderId`, timestamps) queda en la tabla base; lo específico de Meta (referencia a campaña, a `LeadSheetSource`, componentes de plantilla usados) va a una extensión `WhatsAppMessageMeta` 1:1 opcional. La ventana de servicio de 24h de Meta es estado de **conversación**, no de mensaje — vive en una extensión `WhatsAppConversationState` aparte.

### Qué se generaliza vs. qué se mantiene específico de WhatsApp

- **Campañas/plantillas** (`WACampaign`, `WATemplate`, `CannedResponse`, `LeadSheetSource`): la exigencia de plantilla pre-aprobada es requisito regulatorio de Meta, no generalizable — se mantiene tal cual. El concepto "envío masivo" en sí (`Campaign`/`CampaignRecipient` con campo `channel`) sí se generaliza, aplicando la validación de plantilla solo quando `channel === WHATSAPP`.
- **Lead recovery** (ventana 24h de Meta): se mantiene la restricción para WhatsApp pero se modela como regla de canal (extensión), no lógica genérica hardcodeada — otros canales futuros tendrán su propia política sin heredar esa limitación.
- **Humanización de respuestas** (`lib/whatsapp/humanize.ts`): el concepto (delays, no responder instantáneo) es genérico; se extrae una interfaz `ChannelAdapter.simulateTyping()` con la única implementación concreta hoy siendo `WhatsAppAdapter`.
- **Scoring de leads** (`WALeadScorerBot`/`WALeadScorerUsage`/`WALeadScore`): la lógica de análisis de conversación es agnóstica de canal, solo está anclada por FK a `chatId` hoy — se re-apunta a `Conversation` genérica.
- **`LeadSheetSource`/`LeadSheetImportedRow`** (Facebook Lead Ads → Sheets → plantilla WA): se mantiene tal cual, es integración de marketing ortogonal al canal — solo gana `organizationId`.
- **Cifrado de tokens** (AES-256-GCM, `ENCRYPTION_KEY`): mecanismo se mantiene igual, solo cambia a qué fila/organización pertenece el dato cifrado.

### Diferido explícitamente (no ejecutar todavía)

- No implementar adapters reales de Instagram/Email/SMS — solo el enum `Channel` con el único valor `WHATSAPP` hoy y la interfaz `ChannelAdapter` definida.
- No construir permisos custom granulares por organización — mantener el catálogo fijo de 3 roles por-organización.
- No renombrar físicamente tablas/columnas en la BD — usar `@@map`, diferir el renombrado físico.
- No construir extensiones `Conversation`/`Message` más allá de lo mínimo hasta que exista un segundo canal real.

## Matriz de reglas de negocio heredadas

| Regla | Veredicto | Razón |
|---|---|---|
| Single-tenant (sin `Organization`) | **ADAPTAR** | Se resuelve en Fase 1. |
| Roles fijos hardcodeados (3 valores, 3 capas de check) | **ADAPTAR** | Pasan a ser por-organización (`Membership.role`); catálogo se mantiene fijo (no RBAC granular), pero las 3 capas duplicadas se centralizan en un `can()` único. |
| Presupuesto de IA por usuario individual | **ADAPTAR** | Pasa a `AppSettings` 1:1 con `Organization` — es costo operativo de la empresa. |
| "Primer usuario admin, nunca pierde acceso" | **ADAPTAR** | Se re-escala a "primer miembro de la organización es admin de esa organización". |
| `WAAccountShare` | **ADAPTAR** (no descartar) | Pasa de mecanismo de tenancy a ACL fino intra-organización. |
| Campañas ligadas a plantillas Meta aprobadas | **MANTENER** (para WhatsApp) | Requisito regulatorio de Meta, no negociable; el concepto "envío masivo" sí se generaliza. |
| Lead recovery con ventana 24h de Meta | **MANTENER** (para WhatsApp), modelar como regla de canal | Restricción impuesta por Meta, no se relaja, pero no debe ser lógica genérica hardcodeada. |
| Humanización de respuestas de bot | **ADAPTAR** | Concepto genérico, implementación hoy específica de WhatsApp — se extrae interfaz. |
| Scoring de leads atado a `WAChat` | **ADAPTAR** | Lógica agnóstica de canal, solo el FK ata hoy a WhatsApp. |
| `LeadSheetSource`/`LeadSheetImportedRow` | **MANTENER** | Integración de marketing específica de Facebook Ads, ortogonal al canal. |
| `WAAccount` 1:1 con `User` dueño | **DESCARTAR** ese acoplamiento | Pasa a pertenecer a `Organization`; `userId` queda como metadata. |
| `SystemConfig` (config de plataforma) | **MANTENER** tal cual | No es negocio del cliente, no lleva `organizationId`. |
| `GoogleAccount` 1:1 con `User` | **ADAPTAR** a `Organization` | Recurso de la empresa, no de la persona que lo conectó. |
| Cifrado de tokens (AES-256-GCM) | **MANTENER** el mecanismo | Infraestructura transversal correcta tal cual. |
| `Contact`/`Tag`/`ContactTag`/`ChatTag`/`WANote`/`Notification` | **MANTENER** como genéricos | Solo ganan `organizationId`; ya son agnósticos de canal y rol. |

## Archivos críticos

- `prisma/schema.prisma` — todos los cambios de modelo de las Fases 1 y 2.
- `lib/shared-accounts.ts` — reescritura de `getUserAccountIds`, el cambio de mayor fan-out (40 call sites).
- `lib/auth.ts` — forma del JWT/sesión con `organizationId` + memberships.
- `proxy.ts` — permisos por rol scoped a organización.
- `app/components/dashboard-shell.tsx` — nav condicional por rol scoped a organización.
- `docker-compose.yml`, `package.json` — renombrado mecánico de Fase 0.
- `lib/whatsapp/humanize.ts`, `lib/whatsapp/lead-recovery.ts`, `lib/whatsapp/lead-scoring.ts` — puntos de extracción de interfaz `ChannelAdapter` en Fase 2.

## Verificación

- **Fase 0**: `docker compose up --build` arranca igual; login + un mensaje de WhatsApp entra/sale sin cambio de comportamiento respecto al SundayCRM original.
- **Fase 1**: crear una segunda `Organization` de prueba (vía el backfill + registro de un nuevo usuario) y verificar aislamiento total de datos entre ambas (chats, contactos, bots, presupuesto de IA) navegando la UI con dos sesiones distintas; verificar que un `ejecutivo` solo ve las cuentas de `WAAccountShare` dentro de su organización.
- **Fase 2**: verificar que el flujo de WhatsApp (webhook, envío, campañas, bots, scoring) sigue funcionando end-to-end tras el renombrado vía `@@map`, sin downtime de datos (mismas tablas físicas).
- En cada fase: `docker compose exec app npx tsc --noEmit` + `npm run lint` + `npm run build` (con `NODE_ENV=production`, ver gotcha de build en `AGENTS.md`) antes de considerar la fase cerrada.
