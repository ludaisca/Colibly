# Qué adoptar de Áurea CRM y de respond.io / Kommo — 2026-10-06

Complementa [AUDITORIA_CRM_2026-10-06.md](AUDITORIA_CRM_2026-10-06.md). Objetivo del usuario: dejar de ser solo una plataforma para enviar y responder mensajes y tener forma de CRM, "como respond.io o Kommo".

## Evidencia y límites

- **Áurea CRM** es el proyecto paralelo de un colega, en `/data/Proyectos/SAAS/crm-prototype` (la carpeta se llama `crm-prototype`; "Áurea" es el nombre del producto). Se revisó **solo lectura**: `README`, `docs/` (modelo de datos, permisos, pantallas, API, estado y pendientes), migraciones `001`–`009`, `server/src/resources.js`, `crm-scope.js`, rutas de informes e importación. **No se ejecutó ni se probó**; su propia documentación avisa que ninguna entrega está aceptada para lanzamiento ni hay pruebas con proveedores reales.
- **respond.io y Kommo:** solo se leyeron sus páginas comerciales en español (`respond.io/es`, `kommo.com/es`). Describen módulos, no detalle de producto; lo que sigue sobre ellos es el nivel de módulos. Lo que no aparece en esas páginas (por ejemplo, etapas de ciclo de vida de respond.io) **no lo doy por verificado**.

## 1. Las dos referencias son dos mitades de un CRM

| | **respond.io** | **Kommo** |
|---|---|---|
| Centro del producto | **El contacto**: perfil unificado de todos los canales en una bandeja | **El lead/negocio**: embudo (pipeline) con automatización por etapa |
| Módulos que muestran | Contactos multicanal, conversaciones, flujos, difusiones, asignación inteligente, informes de ROI por anuncio/agente/canal, integración con CRM, agentes de IA que califican | Pipeline, bandeja unificada, leads (con tope por plan), reservas/citas, Salesbot, analítica de ROI por fuente, productos, copiloto de IA |

**Colibly ya tiene casi toda la mitad de respond.io** (varios canales, bots de IA, calificador, difusiones, asignación por reglas, atribución de anuncios CTWA/Instant Form). **Lo que falta es la mitad de Kommo**: el negocio como centro, el pipeline configurable, las tareas y la analítica de ventas. Por eso la decisión ya tomada (cliente mixto + `Deal` separado + `Person` unificada) es coherente: `Person` es el perfil unificado de respond.io y `Deal` es la tarjeta de lead de Kommo.

## 2. Qué trae Áurea que a Colibly le falta

Áurea es un prototipo pequeño (~2.300 líneas, Fastify + PostgreSQL con SQL directo + Vite/React 18, tres perfiles, WhatsApp único), pero su **modelo comercial** es justo el hueco de Colibly:

| Pieza de Áurea | Detalle | Veredicto para Colibly |
|---|---|---|
| Recorrido **empresa → contacto → oportunidad → siguiente paso** | `companies`, `contacts`, `deals`, `tasks`, `appointments`, `activities` | **Adoptar** el recorrido (coincide con la Fase 1–3 del plan) |
| `stages` con **resultado** ganado/perdido, orden y archivo | Una etapa terminal exige "motivo o resumen del cierre" | **Adoptar**: `PipelineStage.kind = OPEN/WON/LOST` y `closeReason` obligatorio al cerrar |
| `deals`: importe `numeric(18,2)`, fecha de cierre, probabilidad, `stageSince`, motivo de cierre | | **Adoptar** como columnas tipadas |
| **Un contacto puede tener varias oportunidades**; **la conversación se vincula a contacto y a oportunidad** | "Atender el chat, ganar la venta y completar la tarea son hechos independientes" | **Adoptar**: `Deal` ↔ conversación enlazable; resolver un chat nunca mueve un negocio |
| **Versión optimista** (`version`, 409 con el registro vigente) | Evita que dos agentes se pisen al editar | **Adoptar** en `Person`, `Company`, `Deal`, `Task` (Colibly hoy no tiene control de concurrencia en contactos) |
| **Archivo lógico** (`archivedAt`) en vez de borrar | "El archivo es la operación habitual" | **Adoptar** para empresas, negocios y tareas. Ojo: no sustituye el borrado real que exige la ley de datos (D3 de la auditoría) |
| **Historial automático**: cada escritura crea una `activity` de tipo evento + registro de auditoría + evento en la **misma transacción** | `writeResource` / `emitEvent` | **Adoptar el principio**: Colibly encola el evento *después* y lo pierde si Redis falla (`emitDomainEvent` "nunca lanza"). Un registro transaccional en la base (`ActivityLog`) cierra E3 |
| **Importación CSV con previsualización** (`ready`/`duplicate`/`error`), huella (fingerprint) de archivo+mapeo que impide reimportar, tope de 1000 filas, respeta cuota del plan | `/api/imports/preview` + `/api/imports` | **Adoptar** completo (E8). Mejorarlo: Áurea solo importa contactos; hacerlo también para empresas y negocios |
| **Informes** de embudo por etapa, por responsable, vencidas, cierres, motivos de pérdida, tiempo en etapa | `/api/reports` | **Adoptar los indicadores, no la implementación**: Áurea los calcula de eventos y estado actual y su propia documentación admite que mezcla cohortes. Con `DealStageChange` de Colibly se calculan bien |
| **Permisos de trabajo**: empresas y contactos como directorio compartido; negocios, tareas, citas, actividades y conversaciones **solo los asignados** al ejecutivo; el propietario ve todo; **al desactivar un ejecutivo se exige reasignar sus registros** | `perfiles-permisos.md` | **Adoptar como respuesta propuesta a la decisión 2 del plan** (ver §4). Colibly ya tiene las piezas (`orgWhere`, `accountManageWhere`) |
| **Pantalla de inicio "Mesa de trabajo"**: conversaciones pendientes, **oportunidades sin siguiente paso**, tareas vencidas | `pantallas-y-flujos.md` | **Adoptar** como Fase 3 ("Mi día") |
| Tarjeta de negocio: importe, empresa, responsable, **próxima acción, tiempo en etapa**; en móvil, **una etapa visible con selector** | `colibly-review.md` | **Adoptar**; añadir alternativa al arrastre para teclado y táctil |
| Cierres de FK **con `organization_id`** en cada relación (una relación no puede apuntar a otra organización aunque el id exista) | Claves compuestas | **Adaptar**: con Prisma no se hace igual; se cubre con `organizationId` en cada modelo + el barrido con 2ª organización que Colibly ya practica |

## 3. Qué NO adoptar de Áurea

| Decisión de Áurea | Por qué no |
|---|---|
| Datos secundarios en **JSONB `payload` duplicados con columnas tipadas** | Su propia documentación advierte que pueden divergir si se edita por SQL. Colibly usa columnas tipadas y la tabla de campos personalizados ya existente |
| Ids `text` y claves primarias compuestas `(organization_id, id)` | Colibly usa `cuid` y Prisma; no hay beneficio y complica todo |
| Un solo contacto con correo/teléfono dentro del payload | **No resuelve la identidad por canal** (E1). Áurea misma propone esa capa en `colibly-review.md` pero no la implementó. Colibly necesita `Person` + `Contact`-por-canal |
| Solo WhatsApp, sin bots autónomos, campañas ni otros canales | Colibly ya los tiene y son su diferenciador |
| Sin RLS, procesos de fondo sin comprobar suspensión, sin revisión uniforme de límites | Está en su propia lista de pendientes. Colibly ya tiene compuertas de facturación en workers: no retroceder |
| Dos perfiles dentro de la empresa (propietario/ejecutivo) | Colibly tiene tres (`admin`/`user`/`ejecutivo`) y no se cambian sin aprobación |
| Snapshot completo como fuente anterior de datos | Es deuda de su prototipo, no aplica |

**Lo que Colibly ya hace mejor que Áurea** (y no hay que perder): automatizaciones versionadas con simulador, API v1 con alcances y webhooks firmados con guardia SSRF, coexistencia de WhatsApp, respaldos verificados con restauración real, 369 pruebas automáticas, y aislamiento entre organizaciones verificado de punta a punta.

## 4. Qué adoptar de respond.io y Kommo (a nivel de módulo)

| Idea | De quién | Cómo encaja en Colibly |
|---|---|---|
| **Perfil unificado entre canales** | respond.io | `Person` sobre `Contact` por canal (Fase 1) |
| **Pipeline con automatización por etapa** ("al entrar a *Propuesta*: crear tarea y mandar plantilla") | Kommo | El motor de automatizaciones de Colibly ya existe: agregar **disparadores `deal.stage_changed`** y **pasos "crear negocio / mover etapa / crear tarea"** (Fase 5). Es la ventaja más barata de conseguir |
| **ROI por anuncio, agente y canal** | ambos | Colibly **ya captura `adId`/`ctwaClid`/`metaLeadId`**; con monto en el negocio ganado se obtiene **ventas por anuncio**, y se puede mandar **valor** a Meta CAPI (hoy se reporta sin valor). Es un diferenciador real y no hay que esperar a la Fase 4 completa para el primer informe |
| **Asignación inteligente** | respond.io | Ya existe por carga y por reglas (etiqueta/origen/calificación); extender la condición a **etapa del negocio** y **propietario de la persona** |
| **Reservas/citas con recordatorios** | Kommo | Ya existe (`WAAppointment`); solo falta enlazarla a negocio/tarea |
| **Tope de leads por plan** | Kommo | Equivale a la decisión 3 del plan (límites); Colibly ya limita contactos |
| **Catálogo de productos** | Kommo | Fuera de alcance (decisión previa: sin inventario/POS). Si se quisiera, sería un paso posterior sobre `Deal` |
| **Calificación y respuesta con IA** | ambos | Ya existe (calificador, bots); el calificador podría proponer la etapa/prioridad del negocio |

## 5. Cambios al plan por fases

Se mantienen las fases de la auditoría; estas son las modificaciones:

- **Fase 0:** sumar columna `version` (concurrencia optimista) y `archivedAt` al diseño de los modelos nuevos; `ActivityLog` se escribe **en la misma transacción** que el cambio.
- **Fase 1:** importación CSV con previsualización + huella + detección de duplicados (contactos, empresas y negocios).
- **Fase 2:** `PipelineStage.kind`, probabilidad, `stageSince`, `closeReason` obligatorio al cerrar y **catálogo de motivos de pérdida** (Áurea lo dejó como texto libre y lo anota como pendiente); enlace conversación ↔ negocio; tarjeta con próxima acción y tiempo en etapa; alternativa al arrastre.
- **Fase 3:** "Mesa de trabajo" como página de inicio del CRM (pendientes, **negocios sin siguiente paso**, vencidas).
- **Fase 4:** el **primer informe a priorizar es ventas por anuncio/origen** (aprovecha lo que Colibly ya captura); luego embudo, ciclo, pronóstico, calculados desde `DealStageChange`.
- **Fase 5:** disparadores y pasos de automatización por etapa; valor del negocio ganado hacia Meta CAPI.

### Respuesta propuesta a las decisiones abiertas de la auditoría (§4)
2. **Alcance por rol:** el modelo de Áurea, adaptado — `admin` ve todo; `user` y `ejecutivo` comparten el **directorio** (personas y empresas) pero solo ven y editan **negocios, tareas, citas y actividades asignados a ellos**; reasignación obligatoria al desactivar a un miembro. *Resuelto: ver §4 de la auditoría (el rol acotado es `ejecutivo`).*
5. **`CUSTOMER` actuales:** sin cambio — no se inventan ventas; quedan como ciclo de vida de la persona. Áurea no tiene este problema porque nació sin datos heredados.

## 6. Relación con el proyecto del colega

Decisión del usuario (2026-10-06): solo se toma lo que sirve; **no se coordina con el colega ni se le informa**, y no se escribe nada en `/data/Proyectos/SAAS/`. Los dos proyectos resuelven el mismo dominio con tecnología distinta (Next.js/Prisma vs. Fastify/SQL), así que no hay código reutilizable tal cual: lo aprovechable son el modelo, las reglas y los textos de interfaz, reescritos para Colibly.
