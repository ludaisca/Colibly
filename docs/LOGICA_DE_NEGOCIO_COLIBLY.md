# Lógica de negocio de Colibly — guía para implementarla en Nexo CRM

> **Para quién es:** el agente que trabaja en `/home/luis/crm-demo` (Nexo CRM, demo en Vite/React que guarda todo en `localStorage`).
> **Para qué:** que Nexo se comporte como Colibly, no solo que se parezca. Este documento describe el modelo de datos, las reglas, los permisos, las fórmulas y los flujos del producto, con el código de referencia de las funciones puras.
> **Fuente de la verdad:** el código de `/data/Proyectos/Colibly` (rama `feat/crm-fase-0`, commit `cb40941`, 2026-10-07). Si este documento y el código discrepan, **manda el código**. Cada sección dice en qué archivo vive la regla para que puedas leerlo.
> **Idioma:** la interfaz y los mensajes de error van en español.
> **Verificado:** los bloques de código (§0.4 y siguientes) compilan en modo estricto como un solo módulo y se probaron contra la implementación real con las mismas entradas (más los casos de §22 que son funciones puras) el 2026-10-07; puedes copiarlos sin cambios.

---

## 0. Cómo usar este documento

### 0.1 Qué es Nexo hoy y cómo encaja esto

Nexo es una SPA **sin backend**: el estado vive en `localStorage` con claves `nexo:v1:*` (`src/lib/use-persistent-state.ts`) y los datos de ejemplo están en `src/lib/crm-data.ts`. Colibly es un SaaS multi-organización con Postgres. Para portar la lógica:

1. **Las reglas van en módulos puros** (`src/lib/rules/*.ts`, sin React ni `localStorage`), con pruebas. Todo lo marcado como **función pura** en este documento se puede copiar tal cual: no depende de la base de datos.
2. **Lo que en Colibly es una consulta o una transacción** pasa a ser una función que lee el estado, valida, aplica **todos** los cambios a la vez (un solo `setState`/escritura) y devuelve el resultado o un error `{ code, message }`. Un cambio nunca debe quedar a medias: por ejemplo, mover un negocio escribe el negocio, su historial de etapas, la actividad y la tarea automática juntos.
3. **Lo que en Colibly corre en segundo plano** (recordatorios, ticks, colas) en Nexo se simula con un intervalo en el cliente mientras la pestaña está abierta, o se calcula al leer.
4. **Los "eventos" y "webhooks"** no tienen destinatario real en Nexo: bastan como bus interno para disparar automatizaciones y notificaciones.

### 0.2 Prioridades

| Nivel | Qué | Secciones |
|---|---|---|
| **1 — núcleo CRM** (hazlo primero) | Principios, roles, modelo, contactos, empresas, pipelines, negocios, tareas, historial, Mi día, reportes | 3 a 10 y 12 a 14 |
| **2 — colaboración y automatización** | Citas, notificaciones, eventos y automatizaciones | 11 y 15 a 17 |
| **3 — producto conversacional y de plataforma** | Bandeja multicanal, bots/IA, planes y límites | 18 a 20 |

Al final: datos semilla (§21), criterios de aceptación (§22), qué no portar (§23) y orden sugerido (§24).

Nexo ya tiene pantallas de correo, facturación, tickets, propuestas y papelera que **Colibly no tiene** (ver §2). No las borres sin preguntar al usuario: simplemente no forman parte de esta lógica.

### 0.3 Convenciones del documento

- **DEBE / NO DEBE**: regla obligatoria. **Conviene**: recomendación.
- `Código`: referencia de la implementación real (ruta relativa a `/data/Proyectos/Colibly`).
- Las fechas se guardan en UTC (ISO). "Hoy", "este mes", etc. se calculan en la **zona horaria de la organización** (§3.4).
- Los importes son números con 2 decimales, en la **moneda de la organización** (una sola por organización).

### 0.4 Preludio común de los bloques de código

Los bloques de código de este documento son **un solo módulo en orden**: cada uno puede usar lo que definió uno anterior. Esto es lo que comparten todos (ponlo primero, por ejemplo en `src/lib/rules/common.ts`):

```ts
export type Outcome = "OPEN" | "WON" | "LOST";
export const clampPercent = (n: number) => (!Number.isFinite(n) ? 0 : Math.min(100, Math.max(0, Math.round(n))));
export const roundMoney = (n: number) => Math.round(n * 100) / 100;
export const digitsOnly = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
// Cociente seguro con un decimal: null cuando no hay base (nunca 0 %).
export const rate = (n: number, d: number) => (!d ? null : Math.round((n / d) * 1000) / 10);
```

---

## 1. Glosario y trampas de nombres

| Palabra en la interfaz | Entidad real | Nota |
|---|---|---|
| **Contacto** | `Person` (persona) | Es el registro que ve y edita el equipo. Tiene correo, teléfono, empresa, responsable, ciclo de vida. |
| *(no se ve como tal)* | `Contact` (identidad de canal) | **Un número de WhatsApp, un chat de Telegram, un usuario de Instagram…** Una persona tiene **varias** identidades de canal; cada identidad pertenece a **una** persona. Los chats cuelgan de la identidad. En Nexo llámalo `ChannelIdentity` para no confundirlo. |
| **Empresa** | `Company` | Opcional (clientes B2B). Un contacto puede no tener empresa. |
| **Negocio** | `Deal` | Una oportunidad de venta **de una persona**. Una persona puede tener varios negocios. |
| **Pipeline / Embudo** | `Pipeline` + `PipelineStage` | Varios por organización; etapas configurables. |
| **Etapa** | `PipelineStage` | Con un tipo: abierta, ganada o perdida (`outcome`). |
| **Responsable** | `ownerId` | Dueño comercial del contacto/empresa/negocio. **No** es quien atiende el chat. |
| **Asignado** (del chat) | `assignedToId` | Quien atiende la conversación ahora. Es independiente del responsable. |
| **Ejecutivo** | rol `ejecutivo` | Rol acotado: ve el directorio, pero solo trabaja lo suyo (§4). |
| **Organización** | `Organization` | El "tenant". Todo dato pertenece a una. |

Dos errores que ya cometimos en Colibly y no hay que repetir:

- Una persona **no** tiene "estado de venta". El estado de venta vive en sus **negocios**. El campo `lifecycle` de la persona solo distingue `LEAD` (prospecto) de `CUSTOMER` (cliente).
- Un **negocio no se cierra editándolo**: se cierra **moviéndolo** a una etapa de tipo ganada o perdida (§9.3).

---

## 2. Mapa Nexo → Colibly (qué cambiar en Nexo)

| Nexo hoy (`src/lib/crm-data.ts`) | En Colibly | Qué hacer |
|---|---|---|
| `Contact.status`: `cliente / prospecto / lead / archivado` | `Person.lifecycle`: `LEAD` o `CUSTOMER`, más `archivedAt` (fecha o nula) | Reducir a 2 valores. "Prospecto" y "lead" son lo mismo (`LEAD`, se muestra "Prospecto"). "Archivado" **no es un estado**: es `archivedAt`. |
| `Contact.value` | No existe | Es **derivado**: suma de los importes de sus negocios. No lo guardes. |
| `Contact.company` (texto) | `companyId` → `Company` | Relación real. Importar por CSV reutiliza empresas por nombre (sin distinguir mayúsculas). |
| `Contact.tags: string[]` | Etiquetas **por cuenta** (`Tag`), asignadas a la identidad de canal | En Nexo, sin canales, basta un catálogo de etiquetas y una lista por contacto. |
| `Contact.location`, `lastActivity` | No existen en el contacto | `lastActivity` se calcula de la línea de tiempo. Si quieres conservar `location`, que sea campo personalizado (§18.8). |
| `Stage`: enum fijo de 5 valores | `PipelineStage` configurable, con `outcome` | Sustituir por pipelines/etapas editables. Las etapas de Nexo ("propuesta", "negociación") son un pipeline de ejemplo válido. **`ganado` debe ser una etapa de tipo `WON` y debe existir una de tipo `LOST`.** |
| `Deal.value`, `closeDate` | `amount`, `expectedCloseDate` | Renombrar. |
| `Deal.probability` | `probability` (opcional) + probabilidad de la etapa | La efectiva sale de §9.4. |
| `Deal.tags` | No existen en negocios | Quitar o dejar solo visual. |
| Tareas con `priority: alta/media/baja` | `kind`: `TODO / CALL / MESSAGE / EMAIL / MEETING`; **sin prioridad** | Reemplazar prioridad por tipo. Si el usuario quiere prioridad, es una decisión aparte. |
| `Company.status`, `health`, `value`, `founded` | No existen | `status` y `value` se derivan de los negocios de sus contactos; `health` y `founded` no se portan. |
| `TEAM[].role`: Admin / Ventas / Soporte / Solo lectura | Roles `admin`, `user`, `ejecutivo` | Mapeo propuesto: Admin→`admin`; Ventas y Soporte→`user`; (nuevo) `ejecutivo`. **"Solo lectura" no existe en Colibly**: no lo inventes sin consultar. |
| Feed de actividad y "Auditoría" | `ActivityLog` + línea de tiempo unificada (§12) | Unificar. |
| Papelera (soft-delete con deshacer) | **Archivar** (reversible) y **borrado definitivo solo admin** | Ver §3.3. La papelera puede convivir si el usuario la quiere, pero el comportamiento "normal" de Colibly es archivar. |
| Automatizaciones: 4 reglas fijas | Motor de grafos de pasos (§17) | Sustituir cuando llegues al nivel 2. |
| Correo (hilos) | Bandeja de chats multicanal (§18) | Son productos distintos. El correo de Nexo no tiene equivalente en Colibly. |
| Facturas, pedidos, propuestas, tickets, MRR | **No existen en Colibly** | La facturación de Colibly es la **suscripción del propio SaaS** (§20), no emitir facturas a clientes. |
| Informes con datos mock | Reportes calculados (§14) | Reemplazar los mock por las fórmulas reales. |
| Moneda fija `formatEUR` | Una moneda **por organización** (§8.5) | Hacer `formatMoney(amount, currency)` con ajuste de organización. |

---

## 3. Principios transversales (DEBEN cumplirse en todo)

### 3.1 Alcance por organización
Todo dato pertenece a una organización y **toda** consulta se limita a ella. Nunca se filtra "por quien lo creó" algo que la organización comparte. (Nexo es de una sola organización: modélalo con un `organizationId` constante o una configuración global, pero no mezcles datos de usuarios por creador.)

### 3.2 Concurrencia optimista (`version`)
Personas, empresas y negocios tienen `version` (entero, empieza en 1). Toda edición envía `expectedVersion`; si no coincide con la actual, se rechaza con **409 `version_conflict`** y se devuelve el registro vigente. Cada escritura incrementa `version`. Excepciones:
- **Mover un negocio** acepta `expectedVersion` opcional (si falta, usa la actual).
- Pedir mover un negocio a la etapa donde **ya está** es un no-op idempotente, aun con versión vieja.
- **Las tareas no tienen versión** (gana la última escritura).

En Nexo, aunque haya un solo usuario por pestaña, mantenlo: sirve para pruebas y para dos pestañas abiertas.

### 3.3 Archivar vs borrar
- **Archivar** (`archivedAt`) es la forma normal de ocultar personas, empresas y negocios. Es reversible ("restaurar"). Los archivados no cuentan en reportes, límites del plan ni tableros.
- **Borrado definitivo** solo `admin`. Personas y empresas: borra en cascada lo suyo (tareas, historial, negocios de la persona). Negocios: "para limpiar altas por error; lo normal es perderlo o archivarlo".
- Nada más se borra suavemente. Los **motivos de pérdida** solo se archivan (no existe borrarlos); los **pipelines** se archivan, y solo se borran si no tienen negocios.

### 3.4 Zona horaria y "días"
La organización tiene `timezone` (por ejemplo `America/Mexico_City`). **"Hoy"** es el día calendario de esa zona: `[00:00 local, 00:00 local del día siguiente)`. Un día con cambio de horario mide 23 o 25 h. Las fechas de **cierre esperado** de un negocio se guardan a las **12:00 UTC** del día elegido (para que el día no se corra por la zona). Los reportes aceptan `YYYY-MM-DD` (días locales, el `to` es inclusivo) o un instante ISO.

### 3.5 Importes
`amount` ≥ 0, máximo 999 999 999 999, 2 decimales (`roundMoney(n) = Math.round(n*100)/100`). La probabilidad es un entero 0–100. Monedas admitidas (§8.5).

### 3.6 Tasas sin base = `null`, nunca `0 %`
Un cociente sin denominador se devuelve como `null` y la interfaz muestra "—". Un `0 %` falso engaña. (`rate()` en §14.)

### 3.7 Historial en la misma operación
Cada cambio relevante escribe su entrada de historial (`ActivityLog`) **en la misma operación atómica** que el cambio: nunca un cambio sin rastro ni un rastro sin cambio.

### 3.8 Efectos secundarios después de confirmar
Eventos, avisos y automatizaciones se disparan **después** de aplicar el cambio y **nunca lo hacen fallar** ("el hecho ya ocurrió").

### 3.9 Errores
Forma única: `{ error: string, code: string, ...extras }`. Códigos que usa el CRM:

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_request` | Dato inválido (mensaje en español dice cuál) |
| 401 | `unauthorized` | Sin sesión |
| 402 | `plan_limit` | Pasó un límite del plan (`limit`, `current`, `max`) |
| 402 | `read_only` | La organización está en solo lectura (§20.3) |
| 403 | `forbidden` | Rol sin permiso |
| 404 | `not_found` | No existe **o no puedes verlo** (nunca se distingue) |
| 409 | `version_conflict` | Versión vieja (incluye el registro actual) |
| 409 | `duplicate_person` / `duplicate_company` | Coincide correo, teléfono o nombre (`matches`) |
| 409 | `duplicate_name` | Nombre repetido (pipeline, motivo…) |
| 409 | `default_pipeline`, `pipeline_has_open_deals`, `pipeline_has_deals`, `stage_has_deals` | Reglas de pipelines (§8) |
| 409 | `duplicate_import` | El mismo archivo ya se importó |
| 409 | `needs_reassign` | Falta reasignar al deshabilitar un usuario (§4.3) |

Un id fuera de tu alcance responde **404, nunca 403**.

### 3.10 Paginación y búsqueda
- Listas: `page` (≥1) y `pageSize` (1–100, por defecto 25).
- Tablero y línea de tiempo: **cursor** por `(fecha, id)` (keyset), porque son largas y se actualizan.
- La búsqueda es por subcadena sin distinguir mayúsculas.

### 3.11 Patrones de idempotencia
- Tarea automática de una etapa: `autoKey = "stage:<etapa>:<instante de entrada>"` (único por negocio).
- Importación: huella `sha256(archivo + mapeo)`; el mismo archivo no se importa dos veces.
- Avisos periódicos: se "reclama" la fila antes de crear el aviso (así dos ticks no avisan dos veces).

---

## 4. Roles y permisos

Tres roles dentro de una organización. **No agregues ni quites roles sin preguntar** (así está decidido en Colibly).

| Acción | `admin` | `user` | `ejecutivo` |
|---|:-:|:-:|:-:|
| Ver el directorio de contactos y empresas | ✔ todo | ✔ todo | ✔ **todo** (lectura compartida) |
| Editar contacto/empresa | ✔ | ✔ | Solo si **es su responsable** |
| Crear contacto/empresa | ✔ | ✔ | ✔ pero **queda a su nombre** (`ownerId` = él, no puede elegir otro) |
| Cambiar responsable, archivar, restaurar | ✔ | ✔ | ✘ |
| Fusionar contactos, acciones en lote, importar CSV, exportar, ver duplicados | ✔ | ✔ | ✘ |
| Borrado definitivo (contacto, empresa, negocio) | ✔ | ✘ | ✘ |
| Ver negocios | ✔ todos | ✔ todos | Solo los **suyos** (listas, tablero y detalle; los ajenos dan 404) |
| Crear negocio | ✔ | ✔ | Solo de contactos que **él tiene asignados**; el negocio queda a su nombre |
| Editar / mover negocio | ✔ | ✔ | Solo los suyos |
| Cambiar responsable de un negocio o archivarlo | ✔ | ✔ | ✘ |
| Configurar pipelines, etapas, motivos de pérdida, moneda | ✔ | ✘ | ✘ |
| Ver tareas | ✔ todas | ✔ todas | Las **asignadas a él** o ligadas a un contacto/empresa/negocio **suyo** |
| Editar o completar tarea | ✔ | ✔ | Solo las **asignadas a él** |
| Crear tarea | ✔ | ✔ | Solo sobre registros **suyos**, y siempre queda **asignada a él** (no puede reasignar) |
| Reasignar tarea | ✔ | ✔ | ✘ |
| Borrar tarea | ✔ | ✔ | Solo las que **él creó** |
| Ver "Mi día" de otro miembro | ✔ | ✔ | ✘ (403; solo el suyo) |
| Reportes | ✔ todo | ✔ todo | Solo **sus** negocios (si pide otro responsable, se ignora) |
| Vistas guardadas | ✔ puede compartir | ✔ puede compartir | Solo privadas; no puede compartir |
| Usuarios, plan, claves de API, IA, automatizaciones, bots | ✔ | Parcial (ver §18/§20) | Bloqueado |

**Regla de oro para el ejecutivo:** *lee lo compartido, trabaja lo suyo.*

### 4.1 Defensa en capas
Cuando se restringe algo se hace en **tres capas**: ocultar en el menú → bloquear la ruta → responder 403 en el servicio. En Nexo no hay servidor: replica el filtrado dentro de las **funciones de la capa de datos** (no solo en la vista), para que ninguna pantalla nueva se salte la regla.

### 4.2 Guardas de la organización
- El **dueño** (owner) de la organización no puede ser degradado ni deshabilitado.
- Debe quedar **al menos un admin activo**.
- Un usuario deshabilitado no entra, no es candidato a responsable ni a asignado.

### 4.3 Deshabilitar un usuario
Si tiene personas, empresas, negocios abiertos o tareas abiertas a su nombre, la operación exige `reassignToUserId`; sin él responde **409 `needs_reassign`** con los conteos. Al reasignar se mueven sus **personas, empresas, negocios abiertos y tareas abiertas** (los cerrados conservan su histórico).

---

## 5. Modelo de datos del CRM

Campos exactos. `*` = obligatorio. Todos llevan `id` y `organizationId`.

**Person (Contacto)**
`name*` (≤200), `email` (minúsculas, ≤254), `phone` (como lo escribió, ≤40), `phoneDigits` (solo dígitos, para buscar), `jobTitle` (≤120), `companyId`, `ownerId`, `lifecycle` (`LEAD` por defecto | `CUSTOMER`), `source` (cómo llegó: `inbound`, `api`, `manual`, `import`, `lead_ads`…), `version`, `archivedAt`, `createdAt`, `updatedAt`.

**Company (Empresa)**
`name*` (≤200), `domain`, `industry`, `size`, `location`, `notes` (≤5000), `ownerId`, `version`, `archivedAt`, `createdAt`, `updatedAt`.

**Pipeline**
`name*`, `position`, `isDefault` (exactamente uno por organización), `autoCreateDeals` (por defecto `true`), `archivedAt`.

**PipelineStage**
`name*`, `position`, `color` (token: `info|warning|accent|success|danger|muted`), `outcome` (`OPEN|WON|LOST`), `probability` (0–100), `metaEvent` (nombre de evento de publicidad; opcional, no aplica a Nexo), `autoTaskTitle`, `autoTaskDueDays` (regla "al entrar a esta etapa, crear tarea").

**LossReason (Motivo de pérdida)**
`name*`, `position`, `archivedAt`.

**Deal (Negocio)**
`personId*`, `pipelineId`, `stageId`, `title*` (≤200; por defecto el nombre de la persona), `amount` (≥0, 2 decimales), `probability` (entero o nulo), `expectedCloseDate` (a las 12:00 UTC), `ownerId`, `companyId` (por defecto la de la persona), `contactId` (canal de origen; opcional), `status` (`OPEN|WON|LOST`, **copia de `stage.outcome`**), `stageEnteredAt`, `closedAt` (solo ganado/perdido), `lostReasonId`, `lossNote` (≤500), `leadOrigin` (`ORGANIC|INSTANT_FORM|CTWA`), `adId`, `source`, `createdById`, `version`, `archivedAt`.

**DealStageChange (historial de etapas)** — una fila por cada alta y cada movimiento
`dealId`, `fromStageId?`, `fromStageName?`, `toStageId`, `toStageName`, `toStatus`, `actorId`, `secondsInFrom` (segundos que estuvo en la etapa de la que sale), `createdAt`. **Los nombres son copias** (instantáneas, sin vínculo): las etapas se pueden renombrar o borrar sin romper el historial. Esta tabla es lo que hace posible el embudo (§14.3); **no se puede reconstruir después**, así que se escribe siempre.

**Task (Tarea)**
`title*` (≤200), `notes`, `kind` (`TODO` por defecto | `CALL | MESSAGE | EMAIL | MEETING`), `status` (`OPEN|DONE`), `dueAt`, `remindMinutesBefore`, `remindAt`, `remindedAt`, `completedAt`, `completedById`, `assigneeId`, `createdById`, `personId`, `companyId`, `dealId` (al menos uno), `source` (`manual | stage_rule | api | automation`), `autoKey`.

**ActivityLog (Historial)** — `type`, `data` (JSON), `actorId`, `personId`/`companyId`, `createdAt`. Tipos: §12.

**SavedView** — `entity` (`PEOPLE|COMPANIES`), `name` (≤80), `filters` (JSON), `shared`, `userId`.

**ImportRun** — `fingerprint` (único por organización), `summary`, `userId`.

**Organization (ajustes del CRM)** — `currency`, `timezone`, horario de atención (`businessHourStart/End`).

---

## 6. Contactos (Person)

Código: `lib/crm/{people,normalize,duplicates,merge-fields,merge,import,import-csv,views,reassign}.ts`, esquemas en `lib/crm/schemas.ts`.

### 6.1 Normalización — función pura

```ts
export function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// "no vino" (email:null, invalid:false) se distingue de "vino mal" (invalid:true)
export function normalizeEmail(raw: unknown): { email: string | null; invalid: boolean } {
  const v = cleanText(raw, 254);
  if (!v) return { email: null, invalid: false };
  const email = v.toLowerCase();
  return EMAIL_RE.test(email) ? { email, invalid: false } : { email: null, invalid: true };
}

// Teléfono: conserva lo escrito (para mostrar) y guarda los dígitos (para buscar). 7–15 dígitos (E.164).
export function normalizePersonPhone(raw: unknown) {
  const v = cleanText(raw, 40);
  if (!v) return { phone: null, phoneDigits: null, invalid: false };
  const digits = digitsOnly(v);
  if (digits.length < 7 || digits.length > 15) return { phone: null, phoneDigits: null, invalid: true };
  return { phone: v, phoneDigits: digits, invalid: false };
}

// Un móvil mexicano llega como 52XXXXXXXXXX o 521XXXXXXXXXX según el canal. Son la MISMA persona.
export function jidCandidates(phoneDigits: string): string[] {
  const d = digitsOnly(phoneDigits);
  if (!d) return [];
  const out = new Set<string>([d]);
  if (/^521\d{10}$/.test(d)) out.add("52" + d.slice(3));
  else if (/^52\d{10}$/.test(d)) out.add("521" + d.slice(2));
  return [...out];
}
export const phoneForms = (d: string | null | undefined) => (digitsOnly(d).length >= 7 ? jidCandidates(d!) : []);
export function phoneKey(d: string | null | undefined) {
  const x = digitsOnly(d);
  if (x.length < 7) return null;
  const c = jidCandidates(x);
  return c.length ? [...c].sort()[0] : x;
}
export const emailKey = (e: string | null | undefined) => normalizeEmail(e).email;
export const companyNameKey = (n: string | null | undefined) => { const v = cleanText(n); return v ? v.toLowerCase() : null; };
```

Para mostrar un teléfono: `52`+10 dígitos o `521`+10 → `+52 55 1111 0001`; cualquier otro → `+` + dígitos.

### 6.2 Crear
- `name` obligatorio ("Indica el nombre"). Correo inválido → "El correo no es válido". Teléfono inválido → "El teléfono no es válido (usa de 7 a 15 dígitos)".
- `ownerId`: si el actor es `ejecutivo`, **se fuerza a él**. Si no, el indicado (debe ser un usuario **activo de la organización**) o nulo.
- `companyId`: debe existir en la organización y **no estar archivada** ("La empresa no existe o está archivada").
- **Duplicados**: si ya existe una persona (no archivada) con el mismo **correo** o el mismo **teléfono** (comparando con `phoneKey`, así 52…/521… coinciden) → **409 `duplicate_person`** con `matches: [{ id, reasons: ["email"|"phone"] }]`, salvo `allowDuplicate: true`.
- **Límite del plan**: el límite `contacts` cuenta personas **no archivadas** → **402 `plan_limit`** (§20.2).
- Efectos: historial `person.created`; evento `person.created`.

### 6.3 Editar
- Envía `expectedVersion` (§3.2). `ejecutivo`: solo si es el responsable.
- Cambiar `ownerId` requiere `admin`/`user` y escribe `person.owner_changed`. Archivar/restaurar requiere `admin`/`user` (`person.archived`/`person.restored`).
- Los demás cambios escriben `person.updated` con `changes: { campo: [antes, después] }` (usa `diffFields`, §6.7).
- Si el correo o teléfono nuevos chocan con otra persona: mismo 409 de duplicado (salvo `allowDuplicate`).

### 6.4 Detección de duplicados — función pura

Dos personas son posibles duplicados si comparten **correo** o **teléfono** (con la equivalencia 52…/521…). Se agrupan por **componentes conexos** (A~B y B~C → un solo grupo). El más antiguo va primero (candidato natural a conservar).

```ts
export function personKeys(p: { email: string | null; phoneDigits: string | null }): string[] {
  const keys: string[] = [];
  const e = emailKey(p.email); if (e) keys.push(`email:${e}`);
  const ph = phoneKey(p.phoneDigits); if (ph) keys.push(`phone:${ph}`);
  return keys;
}

export function findDuplicateClusters(people: { id: string; email: string | null; phoneDigits: string | null; createdAt: Date }[]) {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let c = x; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const p of people) parent.set(p.id, p.id);
  const byKey = new Map<string, string[]>();
  for (const p of people) for (const k of personKeys(p)) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(p.id);
  const reasons = new Map<string, Set<"email" | "phone">>();
  const shared: { key: string; ids: string[] }[] = [];
  for (const [key, ids] of byKey) { if (ids.length < 2) continue; for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]); shared.push({ key, ids }); }
  for (const { key, ids } of shared) { const r = find(ids[0]); const s = reasons.get(r) ?? new Set(); s.add(key.startsWith("email:") ? "email" : "phone"); reasons.set(r, s); }
  const created = new Map(people.map((p) => [p.id, p.createdAt.getTime()] as const));
  const groups = new Map<string, string[]>();
  for (const p of people) { const r = find(p.id); (groups.get(r) ?? groups.set(r, []).get(r)!).push(p.id); }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => ({ ids: ids.sort((a, b) => created.get(a)! - created.get(b)! || a.localeCompare(b)), reasons: [...(reasons.get(root) ?? [])].sort() }))
    .sort((a, b) => b.ids.length - a.ids.length || a.ids[0].localeCompare(b.ids[0]));
}
```

### 6.5 Fusionar dos contactos (solo `admin`/`user`)
`merge(targetId, sourceId)`; deben ser distintos ("Elige dos contactos distintos") y existir. Es **atómico** y hace:
1. **Se conserva el destino.** Solo se **rellenan sus campos vacíos** con los del origen (`email`, `phone`+`phoneDigits` juntos, `jobTitle`, `companyId`, `ownerId`, `source`). **Nunca se pisa un dato.** Si cualquiera era `CUSTOMER`, el resultado es `CUSTOMER`.
2. Se **mueven al destino**: todas las identidades de canal, el historial, **los negocios y las tareas** (antes de borrar el origen: el borrado en cascada se los llevaría).
3. Se borra el origen y se escribe `person.merged` (con el nombre del origen).

```ts
export function mergePersonFields(target: Mergeable, source: Mergeable) {
  const data: Partial<Mergeable> = {}; const filled: string[] = [];
  for (const f of ["email", "phone", "jobTitle", "companyId", "ownerId", "source"] as const)
    if (target[f] == null && source[f] != null) { (data as any)[f] = source[f]; filled.push(f); }
  if (data.phone !== undefined) { data.phoneDigits = source.phoneDigits; filled.push("phoneDigits"); }
  if (source.lifecycle === "CUSTOMER" && target.lifecycle !== "CUSTOMER") { data.lifecycle = "CUSTOMER"; filled.push("lifecycle"); }
  return { data, filled };
}
// Cambios entre dos estados, para el historial: { campo: [antes, después] } solo si cambió.
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: (keyof T)[]) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const f of fields) { if (!(f in after)) continue; const a = before[f] ?? null, b = after[f] ?? null; if (a !== b) out[String(f)] = [a, b]; }
  return out;
}
```

### 6.6 Acciones en lote (solo `admin`/`user`)
Entre 1 y 200 ids por vez. Acciones: `assign_owner` (exige `ownerId`, puede ser `null` para quitarlo), `archive`, `restore`, `set_company` (exige `companyId`, `null` para quitarla). Cada una escribe su historial.

### 6.7 Importar CSV (solo `admin`/`user`) — "previsualizar y luego aplicar"
Código: `lib/crm/import-csv.ts` (puro) y `import.ts`.
- Lector RFC 4180: comillas, `""` escapadas, saltos de línea dentro de campo, BOM, y delimitador `,` `;` o tabulador detectado en el encabezado (Excel en español usa `;`).
- Límites: **1000 filas** y **500 000 caracteres** por archivo; necesita encabezado + ≥1 fila.
- Campos: `name`, `email`, `phone`, `company`, `jobTitle`. El mapeo se **sugiere por sinónimos** del encabezado (sin acentos ni mayúsculas): `nombre/name/nombre completo/contacto/cliente`, `correo/email/e-mail/mail`, `telefono/phone/celular/movil/whatsapp/numero/tel`, `empresa/company/organizacion`, `cargo/puesto/job title/title/rol`. La columna `name` es obligatoria ("Indica qué columna es el nombre").
- Cada fila resulta `ready`, `duplicate` (mismo correo/teléfono que alguien existente **o que otra fila del archivo**) o `error` (nombre vacío, correo o teléfono inválido, con el motivo).
- La previsualización devuelve una **huella** `sha256(csv + "\0" + mapeo ordenado)`. **Aplicar exige la huella** ("Falta la huella: revisa primero la previsualización") y que coincida con el archivo y mapeo actuales ("El archivo o el mapeo cambiaron…"). Se registra un `ImportRun`; **reimportar el mismo archivo** → **409 `duplicate_import`**.
- Aplicar: crea solo las filas `ready`; reutiliza empresas por nombre (sin distinguir mayúsculas) y crea las que falten; `source = "import"`. Valida el límite de contactos del plan antes de insertar (402).

### 6.8 Filtros y vistas guardadas
Filtros de personas: `q` (nombre, correo, teléfono), `ownerId` (id | `none` | `me`), `companyId` (id | `none`), `lifecycle`, `archived` (`exclude` por defecto | `only` | `include`), `channel`, `tagId`, `createdFrom/createdTo`, `sort` (`recent` | `newest` | `name`). Una **vista guardada** es un nombre + ese objeto de filtros; `shared` la hace visible a toda la organización (el `ejecutivo` no puede compartir). Solo quien la creó (o un `admin`) la edita o borra.
El listado de personas devuelve además por fila: canales (de las cuentas a las que el actor tiene acceso), fecha del último mensaje y no leídos.

### 6.9 Borrado definitivo
Solo `admin`. Borra primero las identidades de canal (sus chats, mensajes y media) y luego la persona (en cascada: negocios, tareas, historial).

---

## 7. Empresas

Código: `lib/crm/companies.ts`.
- Crear/editar con las mismas reglas de concurrencia, rol y propietario que las personas (el `ejecutivo` la crea a su nombre y solo edita las suyas).
- **Duplicado** por nombre sin distinguir mayúsculas → **409 `duplicate_company`** (salvo `allowDuplicate`).
- Archivar/restaurar y borrar: igual que personas (archivar `admin`/`user`; borrar `admin`).
- Ficha de empresa: sus datos, sus **personas** (el listado trae además `peopleCount` de personas no archivadas), su historial y `canEdit` (el `ejecutivo` solo si es su responsable).
- Listado de empresas: filtros `q` (nombre, dominio o industria), `ownerId` (id | `none` | `me`), `archived`, orden `recent` o `name`.
- Una empresa archivada no se puede asignar a personas ni negocios nuevos.

---

## 8. Pipelines, etapas y motivos de pérdida

Código: `lib/crm/{pipelines,deal-rules}.ts`. **Toda la configuración es solo `admin`.**

### 8.1 Datos por defecto (se siembran al crear la organización)

Pipeline **"Ventas"** (predeterminado, `autoCreateDeals = true`):

| # | Etapa | Color | Tipo | Prob. | Evento publicitario | Tarea automática |
|---|---|---|---|---:|---|---|
| 0 | Nuevo | info | OPEN | 10 | — | — |
| 1 | Contactado | warning | OPEN | 25 | Contact | — |
| 2 | Calificado | accent | OPEN | 50 | Lead | — |
| 3 | Ganado | success | WON | 100 | Purchase | **"Seguimiento postventa" a +7 días** |
| 4 | Perdido | muted | LOST | 0 | LeadLost | — |

Motivos de pérdida por defecto: **Precio, Sin respuesta, Compró con la competencia, Ya no le interesa, Otro.**
Moneda por defecto: la de la organización (MXN en Colibly).

### 8.2 Validación del conjunto de etapas — función pura

```ts
export function validateStageSet(stages: { name: string; outcome: "OPEN" | "WON" | "LOST"; probability: number }[]): string | null {
  if (!stages.length) return "El pipeline necesita al menos una etapa";
  if (stages[0].outcome !== "OPEN") return "La primera etapa debe ser una etapa abierta (por ahí entran los negocios nuevos)";
  if (!stages.some((s) => s.outcome === "WON")) return "El pipeline necesita una etapa de negocio ganado";
  if (!stages.some((s) => s.outcome === "LOST")) return "El pipeline necesita una etapa de negocio perdido";
  const seen = new Set<string>();
  for (const s of stages) {
    const key = s.name.trim().toLowerCase();
    if (!key) return "Cada etapa necesita un nombre";
    if (seen.has(key)) return `Hay dos etapas llamadas "${s.name.trim()}"`;
    seen.add(key);
  }
  return null;
}
// La probabilidad de una etapa cerrada no se elige: ganado 100, perdido 0.
export const stageProbability = (outcome: "OPEN" | "WON" | "LOST", requested?: number | null) =>
  outcome === "WON" ? 100 : outcome === "LOST" ? 0 : clampPercent(requested ?? 0);
```

### 8.3 Reglas de pipelines
- Máximo **10 pipelines** y **25 etapas por pipeline**. Nombre de pipeline único (sin distinguir mayúsculas) → 409 `duplicate_name`.
- **Límite del plan** de pipelines no archivados: Básico 1, Pro 5 (§20) → 402 al crear **o al restaurar** uno archivado.
- Exactamente **uno es el predeterminado** (el que abre negocios solos y el que muestra `/ventas` al entrar). **No se puede quitar la marca** sin elegir otro; un archivado no puede ser predeterminado.
- El **predeterminado no se archiva ni se borra** (`default_pipeline`). Un pipeline con **negocios abiertos no se archiva** (`pipeline_has_open_deals`, con el conteo). Un pipeline **con negocios no se borra** (`pipeline_has_deals`): se archiva.
- Si el pipeline predeterminado no existe (organización antigua), se crea de forma perezosa (con un candado para que dos peticiones no creen dos).

### 8.4 Reglas de etapas
- Crear/reordenar: la lista final debe incluir **cada etapa exactamente una vez**.
- **Cambiar el tipo (`outcome`) de una etapa que tiene negocios** → 409 `stage_has_deals` ("muévelos a otra antes de cambiar su tipo").
- **Borrar una etapa con negocios** exige `moveTo=<otra etapa>` del **mismo pipeline** y del **mismo tipo** (abierta, ganada o perdida); sin eso 409 `stage_has_deals` con el conteo. Los negocios movidos así reciben su fila de `DealStageChange` (con `stageEnteredAt = ahora` y `version + 1`), pero **no** crean tarea automática ni entradas de `ActivityLog`.
- El pipeline debe **seguir cumpliendo `validateStageSet`** tras cualquier cambio (primera abierta, una ganada, una perdida).
- `autoTaskTitle` + `autoTaskDueDays` pueden ponerse en **cualquier** etapa (no solo en Ganado). `autoTaskDueDays` 0–365.

### 8.5 Motivos de pérdida y moneda
- Alta de motivo: nombre único entre los activos, sin distinguir mayúsculas (409 `duplicate_name`). Un motivo **solo se archiva** (no se borra): debe quedar **al menos uno activo** ("Debe quedar al menos un motivo de pérdida activo"). Los negocios perdidos conservan su motivo aunque se archive.
- Moneda de la organización: una de `MXN, USD, EUR, COP, ARS, CLP, PEN, BRL, UYU, GTQ, CRC, DOP, BOB, PYG, GBP, CAD`; otra → "Moneda no admitida". Todos los importes de negocios y reportes están en esa moneda.

---

## 9. Negocios (Deal)

Código: `lib/crm/{deals,deal-effects,deal-rules,stage-tasks}.ts`.

### 9.1 Crear un negocio
Entrada: `personId*`, `title`, `amount`, `pipelineId`, `stageId`, `companyId`, `contactId`, `ownerId`, `probability`, `expectedCloseDate`, `source`.

Reglas, en orden:
1. La persona debe existir ("Contacto" no encontrado) y **no estar archivada** ("El contacto está archivado").
2. **`ejecutivo`**: solo si la persona tiene **él** como responsable; el negocio queda a su nombre.
3. **Etapa de entrada**: la indicada; si no, la **primera del pipeline indicado**; si no, la **primera del pipeline predeterminado**. Debe ser **abierta**: "Un negocio nuevo debe empezar en una etapa abierta; ciérralo moviéndolo después". Si dan `pipelineId` y `stageId` y no coinciden → "La etapa no pertenece a ese pipeline". El pipeline no puede estar archivado.
4. **Canal de origen** (`contactId`): el indicado (debe ser **de esa persona**: "Ese canal no pertenece al contacto") o, si no, **la identidad de canal más recientemente actualizada** de esa persona. De ahí se **copian** `leadOrigin` y `adId` al negocio (`ORGANIC` si no hay canal).
5. `companyId` por defecto = la de la persona; si se indica debe existir y no estar archivada.
6. **Responsable**: `ejecutivo` → él; si no, el indicado, o el de la persona, o quien crea.
7. `title` por defecto = nombre de la persona (≤200) o "Negocio nuevo".
8. En **una sola operación**: crear el negocio, escribir la **primera fila de `DealStageChange`** (sin `fromStage`), el historial `deal.created`, y — si la etapa tiene regla — la **tarea automática** (§10.5).
9. Después: eventos (`deal.created`, `task.created`).

### 9.2 Editar
`expectedVersion` obligatorio. Campos: `title` (no vacío), `amount`, `probability`, `expectedCloseDate`, `companyId`, `contactId`, `ownerId`, `archived`. **No incluye la etapa ni el estado** (eso es mover). `ejecutivo` solo los suyos; cambiar `ownerId` o archivar requiere `admin`/`user`. El historial `deal.updated` guarda el diff de `title, amount, probability, expectedCloseDate, companyId, contactId`; `deal.owner_changed` y `deal.archived`/`deal.restored` van aparte. Si nada cambió, no escribe nada.

### 9.3 Mover de etapa = cerrar/reabrir — función pura

```ts
export function planTransition(
  deal: { stageId: string; status: Outcome; stageEnteredAt: Date },
  to: { id: string; outcome: Outcome },
  now: Date,
  input: { lostReasonId?: string | null; lossNote?: string | null } = {}
) {
  const secondsInFrom = Math.max(0, Math.floor((now.getTime() - deal.stageEnteredAt.getTime()) / 1000));
  if (deal.stageId === to.id) return { changed: false, status: deal.status, closedAt: null, lostReasonId: null, lossNote: null, secondsInFrom };
  if (to.outcome === "LOST") {
    const lostReasonId = input.lostReasonId?.trim();
    if (!lostReasonId) throw new Error("Indica el motivo de pérdida");          // 400 invalid_request
    return { changed: true, status: "LOST" as const, closedAt: now, lostReasonId, lossNote: input.lossNote?.trim().slice(0, 500) || null, secondsInFrom };
  }
  return { changed: true, status: to.outcome, closedAt: to.outcome === "OPEN" ? null : now, lostReasonId: null, lossNote: null, secondsInFrom };
}
```

**Ganar o reabrir limpia el motivo de pérdida** del negocio (el anterior queda en el historial de etapas/actividad).

El movimiento completo (`moveDeal`) hace, **en una sola operación**:
1. Permisos: `ejecutivo` solo los suyos; el negocio **no puede estar archivado** ("restáuralo para moverlo"); el motivo de pérdida debe existir y no estar archivado.
2. Actualizar el negocio: `stageId`, **`pipelineId`** (puede cambiar de pipeline al mover a una etapa de otro), `status`, `stageEnteredAt = ahora`, `closedAt`, `lostReasonId`, `lossNote`, `version + 1` (con comprobación de `expectedVersion`).
3. Escribir **`DealStageChange`** (con `fromStage*`, `toStage*`, `toStatus`, `actorId`, `secondsInFrom`).
4. Historial `deal.stage_changed` (`from`, `to`, `status`, y `lostReasonId` si aplica).
5. **Si el nuevo estado es `WON` y la persona era `LEAD` → pasa a `CUSTOMER`** (con su propia entrada `person.updated` `reason: "deal_won"`; solo la **primera** victoria cambia algo).
6. Tarea automática de la etapa de destino (§10.5).
7. Después de confirmar: efectos (secuencias, eventos `deal.stage_changed` y además `deal.won` o `deal.lost`, avisos de publicidad, `task.created`).

Si el negocio **ya está** en esa etapa: no se escribe nada ni se dispara nada (idempotente).

### 9.4 Probabilidad y ponderado — funciones puras

```ts
// Ganado = 100, perdido = 0; abierto: la suya si la fijó, si no la de su etapa.
export function effectiveProbability(deal: { status: Outcome; probability: number | null }, stage: { probability: number }) {
  if (deal.status === "WON") return 100;
  if (deal.status === "LOST") return 0;
  return clampPercent(deal.probability ?? stage.probability);
}
export const weightedAmount = (amount: number, probability: number) => roundMoney((amount * clampPercent(probability)) / 100);
export const defaultDealTitle = (personName: string) => personName.trim().slice(0, 200) || "Negocio nuevo";
```

Cada negocio serializado incluye `probabilityEffective` y `weightedAmount`.

### 9.5 Negocios creados automáticamente
Cuando **entra un mensaje de una persona nueva** (no existía ni por teléfono), se crea su contacto y, si el pipeline predeterminado tiene `autoCreateDeals`, **un negocio en su primera etapa**, con `source` = cómo llegó. **No** se crea negocio cuando la identidad se vincula a una persona que ya existía, ni en campañas ni en importaciones de historial. En Nexo: "al crear un contacto desde un mensaje/lead nuevo".

### 9.6 Archivar y borrar
Archivar = `archived: true` (admin/user); no cuenta en tableros ni reportes. Borrar = solo `admin`, escribe `deal.deleted`.

### 9.7 Tablero (kanban)
- Un pipeline elegido (el predeterminado al entrar). Una columna por etapa, ordenada por `position`.
- Cada columna muestra **total de importes** y **conteo**, y se pagina **por columna** con cursor (cargar más). Filtros: `pipelineId`, `ownerId`, `q`. `ejecutivo`: solo los suyos.
- Arrastrar una tarjeta a otra columna = `moveDeal`. Si la columna destino es de tipo **perdida**, la interfaz **pide el motivo** antes de mover.
- Filtros del listado de negocios: `q`, `pipelineId`, `stageId`, `status` (`OPEN|WON|LOST`), `ownerId` (id | `none` | `me`), `personId`, `companyId`, `leadOrigin`, `adId`, `archived` (`exclude` por defecto | `only` | `include`), `createdFrom/createdTo`, `closedFrom/closedTo`, orden `recent | newest | amount | closing`.

### 9.8 Reglas de los negocios al borrar otras cosas
- Borrar una **persona**/**empresa** → sus negocios y tareas se borran (cascada); al **fusionar** se mueven antes (§6.5).
- Deshabilitar un usuario → sus negocios **abiertos** se reasignan (§4.3).

---

## 10. Tareas

Código: `lib/crm/{tasks,task-rules,stage-tasks}.ts`.

### 10.1 Crear
- `title` obligatorio ("Indica qué hay que hacer"). **Debe ligarse al menos a un** contacto, empresa o negocio ("Liga la tarea a un contacto, una empresa o un negocio"). Si se liga a un negocio, **la persona se completa con la del negocio** (y si se manda otra: "El negocio no pertenece a ese contacto").
- **Los vínculos son inmutables** después de crear.
- `assigneeId`: usuario activo de la organización; por defecto, quien la crea. `ejecutivo`: siempre él, y solo sobre registros suyos.
- `kind` por defecto `TODO`. `source`: `manual | api | automation | stage_rule`.

### 10.2 Completar / reabrir
`PATCH { status: "DONE" }` (idempotente): fija `completedAt` y `completedById`; escribe `task.completed`. `OPEN` reabre (limpia esos campos; `task.reopened`). Editar/completar: `ejecutivo` solo las asignadas a él. Reasignar: solo `admin`/`user`. Si **alguien más** te asigna una tarea, recibes el aviso `TASK_ASSIGNED`.

### 10.3 Recordatorios — función pura

```ts
export const MAX_REMIND_MINUTES = 10_080; // 7 días
// remindMinutesBefore: null = sin aviso; 0 = a la hora (default cuando hay fecha).
export function computeRemindAt(dueAt: Date | null, minutesBefore: number | null, now: Date): Date | null {
  if (!dueAt || minutesBefore === null) return null;
  const at = new Date(dueAt.getTime() - minutesBefore * 60_000);
  return at.getTime() > now.getTime() ? at : null;   // avisos en el pasado no se programan
}
```

Se guarda `remindMinutesBefore` **y** el `remindAt` resultante. Reprogramar la fecha **vuelve a armar** el aviso (`remindedAt = null`). Cada 5 minutos un proceso busca tareas `OPEN` con `remindAt <= ahora` y `remindedAt` nulo: **reclama la fila** (marca `remindedAt` con una actualización atómica) y **luego** crea la notificación `TASK_DUE` al asignado (enlace a `/mi-dia?task=<id>`). Se salta organizaciones que no pueden escribir (§20.3) dejando el aviso armado.

### 10.4 Cubetas para "Mi día" — función pura

```ts
export type TaskBucket = "overdue" | "today" | "upcoming" | "undated";
export function taskBucket(dueAt: Date | null, bounds: { start: Date; end: Date }): TaskBucket {
  if (!dueAt) return "undated";
  if (dueAt < bounds.start) return "overdue";
  if (dueAt < bounds.end) return "today";
  return "upcoming";
}
```

### 10.5 Tarea automática de una etapa — función pura

"Al **entrar** a esta etapa, crear una tarea": configurada por etapa (`autoTaskTitle`, `autoTaskDueDays`).

```ts
export const MAX_AUTO_TASK_DAYS = 365;
export function planStageTask(stageId: string, rule: { autoTaskTitle: string | null; autoTaskDueDays: number | null }, enteredAt: Date) {
  const title = rule.autoTaskTitle?.trim();
  if (!title) return null;
  const days = Math.min(Math.max(rule.autoTaskDueDays ?? 0, 0), MAX_AUTO_TASK_DAYS);
  return { title: title.slice(0, 200), dueAt: new Date(enteredAt.getTime() + days * 86_400_000), autoKey: `stage:${stageId}:${enteredAt.getTime()}` };
}
```

- Se crea **dentro de la misma operación** que crea o mueve el negocio (también para el negocio auto-creado de un mensaje).
- **Idempotente por entrada** (`autoKey`): reintentar el mismo cambio no duplica; **salir y volver a entrar** a la etapa crea otra.
- Asignación: **responsable del negocio → responsable de la persona → nadie**. `source = "stage_rule"`, ligada al negocio y a su persona.
- Mover a la etapa donde ya estaba: no crea nada. Los movimientos masivos por borrar una etapa: no crean tareas.

### 10.6 Otras reglas
- Borrar una tarea: `ejecutivo` solo las que **él creó**.
- Listado: filtros `status` (`open` por defecto | `done` | `all`), `assigneeId`, `personId`, `companyId`, `dealId`, `due` (`overdue|today|week|none`), `q`; paginado.
- Fusionar contactos mueve sus tareas; deshabilitar usuario reasigna sus tareas **abiertas**; borrar persona/empresa/negocio borra sus tareas.

---

## 11. Citas (agenda)

Código: `lib/appointments.ts`, `app/api/whatsapp/appointments/**`.
- Una cita cuelga de una **identidad de canal** (no de la persona): `title*`, `notes`, `scheduledAt*`, `durationMinutes` (30 por defecto), `status` (`SCHEDULED | COMPLETED | CANCELLED | NO_SHOW`), `source` (`MANUAL | AI_BOT | API`), `assignedToId`, `reminderMinutesBefore` (60 por defecto), `remindedAt`, `cancelReason`.
- **Cancelar** es un cambio de estado a `CANCELLED` (+ motivo opcional), **no** un borrado; borrar es solo para limpiar altas por error.
- **Reprogramar** (`scheduledAt` cambia) pone `remindedAt = null` para que el aviso se recalcule.
- `ejecutivo`: forzado a `assignedToId` = él y solo ve/edita las asignadas a él. Un `assignedToId` candidato debe tener acceso a la cuenta del contacto.
- Recordatorio: cada 5 min, citas `SCHEDULED` sin `remindedAt` en las próximas 24 h; se avisa cuando `scheduledAt − ahora <= reminderMinutesBefore` (se evalúa fila por fila porque el margen varía): notificación `APPOINTMENT_REMINDER` a quien la tiene asignada (o a quien la creó). Una sola vez.
- Pasar a `COMPLETED` dispara el evento `appointment.status_changed` y el disparador de automatización "cita completada".
- En "Mi día" aparecen: las de hoy y las de los últimos **14 días** que siguen `SCHEDULED` sin cerrar.

---

## 12. Historial y línea de tiempo

Código: `lib/crm/{activity,timeline,timeline-ui}.ts`.

### 12.1 Tipos de actividad (`ActivityLog.type`)
`person.created`, `person.updated`, `person.owner_changed`, `person.archived`, `person.restored`, `person.merged`, `person.channel_linked`, `company.created`, `company.updated`, `company.archived`, `company.restored`, `deal.created`, `deal.updated`, `deal.stage_changed`, `deal.owner_changed`, `deal.archived`, `deal.restored`, `deal.deleted`, `task.created`, `task.completed`, `task.reopened`.
`data` es JSON con lo necesario para pintarlo (por ejemplo `changes: { campo: [antes, después] }`, `from`/`to` de etapa, `dealId`). Los mensajes, notas y citas **no** se duplican aquí.

### 12.2 Línea de tiempo unificada de una persona
Mezcla, de más nuevo a más viejo, cuatro fuentes: **actividad** (`activity`), **mensajes** de todos sus canales (`message`; vista previa de 240 caracteres, `[tipo]` si no hay texto), **notas** (`note`) y **citas ya ocurridas** (`appointment`, solo con `scheduledAt <= ahora`; las próximas van en "Próximas"). Se puede filtrar con `kinds=activity,message,note,appointment`.

**Paginación por fuente:** cada fuente se pagina con **su propia posición `(fecha, id)`** dentro de **un cursor opaco** (base64 de JSON), y se mezclan en memoria. Así los ids de tablas distintas nunca tienen que ser comparables y una persona con miles de mensajes no ahoga lo demás. Función pura de mezcla:

```ts
export interface TimelineEntry { key: string; source: string; id: string; at: Date } // key = "<fuente>:<id>", único
export type MergeCursor = Record<string, { t: string; i: string }>;
const cmpDesc = (a: TimelineEntry, b: TimelineEntry) => (b.at.getTime() - a.at.getTime()) || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);

// `lists`: por fuente, hasta take+1 elementos ordenados de más nuevo a más viejo (el +1 solo sirve para saber si hay más).
export function mergeTimeline<T extends TimelineEntry>(lists: Record<string, T[]>, take: number, prev: MergeCursor = {}) {
  const heads = Object.fromEntries(Object.keys(lists).map((k) => [k, 0]));
  const items: T[] = []; const next: MergeCursor = { ...prev };
  while (items.length < take) {
    let best: string | null = null;
    for (const src of Object.keys(lists)) {
      const cand = lists[src][heads[src]]; if (!cand) continue;
      if (best === null || cmpDesc(cand, lists[best][heads[best]]) < 0) best = src;
    }
    if (best === null) break;
    const e = lists[best][heads[best]++]; items.push(e);
    next[best] = { t: e.at.toISOString(), i: e.id };
  }
  return { items, nextCursor: Object.keys(lists).some((s) => heads[s] < lists[s].length) ? next : null };
}
```
En Nexo (sin red), la paginación puede ser en memoria, pero conserva la forma "una posición por fuente": facilita pasar a un servidor.

**Visibilidad:** mensajes y notas respetan el acceso a la **cuenta** de cada canal (quien no puede ver el WhatsApp de la persona no ve su conversación). Un `ejecutivo` solo ve las **citas asignadas a él** y, del historial, únicamente las entradas de **negocios y tareas que sí le tocan** (`deal.*` de negocios suyos, `task.*` de tareas que puede ver); las altas, ediciones, fusiones y cambios de responsable del contacto se ven igual que para todos. Si no se filtra, el historial revela títulos y etapas de negocios ajenos.

### 12.3 Textos
`describeTimelineItem` convierte cada tipo en un título y detalle en español (por ejemplo "Contacto creado", "Datos actualizados — correo, teléfono", "Pasó a cliente al ganar un negocio", "Cambió el responsable", "Se fusionó con otro contacto", "Mensaje recibido · WhatsApp"). Ver `lib/crm/timeline-ui.ts`.

---

## 13. "Mi día"

Código: `lib/crm/my-day.ts`. Pantalla `/mi-dia`, disponible para los tres roles. "Hoy" = día de la zona de la organización (§3.4). `admin`/`user` pueden ver el día de un compañero (`?userId=`, debe ser un usuario activo de la organización); el `ejecutivo`, solo el suyo (403).

Devuelve:
- **Tareas abiertas asignadas** al usuario en cuatro grupos: `overdue` (vencidas), `today`, `upcoming` (de mañana a **7 días**), `undated` (sin fecha). Topes: 50 vencidas/hoy; 20 próximas y sin fecha. Más `counts.tasksOverdue` y `counts.tasksToday` (totales reales).
- **Citas**: las de hoy y las de los últimos 14 días que siguen `SCHEDULED` ("por cerrar").
- **Conversaciones esperando respuesta**: chats **asignados al usuario**, abiertos o pendientes, **no de grupo**, cuyo **último mensaje es del cliente** (nadie ha contestado), del más viejo al más nuevo, tope 30, con minutos de espera.
- **Negocios sin siguiente paso**: negocios **abiertos** del usuario, **no archivados**, **sin ninguna tarea abierta** y **sin cita futura** (si tiene canal). Tope 20 + total.
- `counts`: `tasksOverdue`, `tasksToday`, `appointmentsToday`, `chatsWaiting`, `dealsWithoutNextStep`.

---

## 14. Reportes

Código: `lib/crm/{reports,report-rules}.ts`. Solo lectura. Filtros comunes: `pipelineId`, `from`, `to`, `ownerId` (id | `none` | `me`), `leadOrigin`, `adId`. Los negocios **archivados no cuentan**. Los importes están en la moneda de la organización. `ejecutivo`: **siempre** solo sus negocios.

### 14.1 Dos criterios de periodo (a propósito)
- **Rendimiento** (resumen, por responsable, motivos de pérdida, tendencia de ganados/perdidos): por **fecha de cierre** (`closedAt`).
- **Atribución y embudo** (origen/anuncio, embudo): por **cohorte** — los negocios **creados** en el periodo y lo que fue de ellos hasta hoy.

### 14.2 Periodos — función pura
Por defecto: **últimos 90 días contando hoy**; máximo **800 días**. `from` inclusivo, `to` exclusivo; una fecha `YYYY-MM-DD` se interpreta en la zona de la organización y el `to` de fecha **incluye ese día completo**; un instante ISO se usa tal cual. `from >= to` → "El periodo debe empezar antes de terminar".

```ts
export const DEFAULT_PERIOD_DAYS = 90, MAX_PERIOD_DAYS = 800;
export function previousPeriod(p: { from: Date; to: Date }) { const len = p.to.getTime() - p.from.getTime(); return { from: new Date(p.from.getTime() - len), to: p.from }; }
export function defaultGranularity(p: { from: Date; to: Date }): "day" | "week" | "month" {
  const days = (p.to.getTime() - p.from.getTime()) / 86_400_000; return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}
export const winRate = (won: number, lost: number) => rate(won, won + lost);                      // ganados ÷ (ganados + perdidos)
```

Helpers de zona horaria (`dayBounds`, `localDayStart`, `zonedMidnight`, `tzOffsetMs`, `safeTimeZone`) están completos en `lib/crm/task-rules.ts` (≈50 líneas con `Intl.DateTimeFormat`); cópialos tal cual.

### 14.3 Resumen (`summary`)
Para el periodo actual **y** el inmediato anterior de la misma duración:
- `created` = negocios creados en el periodo: `count` y `amount`.
- `won` = `status = WON` con `closedAt` en el periodo: `count`, `amount`, `averageAmount = amount / count` (nulo si 0).
- `lost` = ídem con `LOST`: `count`, `amount`.
- `winRate = won ÷ (won + lost)`.
- `cycleDays` (ciclo de venta): de `createdAt` a `closedAt` **solo de los ganados del periodo**: promedio y **mediana**, en días con 1 decimal.
- `open` (foto de **hoy**, no depende del periodo): `count`, `amount`, `weighted = Σ amount × probabilidad efectiva / 100`.

### 14.4 Embudo (`funnel`)
Por **cohorte** (creados en el periodo), de **un** pipeline (por defecto el predeterminado). "**Llegó a la etapa k**" = ocupó la etapa k **o una posterior abierta** (un salto de etapa cuenta como haber pasado por las intermedias) **o se ganó alguna vez**. Se construye con el historial de etapas (`DealStageChange`). Función pura:

```ts
export interface VisitGroup { maxOpenPosition: number | null; everWon: boolean; count: number }
export function buildFunnel(openStages: { id: string; name: string; position: number }[], groups: VisitGroup[]) {
  const stages = [...openStages].sort((a, b) => a.position - b.position);
  const total = groups.reduce((n, g) => n + g.count, 0);
  const reachedOf = (pos: number) => groups.reduce((n, g) => n + (g.everWon || (g.maxOpenPosition !== null && g.maxOpenPosition >= pos) ? g.count : 0), 0);
  const rows = stages.map((s) => ({ stageId: s.id as string | null, name: s.name, reached: reachedOf(s.position), fromPrevious: null as number | null, fromStart: rate(reachedOf(s.position), total) }));
  const won = groups.reduce((n, g) => n + (g.everWon ? g.count : 0), 0);
  rows.push({ stageId: null, name: "Ganado", reached: won, fromPrevious: null, fromStart: rate(won, total) });
  for (let i = 1; i < rows.length; i++) rows[i].fromPrevious = rate(rows[i].reached, rows[i - 1].reached);
  return { total, rows };
}
```
`fromPrevious` = % de los que llegaron a la etapa anterior que llegaron a esta; `fromStart` = % de toda la cohorte. Además, **tiempo en cada etapa**: promedio y mediana de `secondsInFrom` de los movimientos del periodo, y lo que **hay ahora** en cada etapa con su antigüedad promedio.

### 14.5 Por responsable (`owners`)
Por `ownerId` (incluye "Sin responsable"): `open {count, amount, weighted}` (foto de hoy), `won` y `lost` del periodo por fecha de cierre, `winRate`, `cycleDays` (promedio de ganados). Solo filas con algún negocio. Orden: ganado descendente, luego abierto descendente. Marca si el usuario ya no está activo.

### 14.6 Por origen y anuncio (`origins`)
Cohorte de negocios **creados** en el periodo, agrupados por `leadOrigin` y por `adId` (top 50): `created`, `open {count, amount}`, `won {count, amount}`, `lost`, `winRate`, **`conversion = ganados ÷ creados`** (qué parte de lo que llegó por ahí ya se ganó).

### 14.7 Motivos de pérdida (`loss-reasons`)
Perdidos del periodo por fecha de cierre, agrupados por motivo: `count`, `amount`, `share = count ÷ total` (sin motivo: "Sin motivo").

### 14.8 Tendencia (`trend`)
Series de ganados/perdidos/creados por `day | week | month` (por defecto `defaultGranularity`); ganados y perdidos por fecha de cierre, creados por fecha de alta.

### 14.9 Pronóstico (`forecast`)
Negocios **abiertos** agrupados por mes de **cierre esperado**, con tres cubetas especiales:

```ts
// "2026-10" | "overdue" (fecha pasada y sigue abierto) | "none" (sin fecha)
export function forecastBucket(expected: Date | null, now: Date): string {
  if (!expected) return "none";
  const day = Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth(), expected.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (day < today) return "overdue";
  return `${expected.getUTCFullYear()}-${String(expected.getUTCMonth() + 1).padStart(2, "0")}`;
}
```
Orden: `overdue`, meses ascendentes, `none`. Cada una: `count`, `amount`, `weighted`. También por etapa (`count/amount/weighted`) y **`thisMonth`**: `wonSoFar` (ganado en lo que va del mes local), `expectedWeighted` (ponderado de la cubeta del mes actual) y `projected = wonSoFar.amount + expectedWeighted`.

---

## 15. Notificaciones

Modelo `Notification` por usuario (no se comparten): `type`, `title`, `body`, `link`, `readAt`. Se consultan por sondeo cada ~25 s (no hay websockets). Tipos: `CHAT_MESSAGE`, `CAMPAIGN_COMPLETED`, `CAMPAIGN_FAILED`, `BOT_ERROR`, `BUDGET_EXCEEDED`, `ACCOUNT_STATUS`, `APPOINTMENT_REMINDER`, `APPOINTMENT_PROPOSED`, `INTEGRATION_ERROR`, `BILLING`, **`TASK_DUE`**, **`TASK_ASSIGNED`**.

- `TASK_DUE`: llegó la hora del aviso de una tarea (§10.3). `TASK_ASSIGNED`: alguien más te asignó una tarea.
- `CHAT_MESSAGE`: llega un mensaje a una conversación **ya asignada** (o recién autoasignada).
- `BILLING`: prueba por vencer (≤3 días, una vez al día), pago fallido, solo lectura, límite alcanzado (una vez al mes).
- Los avisos de plan además se envían por correo a los admins activos.

---

## 16. Eventos de dominio, webhooks y API pública

Código: `lib/events/*`, `lib/webhooks/*`, `lib/api/*`, `app/api/v1/**`.

### 16.1 Bus de eventos
`emitDomainEvent` solo **encola** y **nunca lanza** (el hecho ya pasó). Cada evento: `id`, `type`, `occurredAt`, `account` (cuenta de canal o `null`), `organizationId`, `contactId`, `chat`, `data`. **Los eventos de organización** (sin cuenta) son `task.created`, `task.completed`, `person.created` y los `deal.*` de negocios **sin conversación**: solo los reciben los webhooks de esa organización **sin restricción de cuenta**; las automatizaciones **no** los ven.

Catálogo: `message.received`, `message.sent`, `contact.created`, `person.created`, `task.created`, `task.completed`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`, `tag.added`, `conversation.assigned`, `conversation.resolved`, `appointment.created`, `appointment.status_changed`, `lead.scored`, `lead.ad_captured`.

Datos de `deal.*`: `dealId, title, amount, currency, personId, ownerId, pipeline{id,name}, stage{id,name,status}, fromStage{id,name}|null, lostReason{id,name}|null`. Datos de `task.*`: `taskId, title, kind, status, dueAt, assigneeId, completedById, personId, companyId, dealId, source`.

**Quien cambie uno de estos hechos DEBE emitir el evento** (y para etapas usar `moveDeal`, que ya lo hace; para etiquetas usar `afterContactTagAdded`).

### 16.2 Webhooks salientes
Un `WebhookEndpoint` por URL con filtro de eventos y restricción opcional de cuentas. Una entrega por endpoint y evento (único `(endpointId, eventId)`: los reintentos no duplican). Firma `X-Colibly-Signature: t=<unix>,v1=hex(hmac_sha256(secret, "t.body"))`. Reintentos con retroceso exponencial desde 30 s (≈30 min en total, 6 intentos). **20 fallos finales seguidos desactivan** el endpoint y avisan (`INTEGRATION_ERROR`). Las entregas se purgan a los 30 días. Toda URL de usuario pasa por una guarda **anti-SSRF** (bloquea IP privadas, loopback, link-local, CGNAT).

### 16.3 API pública (`/api/v1`, solo plan Pro)
`Authorization: Bearer sk_live_…` (solo se guarda el sha256; el secreto se muestra una vez). Errores `{ error: { code, message } }`. **Un id fuera de alcance responde 404.** 120 peticiones/min por clave. Paginación por cursor `(fecha, id)`.

Recursos y scopes: `people:*`, `companies:*`, `tasks:*` (también DELETE), `deals:read|write`, `reports:read`, `automations:run`, y los de conversaciones/mensajes. `PATCH` de personas/empresas acepta `expectedVersion` opcional (omitido = versión actual). Un `PATCH /deals/{id}` puede **editar y/o mover**. Una clave **restringida a cuentas** solo ve personas con canal en esas cuentas, sus empresas y sus tareas/negocios; **no puede crear personas/empresas ni leer reportes** (403: quedarían fuera de su propio alcance). Las escrituras pasan por **los mismos servicios que la interfaz**, como el dueño de la clave (admin): mismas reglas, historial, eventos y límites. En una organización en solo lectura, la API solo permite GET.

Para Nexo, la API pública y los webhooks son **opcionales**; lo importante es que la capa de datos de Nexo exponga las mismas operaciones con las mismas reglas.

---

## 17. Automatizaciones

Código: `lib/automations/*`. Un único motor para chatbots de botones, reglas evento→acción y secuencias de seguimiento, en **todos** los canales.

### 17.1 Estructura
- Una automatización tiene un **borrador** (`draftGraph`) y **versiones publicadas inmutables** (`AutomationVersion`). Las ejecuciones se **fijan a su versión**: editar nunca rompe una ejecución en curso.
- El grafo es un **árbol**: `steps` se ejecuta en orden; un paso con ramas (`send_buttons`, `send_list`, `wait_for_reply`, `condition`, `ai_classify`) debe ser el **último** de su lista y **las ramas no se vuelven a unir**. Así la posición de una ejecución es solo un `nodeId`.
- Validar al publicar: estructura, límites de Meta (≤3 botones de ≤20 caracteres, ≤10 filas de lista), la plantilla es de **esa** cuenta y está aprobada, el asignado tiene acceso, el campo personalizado y el calificador existen, la URL pasa la guarda anti-SSRF, y una etapa de pérdida lleva motivo. Se advierte si un mensaje libre de WhatsApp caería a más de 24 h del último mensaje del cliente.
- Límite del plan: **automatizaciones activas** a la vez (Básico 5, Pro sin límite).

### 17.2 Disparadores
`keyword {keywords, match: exact|contains}`, `first_message`, `message_received`, `tag_added {tagName}`, **`deal_stage_changed {stageId}`** (se dispara con `deal.created` y `deal.stage_changed`), `appointment_completed`, `score_label {label}`, `ad_lead {origin: ANY|CTWA|INSTANT_FORM}`, `manual`. Los tres primeros se evalúan **síncronamente en la ingesta** de un mensaje, antes de encolar el bot; el resto llega por el bus de eventos. Prioridad al llegar un mensaje: una ejecución **esperando respuesta** lo toma; si no, `keyword` > `first_message` > `message_received`.

### 17.3 Pasos
`send_text`, `send_buttons`, `send_list`, `send_template`, `wait {minutes}`, `wait_for_reply {timeoutMinutes, validation: any|number|email|phone, saveToVar, saveToCustomField, invalidMessage}`, `condition {match: all|any, rules[]}`, `add_tag`, `remove_tag`, **`set_deal_stage {stageId, lostReasonId}`** (mueve el negocio abierto del contacto **en el pipeline de esa etapa**, o abre uno si no tiene; una etapa de pérdida exige motivo), **`create_task {title, kind, dueInMinutes|null, assignee: owner|chat|user, userId}`** (liga al contacto y a su negocio abierto; `source: "automation"`; si no se resuelve el responsable, queda para el dueño de la automatización), `set_custom_field`, `assign {mode: user|auto}`, `notify_team`, `ai_classify`, `ai_extract`, `ai_reply`, `score_lead`, `webhook`, `handoff`, `end`.
Condiciones: `subject` ∈ `var | tag | deal_stage | custom_field | score_label | channel | business_hours`; `op` ∈ `equals | not_equals | contains | present | absent`.
**No existe `create_deal`/`move_deal` aparte:** `set_deal_stage` ya abre o mueve.

### 17.4 Ejecución
- **Protecciones al iniciar** (en una transacción serializable): **una ejecución viva por (automatización, contacto)**, salvo `allowReentry`; **una conversacional por chat**; máximo **20 inicios por contacto por hora** (frena automatizaciones que se disparan entre sí).
- Una ejecución **toma la conversación**: el bot de IA calla mientras corre (pasos conversacionales: `send_*`, `wait_for_reply`, `ai_reply`, `handoff`). `handoff` ("Pasar a humano") mantiene al bot callado **24 h**.
- Una **respuesta manual de un agente** en el chat pausa las ejecuciones conversacionales de ese chat (`PAUSED_BY_AGENT`).
- Fallos de envío: ventana cerrada → `EXPIRED` (o la plantilla de respaldo del paso); error del proveedor → reintentos a 15/30/60/120 min y luego `FAILED`.
- Respuesta a botones: se compara por **id → texto de la opción (sin acentos/mayúsculas) → número ("2") → IA opcional**.
- Modo "Probar": no envía nada ni toca el CRM (la IA sí es real).
- **El ejecutor es una función pura**: todos los efectos pasan por un conjunto de adaptadores (real / simulado / de prueba). Replica esa separación en Nexo: el motor no debería tocar `localStorage` directo.

---

## 18. Bandeja conversacional (nivel 3)

> Nexo hoy tiene un buzón de **correo**; esto es otro producto. Impleméntalo solo si el usuario lo pide. Si lo haces, estas son las reglas.

### 18.1 Canales y cuentas
Cinco canales: **WhatsApp** (Meta Cloud API), **Telegram**, **Messenger**, **Instagram**, **Chat web** (widget propio). Cada **cuenta** pertenece a una organización y se **comparte** con usuarios de esa organización. Visibilidad: `admin` ve **todas** las cuentas de su organización; `user`/`ejecutivo` ven las suyas y las que se les comparten.
- Conversación = hilo de una identidad de canal. Mensaje: dirección `INBOUND|OUTBOUND`, tipo (`text|image|audio|video|document|sticker|interactive|template`), cuerpo/leyenda, estado de entrega (`sending|sent|delivered|read|failed`).
- **Capacidades por canal**: campañas y plantillas solo WhatsApp; etiquetas de chat y calificación de leads solo WhatsApp/Telegram; botones interactivos en todos (WhatsApp botones/lista, Telegram teclado, Messenger/Instagram respuestas rápidas, web widget botones); el chat web es solo texto.

### 18.2 Resolver identidades (regla crítica)
**Toda** alta o búsqueda de identidad pasa por un único punto (`resolveContact`). Un móvil mexicano llega como `52…` o `521…`; sin esto la misma persona se duplicaba (con su chat). Reglas: usar siempre el `remoteJid` que ya existe (no el crudo) para el chat; buscar con `jidCandidates`; **crear identidad ⇒ crear/reutilizar su persona en la misma operación** (reutiliza una con el mismo teléfono, p. ej. importada por CSV); **nunca** una identidad sin persona. El nombre **nunca retrocede**: un nombre igual al teléfono se considera "sin nombre real" y solo se sobrescribe con uno real.
En Telegram, el `message_id` es único **por chat**, no por bot: deduplicar mensajes entrantes dentro de **la conversación**, no de toda la cuenta (el `wamid` de WhatsApp sí es global).

### 18.3 Lista de conversaciones (bandeja)
- Vistas: **Todos**, **Míos** (`assigned=me`), **Sin asignar** (`assigned=none`), **Sin leer** (`unread=1`). Estado por defecto: **abiertos y pendientes**; se puede ver **resueltos** o **todos**; **una búsqueda incluye todos los estados**.
- Estados de conversación: `OPEN | PENDING | RESOLVED` (con `resolvedAt`; reabrir lo limpia).
- Todos los filtros se resuelven en el **servidor** (la lista está paginada: filtrar solo lo cargado esconde chats antiguos). Paginación **por canal** (cada fuente pagina sobre su total) y se mezcla por `lastMessageAt` descendente, deduplicando por id.
- Filtros extra: cuenta, campaña (relación sobre los mensajes), "el lead respondió" (existe algún mensaje entrante), búsqueda por nombre/teléfono/último mensaje.
- La conversación **abierta se conserva en la lista** aunque deje de cumplir el filtro.

### 18.4 Asignación
`assignedToId` solo a quien tenga acceso a la cuenta (`getEligibleAssignees`: dueño, compartidos y admins de la organización; nunca deshabilitados). **Asignar manualmente no dispara nada por sí mismo**; el aviso `CHAT_MESSAGE` sale en el **siguiente** mensaje entrante. **Asignación automática** (opt-in por cuenta): un mensaje entrante sin asignar va al candidato con **menos chats abiertos/pendientes**, respetando `User.maxOpenChats` (nulo = sin tope; los que llegaron al tope se saltan).

### 18.5 Ventana de 24 h de WhatsApp
Un mensaje libre a un cliente solo puede enviarse dentro de las **24 h** desde el último mensaje **entrante** del cliente. Fuera de la ventana solo **plantillas aprobadas**. Telegram, Messenger e Instagram no tienen esta restricción. Todo envío pasa por un único emisor (`sendOutbound`) que aplica esto, el bloqueo por solo lectura (§20.3) y emite `message.sent`.

### 18.6 Bots de IA
- Un bot atiende **una** cuenta (WhatsApp **o** canal, nunca ambas). **Un bot activo por cuenta** (409 si se intenta otro). Para que responda deben cumplirse `isActive` **y** `status = ACTIVE`; un error no controlado lo pone en `ERROR` hasta reactivarlo.
- **Debounce de 4 s**: el trabajo se encola con retraso y se descarta si llegó un mensaje más nuevo (responde el último, con los anteriores en el historial).
- **Toma de control humana**: un mensaje saliente de un humano **pausa el bot 30 min**; un eco desde la app del teléfono (coexistencia) cuenta como humano; el historial importado no. Un agente puede "devolver al bot" (el siguiente mensaje del lead le llega de inmediato), pero **no** puede saltarse una automatización conversacional ni su traspaso de 24 h. Un mensaje omitido no se reproduce al reanudar.
- **Sin respuestas duplicadas al reintentar**: una vez entregada la respuesta, errores posteriores se registran pero no se relanzan.
- Los bots **no responden a comentarios** de Facebook (solo a mensajes directos). Una respuesta vacía nunca se envía.
- Un mensaje entrante pasa **primero** por las automatizaciones (`dispatchInboundMessage`); si devuelven `suppressBot`, el bot calla.
- Las instrucciones del cliente se envuelven como **datos, no instrucciones** (anti inyección) y siempre se añade un **guardrail de alcance**.
- Respuestas "humanizadas" (opt-in): se parten por líneas en blanco y se envían con retardo de escritura simulado (≈40 ms/carácter, entre 0,8 y 8 s).

### 18.7 Recuperación de leads
Reengancha leads en "visto": configuración **por organización** (apagado por defecto): primer y segundo mensaje tras N horas de silencio (el segundo opcional), y horario de atención de la organización. Candidatos: conversaciones abiertas/pendientes cuyo **último mensaje es saliente** y que tienen **al menos un entrante alguna vez** (un destinatario de campaña que nunca respondió **no** es un lead abandonado). Tope por pasada: 200 candidatos, 20 envíos. Máximo **2 intentos** por silencio (si el lead responde, la secuencia se reinicia). Solo en horario, con créditos de IA, con un bot activo; en WhatsApp solo dentro de la ventana de 24 h. **Envía mensajes reales sin supervisión**: tratar `leadRecoveryEnabled` como ajuste sensible.

### 18.8 Etiquetas, campos personalizados, citas, campañas, secuencias, calificación
- **Etiquetas por cuenta** (nombre único por cuenta). Nunca aceptar un `tagId` del cliente sin verificar que pertenece a la cuenta. Las del sistema (`Campaña: X`, `Lead Ads: X`) se crean solas.
- **Campos personalizados** por cuenta: `key` (slug `^[a-z0-9_]+$`, **inmutable**), `label` (editable), `type` (`TEXT|NUMBER|DATE|BOOLEAN|SELECT`), `options`, `required`. El valor se guarda siempre como texto; vacío/`null` **borra** la fila.
- **Campañas** (solo WhatsApp): plantilla **aprobada**; variables del cuerpo por destinatario; cabecera y botón comunes a la campaña; un envío exitoso crea contacto/chat/mensaje y etiqueta `Campaña: nombre`; un fallo **no deja rastro**; los contactos que se dieron de baja de marketing se excluyen (`optedOutMarketing`).
- **Secuencias** (lineales, solo WhatsApp y Telegram; no agregarles funciones, se migran a automatizaciones): trigger `TAG_ADDED | DEAL_STAGE_CHANGED | APPOINTMENT_COMPLETED`; una inscripción por (secuencia, contacto) **como máximo una vez en la vida**; `exitOnReply` (por defecto sí) la detiene si el contacto escribe; envíos fallidos con retroceso 15→30→60→120 min y `FAILED` al 5.º fallo.
- **Calificación de leads**: un calificador de IA devuelve `{score 0-100, label, summary, reasons[], details}`. Etiquetas por rango: **descartado** (0 fijo), **frío** (1–15), **interesado** (16–35), **oportunidad** (36–65), **prioridad_alta** (66–100). Una conversación tiene **un puntaje por calificador**. Reglas fijas: ofensivo/rechazo explícito → descartado 0; **venta inversa** (quien escribe vende algo) → descartado 0. Puede correr manual o programada (cada 15/30/60/180/360/720/1440 min; hasta 15 chats por pasada; solo chats con mensajes nuevos desde el último puntaje) y emite `lead.scored` con `previousLabel`.

### 18.9 Atribución de anuncios
Cada identidad guarda `leadOrigin` (`ORGANIC|INSTANT_FORM|CTWA`), `ctwaClid`, `adId`, `metaLeadId` (**first-touch**: solo al crear, nunca se pisa). El negocio copia `leadOrigin/adId` al crearse. Al entrar un negocio de origen `≠ ORGANIC` a una etapa con `metaEvent`, se reporta a la API de Conversiones (al ganar con importe, también `value` + moneda). No se envía nada si no hay `testEventCode` (modo prueba) o modo `LIVE` explícito. Nexo puede omitir esta parte; conserva los campos de origen porque alimentan el reporte §14.6.

---

## 19. IA y créditos

- La IA la **provee la plataforma**; el cliente no configura llaves ni elige modelo. Los modelos son una lista corta curada que la plataforma asigna.
- **1 crédito = 1 llamada de IA** (respuesta de bot, sugerencia, calificación, mensaje de recuperación, paso de IA de una automatización; los embeddings no cuentan). Plan Básico 300/mes, Pro 1000/mes (+ bono que puede dar la plataforma solo para el periodo actual).
- Se **reserva** el crédito con un incremento atómico **antes** de llamar al proveedor (llamadas concurrentes no pueden pasar del tope). Avisos al 80 % y al 100 % una vez por periodo. El periodo se reinicia con cada factura pagada (o, sin suscripción, un mes después del último reinicio).
- **Sin créditos:** los bots callan (sin error), los pasos de IA toman la rama "otro", las acciones manuales responden **402 `ai_credits`**.
- Todo flujo que converse con usuarios finales incluye el guardrail de alcance.

---

## 20. Planes, límites y facturación del SaaS

Código: `lib/billing/{plans,state,gates,plan-features}.ts`.

### 20.1 Planes (catálogo único)

| | Básico (5 USD) | Pro (10 USD) |
|---|---:|---:|
| Usuarios (miembros + invitaciones pendientes) | 2 | 5 |
| Canales (WhatsApp/Telegram/Messenger/Instagram; el chat web **no cuenta**) | 1 | 3 |
| Contactos (personas **no archivadas**) | 1000 | 5000 |
| Créditos de IA por mes | 300 | 1000 |
| Automatizaciones **activas** a la vez | 5 | sin límite |
| Pipelines **no archivados** | 1 | 5 |
| API y webhooks salientes | ✘ | ✔ |

Las organizaciones **internas** no tienen tope. Cambiar precios o límites: **un solo lugar** (`plans.ts`).

### 20.2 Dónde se valida cada límite
En el momento de **crear** el recurso: usuarios (alta, invitación, reactivación, aceptar invitación); canales (el widget web no cuenta); **contactos** (alta manual, importación y API: cuentan los que **aún no existen**; las entradas por chat **nunca se descartan**: un aviso mensual a admins cuando se llega al tope); automatizaciones (al publicar o pasar a activa); **pipelines** (al crear o restaurar uno archivado); API/webhooks (solo Pro). Respuesta: **402 `plan_limit`** con `limit`, `current`, `max`.

### 20.3 Estado de la organización — funciones puras

```ts
type Status = "TRIALING" | "ACTIVE" | "PAST_DUE" | "READ_ONLY" | "CANCELED" | "SUSPENDED";
export const TRIAL_DAYS = 30, GRACE_DAYS = 7, RETENTION_DAYS_AFTER_CANCEL = 60, RETENTION_DAYS_AFTER_TRIAL = 60;

// full: todo funciona. read_only: se ve todo pero no se envían mensajes, no corren bots/automatizaciones/campañas y la UI no escribe.
// suspended: la plataforma la bloqueó (tampoco entra). Una prueba o gracia ya vencida cuenta como solo lectura DE INMEDIATO.
export function accessMode(org: { status: Status; isInternal: boolean; trialEndsAt: Date | null; graceEndsAt: Date | null }, now: Date): "full" | "read_only" | "suspended" {
  if (org.status === "SUSPENDED") return "suspended";
  if (org.isInternal) return "full";
  switch (org.status) {
    case "ACTIVE": return "full";
    case "TRIALING": return org.trialEndsAt && org.trialEndsAt > now ? "full" : "read_only";
    case "PAST_DUE": return org.graceEndsAt && org.graceEndsAt > now ? "full" : "read_only";
    default: return "read_only";
  }
}
// Tick horario: prueba vencida o gracia vencida → solo lectura.
export function tickTransition(org: { status: Status; isInternal: boolean; trialEndsAt: Date | null; graceEndsAt: Date | null }, now: Date): Status | null {
  if (org.isInternal) return null;
  if (org.status === "TRIALING" && (!org.trialEndsAt || org.trialEndsAt <= now)) return "READ_ONLY";
  if (org.status === "PAST_DUE" && (!org.graceEndsAt || org.graceEndsAt <= now)) return "READ_ONLY";
  return null;
}
// Purga de datos (lo que prometen los términos): cancelada hace ≥60 días, o prueba vencida SIN haber pagado nunca hace ≥60 días.
// Sin fecha de referencia NO se purga (mejor conservar que borrar por error). Una solo-lectura CON suscripción nunca se purga por esta vía.
export function purgeDue(org: { status: Status; isInternal: boolean; canceledAt: Date | null; trialEndsAt: Date | null; stripeSubscriptionId: string | null }, now: Date): boolean {
  if (org.isInternal) return false;
  const DAY = 86_400_000, elapsed = (d: Date) => now.getTime() - d.getTime();
  if (org.status === "CANCELED") return !!org.canceledAt && elapsed(org.canceledAt) >= RETENTION_DAYS_AFTER_CANCEL * DAY;
  if (org.status === "READ_ONLY" && !org.stripeSubscriptionId) return !!org.trialEndsAt && elapsed(org.trialEndsAt) >= RETENTION_DAYS_AFTER_TRIAL * DAY;
  return false;
}
```

- **Alta**: la prueba arranca `TRIALING` en plan **Pro** por **30 días**, **sin tarjeta**.
- **Solo lectura**: toda escritura de sesión responde **402 `read_only`** (se permiten `/api/auth`, `/api/billing`, `/api/usuarios`, notificaciones y exportar/eliminar organización). Los mensajes entrantes **se siguen guardando**. Todo emisor y todo trabajo en segundo plano comprueba el modo antes de actuar (y de gastar IA).
- **Stripe** (`active|trialing` → ACTIVE; `past_due|unpaid` → PAST_DUE con 7 días de gracia y luego READ_ONLY; `canceled|incomplete_expired` → CANCELED con `canceledAt`; `SUSPENDED` nunca lo levanta Stripe). Cada evento vuelve a leer la suscripción, así que el orden no importa; los eventos se deduplican por `event.id`. **No se ha probado contra Stripe real.** En Nexo basta una pantalla "Plan" con el estado simulado.
- **Datos del cliente**: cualquier admin puede **exportar** un JSON completo (usuarios, cuentas, contactos con etiquetas/campos/notas/citas, conversaciones con mensajes, y todo el CRM: empresas, pipelines con reglas de etapa, negocios con cambios de etapa, tareas, vistas, historial; **nunca** secretos ni hashes). Solo el **dueño** puede **eliminar** la organización (confirma con el nombre y su contraseña); cancela la suscripción primero y, si eso falla, no borra nada.

---

## 21. Datos semilla recomendados para Nexo

Para que los reportes y pantallas tengan sentido desde el primer arranque:
1. Organización con `currency` (p. ej. EUR para la demo en España), `timezone` (`Europe/Madrid`) y horario de atención.
2. Los **3 roles** con al menos un usuario de cada uno (mapeo §2) y varios contactos asignados a un `ejecutivo` para ver el filtrado.
3. Pipeline **Ventas** predeterminado con las etapas de §8.1 **o** el de Nexo (Nuevo, Contactado, Propuesta, Negociación, Ganado + **Perdido**, que hoy falta) con `outcome` correcto.
4. Motivos de pérdida de §8.1.
5. Negocios en todas las etapas, con `DealStageChange` coherente (el embudo y el tiempo por etapa salen de ahí: **si siembras negocios sin historial de etapas, el embudo saldrá vacío**).
6. Tareas en las cuatro cubetas (vencida, hoy, próxima, sin fecha) y alguna de regla de etapa.
7. Duplicados a propósito (mismo correo; mismo móvil `52…` y `521…`) para probar fusión.

---

## 22. Criterios de aceptación (pruebas de comportamiento)

Cada línea debe poder verificarse (idealmente con una prueba unitaria sobre las funciones puras).

**Contactos**
1. Crear con correo `A@B.com` y luego otro con `a@b.com` → 409 `duplicate_person` con `reasons:["email"]`.
2. Crear con `525511110001` y otro con `5215511110001` → 409 por teléfono (`phoneKey` iguales).
3. Teléfono de 6 o 16 dígitos → "El teléfono no es válido (usa de 7 a 15 dígitos)".
4. `ejecutivo` crea contacto con `ownerId` ajeno → queda con `ownerId` = él.
5. `ejecutivo` edita contacto cuyo responsable es otro → 403 "Solo puedes editar los registros que tienes asignados".
6. Editar con `expectedVersion` viejo → 409 `version_conflict` con el registro actual.
7. Fusionar A(cliente, sin correo) con B(prospecto, con correo) → destino con correo de B, `CUSTOMER`, y los negocios/tareas de B ahora son de A; B ya no existe.
8. Importar el mismo CSV dos veces → segundo intento 409 `duplicate_import`; sin huella → 400.
9. Importar con `;` como delimitador y BOM → se lee igual que con coma.
10. Con 1000 contactos activos en plan Básico, crear uno más → 402 `plan_limit`; archivar uno y volver a crear → funciona.

**Pipelines y negocios**
11. Guardar un pipeline cuya primera etapa es `WON` → "La primera etapa debe ser una etapa abierta…".
12. Dos etapas "ganado" y "Ganado" en el mismo pipeline → "Hay dos etapas llamadas…".
13. Borrar una etapa con negocios sin `moveTo` → 409 `stage_has_deals` con el conteo; con `moveTo` de otro **tipo** → 400.
14. Archivar el pipeline predeterminado → 409 `default_pipeline`; uno con negocios abiertos → 409 `pipeline_has_open_deals`.
15. Crear negocio directamente en una etapa `WON` → 400 "Un negocio nuevo debe empezar en una etapa abierta…".
16. Mover a una etapa `LOST` sin motivo → 400 "Indica el motivo de pérdida"; con motivo → `status=LOST`, `closedAt` fijo, `lostReasonId` guardado.
17. Mover de `LOST` a una etapa abierta → `closedAt = null`, motivo limpiado, `status=OPEN`.
18. Ganar el primer negocio de un `LEAD` → la persona pasa a `CUSTOMER` (una entrada de historial con `reason: "deal_won"`); ganar el segundo no repite el cambio.
19. Mover a la etapa donde ya está (aun con versión vieja) → sin cambios, sin historial, sin tarea.
20. `probabilityEffective`: ganado 100, perdido 0, abierto con `probability=null` → la de la etapa; con `probability=80` → 80. `weightedAmount(1000, 25) = 250`.
21. `ejecutivo` pide un negocio ajeno → 404 (no 403); intenta crear negocio de contacto ajeno → 403.
22. Etapa con `autoTaskTitle="Llamar"`, `autoTaskDueDays=2`: al entrar se crea 1 tarea a +2 días, asignada al responsable del negocio; reintentar el mismo movimiento no duplica; salir y volver a entrar crea otra.
23. Mover un negocio a otra etapa de **otro pipeline** → `pipelineId` cambia con la etapa.

**Tareas y Mi día**
24. Crear tarea sin contacto, empresa ni negocio → 400. Ligada a un negocio → la persona se completa sola.
25. `computeRemindAt` con aviso en el pasado → `null`; con 60 min antes y vencimiento en 2 h → `dueAt − 60 min`.
26. `ejecutivo` asigna una tarea a otra persona → queda asignada a él mismo; intenta reasignar → 403.
27. Una tarea vencida ayer, una de hoy 23:59 local, una de mañana, una sin fecha → cubetas `overdue`, `today`, `upcoming`, `undated` (probar con zona `America/Mexico_City` y un día de cambio de horario).
28. "Mi día" de un compañero siendo `ejecutivo` → 403; siendo `admin` → ok.
29. Un negocio abierto sin tareas abiertas ni cita futura aparece en "sin siguiente paso"; al crear una tarea abierta, desaparece.

**Reportes**
30. Período sin negocios → todas las tasas `null`, no 0.
31. `winRate(3, 1) = 75.0`; `winRate(0, 0) = null`.
32. Un negocio creado en marzo y ganado en abril: cuenta en `created` de marzo y en `won` de abril; el embudo de marzo lo cuenta como "Ganado".
33. Un negocio que saltó de "Nuevo" directo a "Calificado": el embudo lo cuenta también como "Contactado".
34. Pronóstico: negocio con cierre esperado ayer → `overdue`; sin fecha → `none`; el mes actual alimenta `thisMonth.projected = wonSoFar + expectedWeighted`.
35. `ejecutivo` con `ownerId=otro` en el filtro → se ignora y solo ve lo suyo.
36. Negocios archivados nunca cuentan.

**Historial**
37. La línea de tiempo con 1000 mensajes y 5 actividades devuelve primero lo más nuevo de cualquier fuente y, al paginar con el cursor, no repite ni pierde elementos.
38. Cada cambio de persona/negocio/tarea deja su entrada de historial en la misma operación (si la operación falla, no queda ninguna).

**Plan y permisos**
39. Organización con prueba vencida → `accessMode = "read_only"` al instante (sin esperar al tick) y toda escritura devuelve 402 `read_only`; los mensajes entrantes se guardan.
40. `purgeDue`: cancelada hace 59 días → no; hace 60 → sí; solo lectura con suscripción → nunca.
41. Deshabilitar un usuario con negocios abiertos sin `reassignToUserId` → 409 `needs_reassign`.

---

## 23. Qué NO portar a Nexo

Es infraestructura del servidor o integraciones externas, sin sentido en una demo local:
Stripe real, webhooks reales de Meta/Telegram, colas BullMQ y Redis, cifrado de credenciales (AES-256-GCM), respaldos a S3/R2, el panel de operador `/plataforma`, la guarda anti-SSRF (solo importa con un servidor), Cloudflare Turnstile, analítica de marketing, el límite de peticiones por clave y la API pública autenticada. Si quieres mantener el **contrato**, simúlalos con funciones locales que respeten las mismas reglas y errores.

## 24. Orden de implementación sugerido en Nexo

1. **Capa de datos pura** (`src/lib/rules/`): normalización, duplicados, fusión, `deal-rules`, `task-rules`, `report-rules`, tiempo/zonas — con pruebas de §22.
2. **Modelo**: `Person`, `Company`, `Pipeline/Stage/LossReason`, `Deal`, `DealStageChange`, `Task`, `ActivityLog` y los ajustes de organización (moneda, zona horaria), con las **migraciones de `localStorage`** (cambia `STORAGE_VERSION` o escribe una migración de `nexo:v1` → `nexo:v2`).
3. **Roles** y filtrado en la capa de datos (§4).
4. **Pantallas**, en este orden: Contactos (duplicados, fusión, importar, vistas) → Pipeline/negocios (mover = cerrar, motivo de pérdida, probabilidad) → Tareas y Mi día → Ficha de contacto con línea de tiempo → Informes con las fórmulas reales → Ajustes (pipelines, etapas, motivos, moneda, equipo y roles).
5. Nivel 2: citas, notificaciones, automatizaciones por motor.
6. Nivel 3 solo si el usuario lo pide.

Cuando termines cada bloque, **comprueba los criterios de §22 que le tocan** antes de pasar al siguiente.
