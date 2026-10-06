# Auditoría del sistema y plan para convertir Colibly en un CRM completo — 2026-10-06

Decisiones del usuario que enmarcan este documento (2026-10-06):

- **Cliente meta: mixto.** Personas (B2C por chat) y empresas (B2B); la empresa es opcional.
- **Pipeline: negocios (`Deal`) separados del contacto**, con varios pipelines y etapas configurables por organización.
- **Entregable de esta sesión:** auditoría + plan. No se tocó código de la aplicación.

> Esto **cambia el alcance declarado** en `docs/ROADMAP_PANCAKE.md` ("mantenerse dentro de CRM conversacional"). Lo que no cambia es el diferenciador: el chat sigue siendo el centro de la ficha del cliente, no un módulo aparte.

## 1. Estado de partida

| Chequeo | Resultado (2026-10-06, rama `chore/probar-impeccable`) |
|---|---|
| `tsc --noEmit` | Sin errores |
| `npm test` | 25 archivos, 369 pruebas, todas en verde |
| `npm run lint` | Limpio |
| Base de dev | 105 contactos, 99 chats, 4 organizaciones — **demasiado pequeña para medir rendimiento**; lo de escala abajo es razonamiento sobre las consultas, no una medición |
| Producción | No verificada en esta sesión (sigue en el despliegue del 2026-10-02) |

Qué es hoy: una **bandeja de chats con bots, automatización y campañas**, con una capa ligera de CRM sobre el contacto.

Lo que ya hay y se conserva: `Contact` con etiquetas, notas, campos personalizados, origen de anuncio (Meta) y calificación por IA; Kanban `/ventas`; citas con recordatorios; secuencias y automatizaciones; API pública `/api/v1`, webhooks y eventos de dominio; multi-organización con aislamiento verificado (94 comprobaciones el 2026-09-25).

## 2. Hallazgos

Severidad: **A** bloquea el rumbo CRM o puede dañar datos · **M** limita al producto · **B** higiene.

### Bloques estructurales (lo que falta para ser un CRM)

| # | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| E1 | A | **No hay identidad única del cliente.** Un contacto es `(cuenta, remoteJid)`: la misma persona por WhatsApp e Instagram son dos contactos, y no existe fusión ni detección de duplicados. Un `Contact` solo puede tener **un** chat y **una** conversación (`chat WAChat?`, `conversation Conversation?`), así que fusionar sin una capa superior es imposible. | `prisma/schema.prisma` modelo `Contact`; `@@unique([accountId, remoteJid])` |
| E2 | A | **No hay negocios/oportunidades.** El "pipeline" es el enum `LeadStatus` sobre el contacto: sin monto, fecha de cierre, motivo de pérdida, varios pipelines ni etapas configurables; un cliente recurrente solo puede tener una venta. | `enum LeadStatus`; `lib/pipeline/stages.ts` |
| E3 | A | **No hay historial de etapas ni registro de actividad.** Los eventos de dominio se encolan para webhooks pero no se guardan. Sin esto no se puede calcular conversión por etapa, tiempo en etapa ni "quién cambió qué". **El dato histórico no se puede reconstruir después**, por eso conviene empezar a registrarlo antes que cualquier UI. | `lib/events/emit.ts` solo encola; no existe modelo de historial |
| E4 | M | **No hay empresas** (B2B), ni cargo, correo, dirección. `Contact` solo tiene nombre, `realName` y teléfono. | `Contact`; `contactUpdateSchema` solo acepta `name` y `leadStatus` (`lib/validations.ts:376`) |
| E5 | M | **No hay tareas.** Solo citas. Sin "llamar el martes", sin vencidos por responsable. | Único modelo de agenda: `WAAppointment` |
| E6 | M | **El contacto no tiene responsable.** La asignación vive en el chat (`WAChat.assignedToId`), no en el cliente ni en el negocio. | `Contact` sin `ownerId` |
| E7 | M | **No hay línea de tiempo unificada.** `ContactDrawer` muestra secciones sueltas (campos, próxima cita, notas). | `app/components/whatsapp/contact-drawer.tsx` (solo 2 `<h3>`) |
| E8 | M | **No hay importar/exportar contactos desde la UI**, ni acciones en lote, vistas guardadas o segmentos. El CSV existe solo dentro de campañas; la audiencia de una campaña no se arma por etiqueta/segmento (brecha ya anotada en el roadmap). | `app/(dashboard)/whatsapp/contactos/page.tsx` (solo búsqueda + 2 filtros) |
| E9 | M | **Sin reportes de ventas.** No hay embudo con conversión por etapa, pronóstico, ventas por responsable ni rendimiento por origen. La "conversión" de `/ventas` es `clientes ÷ todos los contactos` (incluye perdidos y viejos), así que engaña. | `app/(dashboard)/ventas/page.tsx` |

### Defectos y riesgos en lo que ya existe

| # | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| D1 | A | **Duplicados por normalización inconsistente del teléfono.** Solo coexistencia usa `jidCandidates()` (que reconoce `52…` vs `521…` de México). Las otras cinco rutas de alta usan el número crudo, así que el mismo móvil puede crear dos contactos según llegue por mensaje, campaña, hoja de Google o API. | `lib/whatsapp/ingest-message.ts:90`, `lib/workers/campaign-worker.ts:188`, `lib/google/lead-sheet-import.ts:197`, `app/api/v1/contacts/route.ts:98`; solo `lib/whatsapp/coexistence/normalize.ts:37` normaliza. En la base de dev hay 0 casos (datos de prueba), no es evidencia de que no ocurra en producción: **hay que medirlo en producción antes de la Fase 0**. |
| D2 | A | **Siete puntos distintos crean contactos**, cada uno con su propio `upsert` y su propia lógica de nombre/atribución. No hay un único `resolveContact()`. Cualquier cambio de identidad (E1) tendría que tocar los siete. | `grep contact.upsert/create`: ingest WhatsApp, ingest Telegram/canales, coexistencia (×2), campañas, hojas, leadgen, API v1 |
| D3 | A | **No existe forma de borrar un contacto** (ni en UI ni en API; el único `contact.delete` es el rollback de un alta de la API). Es una carencia básica de CRM y la ley mexicana de datos personales da derecho de cancelación. Verificar con el aviso de privacidad qué promete. | Sin handler `DELETE` en `app/api/whatsapp/contacts/[id]/route.ts` |
| D4 | A | **`/ventas` carga todos los contactos sin límite** (`findMany` sin `take`, con la mejor calificación de cada chat) y los reparte en columnas en memoria. Con miles de contactos degrada el servidor y el navegador. | `app/(dashboard)/ventas/page.tsx` |
| D5 | M | **Búsqueda sin índice:** `contains` insensible a mayúsculas sobre `name` y `remoteJid`. No busca por correo (no existe el campo). | `app/api/whatsapp/contacts/route.ts:54-60` |
| D6 | M | **Índices de `Contact` justos:** el listado ordena por `updatedAt desc` con un `OR` entre `accountId` y `channelAccountId`; solo existe `(accountId, leadStatus)` y los únicos. Falta `(channelAccountId, leadStatus)` y apoyo al orden. | `@@index` de `Contact` |
| D7 | M | **Visibilidad incoherente por rol:** el rol `user` ve `/ventas` completo pero la API de contactos le responde 403. Hay que decidir qué ve cada rol en el CRM (§4, decisión 2). | `proxy.ts` `USER_BLOCKED`; `app/api/whatsapp/contacts/route.ts:19` |
| D8 | M | **Cero pruebas en la lógica CRM:** no hay pruebas en `lib/contacts`, `lib/sequences.ts` ni `lib/pipeline`. Las 369 existentes cubren facturación, automatizaciones, respaldos y diseño. | listado de `*.test.ts` |
| D9 | B | **`leadStatus` está en 31 archivos** (API, UI, automatizaciones, Meta CAPI, secuencias, webhooks, exportación). Es el radio de impacto de reemplazarlo por negocios. | `grep leadStatus` |
| D10 | B | **`lib/api/openapi.ts` se escribe a mano**: cada ruta nueva de `/api/v1` exige actualizarlo en el mismo cambio (regla ya vigente). Hay que presupuestarlo en la Fase 5. | `AGENTS.md` |

### Lo que está bien y no se toca
- Aislamiento por organización y helpers (`orgWhere`, `getUserAccountIds`): los nuevos modelos solo tienen que seguirlos.
- `afterLeadStatusChanged()` ya centraliza los efectos de un cambio de etapa (CAPI, secuencias, evento): es el punto donde engancharemos el cambio de etapa del negocio.
- `scoreChatWithScorer`, `sendOutbound`, el motor de automatizaciones y la API v1 son reutilizables tal cual.

## 3. Arquitectura objetivo

### 3.1 Identidad: `Person` sobre `Contact`

`Contact` **se queda como la identidad por canal** (la fila que cuelga de una cuenta y de su chat): así los ingests, bots, chats y los 31 archivos que lo leen siguen funcionando. Encima se crea:

- **`Person`** (en la UI, "Contacto"): una por humano real. Campos: `organizationId`, nombre, correo, teléfono principal, cargo, `companyId?`, `ownerId?`, origen, ciclo de vida, `customFields`.
- `Contact.personId` (nullable al migrar → se rellena: una `Person` por cada `Contact` existente; fusionar = repuntar `personId`).
- Una `Person` puede tener varios `Contact` (WhatsApp, Instagram, web…) y por tanto varios chats en una sola ficha.

Alternativa descartada: agregar los campos a `Contact` y fusionar repuntando chats. No funciona porque `Contact → chat` es 1:1.

### 3.2 Nuevos modelos (todos con `organizationId` y `onDelete: Cascade` desde `Organization`)

| Modelo | Para qué |
|---|---|
| `Company` | Empresa: nombre, dominio, giro, tamaño, responsable, dirección. Opcional. |
| `Pipeline`, `PipelineStage` | Varios pipelines; etapas con orden, color, `kind` (`OPEN`/`WON`/`LOST`), probabilidad y **equivalente de `LeadStatus`** (para que Meta CAPI, secuencias y webhooks sigan recibiendo lo mismo). |
| `Deal` | Negocio: pipeline, etapa, persona, empresa?, título, monto, moneda, fecha de cierre esperada, estado, motivo de pérdida, responsable, origen (copiado del contacto). |
| `DealStageChange` | Historial de etapas (de→a, quién, cuándo): base de conversión, ciclo y pronóstico. |
| `Task` | Tarea: tipo, vencimiento, prioridad, responsable, ligada a persona/negocio/empresa. Reutiliza el tick de recordatorios de citas. |
| `ActivityLog` | Eventos CRM sin otro hogar (cambio de etapa, de responsable, fusión, edición). Los mensajes, notas, citas y tareas se **leen** de sus tablas al armar la línea de tiempo; no se duplican. |
| `SavedView` | Vista guardada (filtros + columnas) por usuario/organización; también alimenta segmentos para campañas. |

### 3.3 Compatibilidad con `leadStatus`
Doble escritura durante la transición: el negocio abierto principal de la persona actualiza `Contact.leadStatus` vía la etapa → equivalente. Así Meta CAPI, secuencias, automatizaciones, webhooks y `/api/v1/contacts` siguen sin cambios y se migran uno a uno. `/api/v1/contacts` se mantiene (es una API publicada; romperla afecta a integradores).

## 4. Decisiones (actualizado 2026-10-06)

| # | Tema | Decisión | Estado |
|---|---|---|---|
| 1 | Nombre en la UI | **"Contactos"** para `Person`; los canales (WhatsApp, Instagram…) se muestran dentro de la ficha | Tomada por el usuario |
| 2 | Alcance por rol | **`ejecutivo`**: directorio compartido (contactos y empresas) pero solo ve y edita los **negocios, tareas, citas y actividades asignados a él**; reasignación obligatoria al desactivarlo. **`admin` y `user`**: ven todo lo de su organización (`user` sin las pantallas de configuración que ya tiene bloqueadas) | Tomada por el usuario (lectura mía de "Ejecutivo"; corregible) |
| 3 | Límites por plan | Sin límites nuevos al inicio; se decide en la Fase 5 junto con el precio | Por defecto, sin urgencia |
| 4 | Moneda | Una por organización | Por defecto |
| 5 | `CUSTOMER` actuales | No se inventan ventas: quedan como ciclo de vida del contacto | Por defecto |
| 6 | Proyecto Áurea del colega | Solo se toma lo que sirve; **no se coordina con el colega ni se le avisa**. No se escribe nada en su carpeta | Tomada por el usuario |

## 5. Plan por fases

Cada fase es desplegable sola, con migraciones **aditivas** y respaldo previo de producción (regla del repo: `migrate deploy` no revierte una migración a medias). Cada modelo nuevo se revisa con una segunda organización (la comprobación de aislamiento que `tsc` no hace) y se suma a `lib/org-data/delete.ts` y `export.ts`.

### Fase 0 — Cimientos (sin cambios visibles) — la más urgente
1. **Medir** en producción: contactos duplicados `52`/`521`, volumen por organización.
2. **`resolveContact()` único** que use `jidCandidates()` y que adopten las 7 rutas de alta; unificar nombre/atribución first-touch. Con pruebas (hoy no hay).
3. **Fusión de duplicados existentes** (script idempotente, con vista previa) y respaldo antes.
4. **Empezar a registrar** `ActivityLog` y los cambios de `leadStatus` ya (sin UI): el historial es irrecuperable si se espera.
5. **Borrado de contacto** (UI + API) con confirmación y registro; revisar el aviso de privacidad.
6. Índices `(channelAccountId, leadStatus)` y de búsqueda (teléfono normalizado como columna; `pg_trgm` solo si el Postgres de producción permite la extensión — verificar en Coolify).
7. Corregir la métrica de conversión de `/ventas` (o quitarla hasta la Fase 4).

> **Ajustes al plan (2026-10-06, tras confirmar que producción está vacía y que habrá un rediseño de interfaz):**
> 1. **Backend y lógica primero, interfaz mínima.** Cada fase entrega modelo + comandos de negocio + API + pruebas; las pantallas actuales solo se mantienen funcionando, sin pulirlas, porque se rehacen en el rediseño.
> 2. **Sin doble escritura de `leadStatus`**: no hay datos de clientes que proteger, así que en la Fase 2 `Deal` reemplaza a `leadStatus` y se migran todos los consumidores (Meta CAPI, secuencias, automatizaciones, webhooks, API v1, exportación) en un solo paso.
> 3. **Sin script de fusión de duplicados de producción** ni medición previa: no hay datos allí. La fusión de contactos llega como función de la Fase 1 (`Person`).
> 4. `ActivityLog` y el historial de etapas se crean junto con `Person`/`Deal` (Fases 1–2), no antes: ya no hay historial irrecuperable que proteger.

#### Resultado de la Fase 0 (rama `feat/crm-fase-0`)
Hecho y verificado (tsc, lint, 359 pruebas, build de producción; pruebas contra la base de desarrollo real y por HTTP con dos organizaciones):
- **Punto único de alta de contactos** `lib/contacts/resolve.ts` (`resolveContact`, `findContact`, `resolveRemoteJid`) + lógica pura `lib/contacts/jid.ts`. Los siete puntos de alta lo usan: mensajes de WhatsApp, canales genéricos (Telegram/Meta/web), campañas, hojas de Google, Instant Forms, API v1 y coexistencia; el webhook de WhatsApp lo usa para opt-out de marketing y reacciones.
- **Equivalencia `52…`/`521…`** (México) en todas las rutas. Probado con la ingesta real: el mismo móvil por ambos formatos = 1 contacto + 1 chat; 5 altas simultáneas = 1 contacto; el nombre real no retrocede (la prueba real encontró y corrigió un fallo: un teléfono en la otra forma se tomaba por nombre real).
- **Borrado definitivo de contacto** `DELETE /api/whatsapp/contacts/[id]` (solo `admin`; `user`/`ejecutivo` → 403; otra organización → 404; límite de tasa) con `lib/contacts/delete.ts`: borra chat, conversación, mensajes, notas, citas, etiquetas, campos y los archivos de media propios (conserva la media compartida con otros mensajes). **Se conserva a propósito** el teléfono en los registros de entrega de campañas y de importación de hojas (sin nombre): son el registro de que ya se le escribió y la hoja lo volvería a contactar. *Sin botón en la UI todavía* (el rediseño la traerá); hoy solo API.
- **Índices** de listado en `Contact` (`(canal, estado)`, `(cuenta, actualizado)`, `(canal, actualizado)`). Migración `contact_list_indexes`.
- **Pruebas nuevas:** `lib/contacts/__tests__/jid.test.ts` (12).

Pospuesto, con motivo: búsqueda indexada por teléfono/correo → Fase 1 (llegará como columna normalizada en `Person`); métrica de conversión de `/ventas` y su carga sin límite → Fase 2 (esa pantalla se reemplaza).

### Fase 1 — Personas y empresas
`Person`, `Company`, `ownerId`, correo/cargo/campos; migración con relleno 1:1; **ficha 360** (chats de todos los canales, notas, citas, campos); fusión manual desde la UI; **importar/exportar CSV** con mapeo y deduplicación por teléfono/correo; **vistas guardadas** y filtros por responsable/etiqueta/origen/empresa; acciones en lote (etiquetar, asignar, exportar); búsqueda por correo y empresa.

#### Resultado de la Fase 1 (rama `feat/crm-fase-0`, solo backend y API; sin interfaz por diseño)
- **Modelos** (migración `crm_people_companies`, con relleno: una persona por cada contacto existente, los `CUSTOMER` pasan a ciclo de vida de cliente): `Person` ("Contactos" en la interfaz), `Company`, `ActivityLog`, `SavedView`, `ImportRun`; `Contact.personId` obligatorio. Concurrencia por versión y archivo lógico en personas y empresas.
- **Creación única**: `resolveContact()` crea o reutiliza la persona en la misma transacción; una persona creada a mano o importada se **vincula sola** cuando escribe por WhatsApp (probado con el formato `52…`/`521…` contrario).
- **API `/api/crm/*`**: listado con búsqueda y filtros (responsable, empresa, ciclo de vida, canal, etiqueta, fechas, archivados), ficha con canales/citas/historial, alta con aviso de duplicado, edición con control de versión, archivar/restaurar, fusión, acciones en lote, duplicados, importación CSV con previsualización y huella, exportación, vistas guardadas, historial, equipo; empresas completas.
- **Permisos** como se decidió: `ejecutivo` comparte el directorio pero solo edita lo suyo; `admin`/`user` todo; borrado definitivo solo `admin`; al desactivar un usuario hay que reasignar sus contactos y empresas.
- **Plan**: el límite "contactos" cuenta personas. **Exportación/borrado de organización** incluyen lo nuevo.
- **Búsqueda indexada** (`pg_trgm`) fuera de las migraciones, como el índice vectorial.
- **Verificación**: 30 pruebas puras nuevas; pruebas por HTTP con **dos organizaciones y los tres roles** (aislamiento 404/403, duplicados 409, 6 ediciones simultáneas = 1×200 + 5×409, fusión, lote, importación, vistas, reasignación, borrado) y borrado real de organización por cascada. La primera tanda dio falsos positivos por la caché obsoleta de Turbopack (404 en HTML); se limpió `.next` y se endureció el verificador para exigir JSON.
- **Pospuesto**: etiquetas y campos personalizados a nivel de persona (hoy viven en el contacto de canal y la ficha los muestra por canal), eventos de dominio y API pública para personas/empresas (Fase 5), interfaz (rediseño).

### Fase 2 — Negocios y pipelines
`Pipeline`, `PipelineStage`, `Deal`, `DealStageChange`; pipeline por defecto sembrado desde `LeadStatus`; doble escritura hacia `Contact.leadStatus`; tablero **paginado por columna** (arregla D4) con monto por columna; motivo de pérdida; editor de etapas en Configuración; eventos `deal.*`; CAPI conectado por equivalente de etapa.

### Fase 3 — Tareas y actividad
`Task` con recordatorios; **línea de tiempo** unificada en la ficha; vista **"Mi día"** (tareas + citas + chats sin responder); regla "al ganar un negocio, crear tarea de seguimiento".

### Fase 4 — Reportes y pronóstico
Embudo con conversión por etapa y tiempo en etapa, tasa de cierre, ciclo de venta, ventas por responsable y por origen/anuncio, **pronóstico** (monto × probabilidad por etapa).

### Fase 5 — Integración y cierre
`/api/v1` para personas, empresas, negocios y tareas + **OpenAPI al mismo tiempo**; eventos y webhooks nuevos en el catálogo; pasos de automatización "crear negocio / mover etapa / crear tarea"; límites de plan (decisión 3); textos de la landing y del plan; exportación/borrado de organización completos; barrido de aislamiento final con dos organizaciones.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Migrar datos de producción (relleno de `Person`, siembra de pipeline) | Migraciones aditivas, relleno idempotente, respaldo previo, ensayo en el stack aislado con una copia de la base |
| Radio de impacto de `leadStatus` (31 archivos) | Doble escritura + migración de consumidores uno a uno, sin cortes |
| Fuga entre organizaciones en modelos nuevos | `organizationId` obligatorio, `orgWhere`, barrido con 2ª organización por fase |
| Salto de alcance ("CRM de conversación" → "CRM completo") | Cada fase entrega valor por sí sola; Fase 0 no cambia nada visible y reduce el riesgo de las demás |
| Pérdida de ventaja competitiva (el chat) | La ficha 360 y "Mi día" ponen el chat en el centro, no al margen |
| Producción atrasada respecto a `main` (despliegue pendiente desde el 2026-10-02) | Desplegar lo pendiente de `docs/CONTINUIDAD_2026-10-04.md` antes de empezar la Fase 0 |

## 7. Siguiente paso recomendado

1. ~~Responder las decisiones de §4~~ (hecho; ver tabla). Ver también [COMPARATIVA_AUREA_Y_REFERENCIAS_CRM_2026-10-06.md](COMPARATIVA_AUREA_Y_REFERENCIAS_CRM_2026-10-06.md).
2. Abrir una rama nueva desde `main` para la Fase 0 (la rama actual `chore/probar-impeccable` lleva cambios de la landing sin confirmar que no tienen relación).
3. Medir los duplicados en producción y arrancar la Fase 0.
