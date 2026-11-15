# Revisión del trabajo de Claude Code · Colibly · 15 nov 2026

Revisé el repo `ludaisca/Colibly` (rama main) contra `docs/prompts/prompt-claude-revision-unificada-colibly-2026-11.txt` y `reporte-unificado-colibly-2026-11-14.md`. Fuentes: los diffs de los 9 commits (GitHub), CI, archivos clave en `main` y una verificación rápida en producción (curl a app.colibly.com y colibly.com, y /register a 390 px). Fue una revisión de solo lectura: no cambié nada en el repo.

## 1. Veredicto

**Aprobado, con correcciones.** Claude cumplió la mayor parte del prompt y con buen oficio:
- Los tokens de `app/globals.css` coinciden con los valores pedidos.
- La dirección quedó congelada en AGENTS.md y CLAUDE.md.
- Las APIs nuevas tienen autorización por rol y alcance por workspace, con pruebas.
- No agregó dependencias ni migraciones, y CI está en verde.
- Ya está desplegado: QA-001, 002, 008, 011, 013, 014, 012 y 017 responden bien en producción.

Lo que falta corregir:
1. **Alta:** en el teléfono, el embudo probablemente no deja hacer scroll sobre las tarjetas y el arrastre se dispara solo. La combinación de `touch-none` con `PointerSensor` anula la demora del `TouchSensor`. No lo probaron en un dispositivo táctil.
2. **Media:** al eliminar un contacto se borra mucho más de lo que dice el aviso: citas, notas, tareas e historial de ventas, así que las ventas ganadas dejan de contar en los reportes.
3. **Media:** las acciones en lote de Contactos cuentan un error de red como éxito.
4. **Media:** el enlace "Detalles" del aviso de cookies queda cortado a 390 px. Lo verifiqué en producción.
5. **Media:** los enlaces del sitio pasaron a absolutos también en colibly.com, así que cada clic recarga la página completa.
6. **Media:** quedaron pendientes varias piezas de la fase 3:
   - el encabezado de conversación con "Marcar venta"
   - la ficha de 288 px con secciones plegables
   - la vista Agenda por defecto de Citas en el teléfono
   - QA-102, QA-103 y QA-104

## 2. Commits revisados (después de a0dc2c6)

Todos los commits son del 14 nov 2026, hora de CDMX (UTC-6). Subieron en un solo push.

| Hash | Hora (CDMX) | Commit | Archivos |
|---|---|---|---|
| ab406c5 | 20:46 | fase 1: arreglos de QA altos y quick wins | 35 |
| ae75d1d | 20:53 | fase 2: tokens, tipografía y radios congelados | 38 |
| 7a32808 | 20:57 | fase 3a: componentes base | 29 |
| f017bc0 | 21:02 | fase 3b: menú por tareas | 16 |
| 192bb45 | 21:08 | fase 3c (embudo): arrastre de toda la tarjeta y tablero nuevo | 91 |
| 60100ab | 21:21 | fase 3c: Panel, Contactos, Citas y Configuración | 36 |
| 63174cb | 21:31 | fase 3c: Chats, listas, Estadísticas, Bots y acceso | 57 |
| 28067c5 | 21:36 | fase 4: limpieza de estilos y briefs obsoletos | 50 |
| da43119 | 21:44 | fase 5: verificación visual y funcional y reporte | 35 (+capturas) |

**CI:** la ejecución 43673928197 corrió solo sobre `da43119`, de 21:47 a 21:52 CDMX, y pasó:
- tsc, lint y tests
- build de producción con Docker

Los commits intermedios no tuvieron CI propio. El prompt pedía un push por fase; Claude hizo uno solo al final. Su reporte dice que corrió lint, tests y build en local al cerrar cada fase.

**Cosas que no tocó:**
- dependencias (`package.json` y `package-lock.json`)
- Prisma (ni esquema ni migraciones)
- secretos (no encontré tokens en los diffs)

## 3. Checklist por fase

Leyenda: ✅ hecho · 🟡 parcial · ❌ no hecho · 🔀 hecho distinto

### Fase 1
| Ítem | Estado | Evidencia |
|---|---|---|
| QA-001 aviso de cookies | ✅ (con detalle) | `app/components/analytics/analytics.tsx`: banda `fixed bottom-0 h-14` y espaciador `h-14` en el flujo; botones "Solo necesarias" y "Aceptar". **En producción a 390x844** se ven y se pueden tocar "Términos", "Aviso de privacidad", "Inicia sesión" y "Crear cuenta" (captura `revision-claude-register-390.png`). Detalle: "Detalles" queda cortado por `truncate` (scrollWidth 229 contra clientWidth 183). |
| QA-002 enlaces de /docs/api | ✅ | `app/(marketing)/layout.tsx` usa `siteUrl("/#producto")`. En producción /docs/api enlaza `https://colibly.com/#producto`, `#como-funciona` y `#preguntas`. |
| QA-003 CSP | 🔀 | Todos los enlaces del layout público pasaron a `<a>` absolutos, incluso en colibly.com (ver bug M4). Los únicos errores de consola en /register vienen del iframe de Turnstile (tercero). |
| QA-004 / QA-016 | ✅ | `lib/validations.ts`: `.min(1,"El correo es obligatorio").email("El correo no es válido")`; `aria-describedby` en login, recuperar y restablecer; `??=` para que gane el primer error. |
| QA-019/021/025/026 | ✅ | `contact-create-modal.tsx`: `normalizeManualPhone` (igual que el servidor), `blockedReason` visible con `aria-describedby`, contador desde 110/120. En Configuración: "Escribe tu nombre" y botón deshabilitado. |
| QA-023 / QA-024 | ✅ | Periodo tomado de searchParams; `lib/bots/display-status.ts` con pruebas. |
| QA-005/011/013/014/028/030 | ✅ | En producción: `/conectar/<inexistente>` responde 404, `/favicon.ico` hace 308 a `/icon.svg`, `/registro` hace 308 a `/register`, y no hay `X-Powered-By`. También quedaron "Elegir archivo" y "La IA". |
| D-01 banner de prueba | ✅ | `components/billing/trial-card.tsx` al pie del menú, solo para admin. Arriba solo aparecen avisos `warning` o `danger` (TRIAL_ENDING_NOTICE_DAYS = 3). |
| D-07 animaciones de entrada | ✅ | Se eliminaron `fade-in-up`, `animation-delay-*` y `animate-fade-in` del `<main>`. |
| QA-008 /api/health | ✅ | Producción responde `{"status":"ok"}`. Si falla responde `degraded` con 503, lo cual es aceptable. |
| QA-032 inactivos por defecto | ✅ | `active ?? false` en la API de monitores y de secuencias, y en el formulario. |

### Fase 2
| Ítem | Estado | Evidencia |
|---|---|---|
| Tokens del tema claro | ✅ | `globals.css`: `--background #F4F4F1`, `--surface-light #EEEEEA`, `--nav-active #E6E6E1`, `--border #E1E1DB`, `--border-strong #93948D`, `--foreground #17181A`, `--muted/--muted-darker #5E5F5A`, `--subtle #8A8B84`, `--accent #0F6E7E` (hover `#0B5864`, ink `#0B5D6A`, subtle `#E3F0F1`, muted `#A9CFD4`), `--ring #0F6E7E`. Los cuatro estados, las burbujas y las series coinciden exactos. Agregó `--accent-strong`, que es un extra válido. |
| Tema oscuro único | ✅ | `#111211 / #18191A / #222321 / #2E2F2C / #ECECE8 / #A3A49E`; relleno `#0F6E7E`; texto de acento y foco `#5FB8C4`. Ya no existen AMOLED, coral ni cian. |
| Hues con croma 0.09 | ✅ | `.hue-N { oklch(0.44 0.09 …) }` |
| Tipografía | ✅ | `app/layout.tsx`: Barlow 400/500/600 y Barlow Condensed 600/700; utilidades `text-title`, `text-page-title`, `text-figure` y `text-hero` con los valores pedidos. |
| Radios y sombras | ✅ | `--radius-xs/sm/md/lg` de 4/6/8/10; sin `--radius-control`; `rounded-bubble-in/out`; las tres sombras exactas. |
| contrast.test + brand-colors | ✅ | Pares nuevos (`border-strong ≥ 3`, `accent-ink ≥ 7`, `muted` sobre `nav-active`). |
| Congelar en AGENTS.md / CLAUDE.md | ✅ | Sección "Dirección de diseño (congelada, nov 2026)" con la frase exacta. También se actualizaron design.json y COLOR.md. |

### Fase 3
| Ítem | Estado | Evidencia |
|---|---|---|
| 3a: button, input, badge, table | ✅ | Alturas `h-7/h-8/h-10` con `rounded-sm`; input `border-border-strong` con foco `border-accent ring-accent-subtle`; badge sin borde `rounded-xs text-xs`; table con encabezado `bg-surface-light`, sin mayúsculas y filas `h-10`. |
| empty-state, kpi-strip, page-header | ✅ | `EmptyState` sin IconBox (ícono 20 px `text-subtle`, `text-title`); KpiStrip con etiqueta en minúscula y `text-figure`. |
| app-shell | ✅ | Menú `w-[232px]`, activo `bg-nav-active`, grupos `text-xs text-subtle`, sin logos de canal. |
| Sparkles → "IA" | ✅ | `ui/ai-mark.tsx` |
| 3b: menú por tareas | ✅ | Panel · Bandeja · Ventas · Automatización · Reportes · Canales (`/canales` con pestañas). Configuración y Ayuda al pie; Usuarios y Meta Ads en el menú de usuario; contador en warning. `/canales` quedó en PROTECTED y EXECUTIVE_BLOCKED. |
| Panel | ✅ | Fecha, frase de estado, KpiStrip de 5, columnas de 1fr y 372 px, filas de 52 px con franja, Citas, Embudo con barras. Sin "Acceso rápido". Detalles en B-7. |
| Chats | 🟡 | Hecho: lista de 320 px, pestañas, burbujas y vacíos. **Falta:** encabezado de 56 px con Asignado, "Marcar venta" y ⋯; ficha derecha de 288 px plegable; compositor con herramientas calladas (los diffs de `chat-conversation-header`, `chat-thread-panel` y `chat-composer` son de 3 a 5 líneas). También falta el contador de "Después" (QA-102). |
| Contactos + QA-018 | ✅ (con bugs) | Tabla, barra de lote, menú ⋯, "Editar" en la ficha, DELETE solo para admin, administrador de etiquetas y citas canceladas. Ver M1–M3. |
| Embudo + QA-020 | 🟡 | Hecho: línea de resumen, columnas, tarjeta de 3 datos, "Agregar trato", pestañas en el teléfono y acción pura con pruebas (`board-move.test.ts`). **El arrastre táctil probablemente está roto (A1).** La prueba es unitaria, no de persistencia. |
| Citas | 🟡 | Hecho: línea de resumen y celdas de 48 px. **No** quedó "Agenda" por defecto en el teléfono, y el día no se puede tocar (QA-104). |
| Estadísticas y Reportes | 🟡 | Hecho: eje en cero y "Sin envíos en este periodo.". No se ve el cambio a "dos columnas con filetes, sin tarjeta dentro de tarjeta". |
| Listas (bots, automatizaciones…) | 🟡 | Hecho: filas de 52 px, "Usar", QA-027 y QA-033; Plantillas sin controles deshabilitados. El resto de pantallas sin canal no se revisó a fondo. |
| Configuración + QA-022 | 🟡 | Hecho: subnavegación de 200 px, `SettingsBlock`, max-w-3xl y lista en el teléfono. La barra "Cambios sin guardar" solo cubre el nombre y usa `md:left-[232px]` fijo. No se ve la tabla de "Canales disponibles". |
| Login y registro + QA-009 | ✅ | Columna de 400 px, títulos, campos de 40 px, Turnstile `interaction-only`. |
| Criterios rg (uppercase, rounded-xl/2xl/[9px], IconBox, Sparkles) | ✅ en el panel | No hay usos en el panel según los diffs y los archivos finales que revisé. Siguen `uppercase` en el sitio público (`_landing-offer.tsx`, `docs/api/page.tsx`), que está fuera del alcance del panel. |

### Fase 4
| Ítem | Estado | Evidencia |
|---|---|---|
| font-mono y el puente | ✅ | `--font-mono` ahora es monoespaciada real; según el commit, 58 usos pasaron a `tabular-nums`. |
| font-bold y font-extrabold | ✅ | Los últimos (`waiting-badge`, `conversation-header`) pasaron a semibold en 28067c5. |
| Comentarios de paletas viejas | ✅ | No queda ninguno de Laguna, Menta o Colibrí en globals.css. Sobra `--text-eyebrow` (B-3). |
| .impeccable y briefs | ✅ | Se quitaron FINISH y seed; el brief Andén se archivó en `docs/archivo/`; DESIGN.md quedó marcado como obsoleto. |
| frontend.md | ✅ | |
| QA-012 Cache-Control | ✅ | En producción, `/icon.svg` y `/manifest.webmanifest` responden `public, max-age=86400`. |
| QA-017 security.txt | 🔀 | Usa `BRAND_CONTACT_EMAIL`, que en producción es contacto@colibly.com. No lo inventó (ya estaba en `lib/brand.ts`), pero el prompt pedía preguntarte. `Policy:` apunta a /privacidad, que no es una política de divulgación. |

### Fase 5 (`docs/qa/reporte-verificacion-2026-11-14.md`)
- Claude lo hizo en **dev local** con una cuenta propia (`qa-sin-canal@colibly.test`, espacio "Spa QA"), no en producción ni en "Prueba Bobert QA".
- Reporta 0 críticos, 0 altos, 1 medio y 3 bajos (QA-101 a QA-107), 1,430 pruebas en verde y 22 pantallas sin desborde a 390 px.
- No pudo probar:
  - el aviso de cookies (yo lo verifiqué en producción y está bien)
  - Turnstile
  - canales reales
  - roles limitados
  - el arrastre táctil
- Sus pendientes coinciden con los míos.
- **Los datos de QA en producción siguen ahí:** QA-Contacto, QA-Importado, QA-Etiqueta y "QA-Cita Editada" en "Prueba Bobert QA". Ya se pueden borrar desde la interfaz: Contactos → Eliminar, Configuración → Etiquetas, y en Citas primero cancelar y luego eliminar.

## 4. Bugs y regresiones

| ID | Sev. | Dónde | Problema | Corrección |
|---|---|---|---|---|
| A1 | **Alta** | `ventas/_board.tsx`, `pipeline/lead-card.tsx` | La tarjeta completa lleva `touch-none` y el tablero usa `PointerSensor` (5 px) junto con `TouchSensor` (200 ms). En un teléfono, deslizar sobre una tarjeta no hace scroll y el arrastre arranca a los 5 px, así que la demora no sirve. No se probó en un dispositivo táctil. | Usar `MouseSensor` (distance 5) + `TouchSensor` (delay 200, tolerance 6) + `KeyboardSensor` solo con Space, y `touch-manipulation` en la tarjeta. Agregar una prueba con hasTouch. |
| M1 | Media | `api/whatsapp/contacts/[id]` (DELETE) y el aviso | La cascada del esquema borra citas, notas, tareas, actividad, CSAT, LeadOutcomeEvent (ventas ganadas de los reportes), MetaConversionEvent, inscripciones y corridas de automatización. El aviso solo dice "chats y mensajes". | Corregir el texto. Decidir aparte si conservar el historial de ventas; eso requiere una migración y tu aprobación. |
| M2 | Media | `contactos/_table.tsx`, `runEach` | `if (res && !res.ok)`: un fallo de red cuenta como éxito y muestra un toast verde. | `if (!res \|\| !res.ok) failed++` |
| M3 | Media | Asignar en lote | Toma las personas de la cuenta del primer contacto y omite los contactos con Conversation (IG, Messenger, Web). | Lista válida para todas las cuentas seleccionadas y endpoint de asignación para conversaciones. |
| M4 | Media | `app/(marketing)/layout.tsx` | Los enlaces absolutos `<a>` también aplican en colibly.com (verificado en el HTML de la portada): cada clic recarga la página y se pierde el prefetch. | Absolutos solo en el host de la app (con `headers()`); `<Link>` en colibly.com. |
| M5 | Media | Aviso de cookies | "Detalles" queda oculto por `truncate` a 390 px, así que la política de cookies no se alcanza en el teléfono. | Sacar el enlace del texto truncado. |
| M6 | Media | Fase 3 incompleta | Chats (encabezado de 56 px, ficha de 288 px, compositor), Citas con Agenda por defecto y día tocable, QA-102, QA-103, barra de Configuración. | Ver prompt, bloque 4. |
| B1 | Baja | `_board.tsx` moveCard | Cierre con estado viejo: con dos movimientos rápidos, el rollback puede duplicar la tarjeta. | Usar actualizaciones funcionales o bloquear mientras el PATCH está en curso. |
| B2 | Baja | "Agregar trato" | El PATCH de la etapa ignora errores. | Revisar `res.ok` y mostrar un toast. |
| B3 | Baja | Accesibilidad del embudo | Enter inicia el arrastre (KeyboardSensor) en vez de abrir la ficha; las pestañas de etapa usan `role=tab` sin tabpanel. | Enter abre la ficha y Space arrastra; quitar los roles o completar el patrón. |
| B4 | Baja | Eliminar etiqueta | Las secuencias o automatizaciones con disparador TAG_ADDED (por tag.id) quedan huérfanas sin aviso. Renombrar no causa problema. | Avisar en la confirmación. |
| B5 | Baja | Panel | "Ventas ganadas 30 días" cuenta toda la organización aunque la persona no sea admin; los chats de WhatsApp en espera sin nombre no muestran el número. | Filtrar por contactScope y pasar `remoteJid`. |
| B6 | Baja | Configuración | La barra "Cambios sin guardar" usa `md:left-[232px]` fijo y queda mal con el menú colapsado (`w-16`). | Usar el ancho real del menú. |
| B7 | Baja | Varios | Sobra `--text-eyebrow`; el badge "Perdido" es `rounded-full` con borde; quedan los textos "Calificar lead" y "Nueva fuente de leads". | Ver prompt, bloque 5. |
| B8 | Baja | security.txt | `Policy:` apunta al aviso de privacidad. | Quitarlo o crear /seguridad. |
| B9 | Baja | Menú | El contador de chats en espera se calcula en el layout (RSC) y no se actualiza al navegar del lado del cliente. | Aceptable; si molesta, refrescarlo con un poll ligero. |
| B10 | Info | Proceso | Un solo push en vez de uno por fase; CI solo cubrió el último commit. | Pedir un push por bloque. |

**Seguridad y aislamiento entre workspaces: bien.**
- `DELETE /contacts/[id]`: solo admin (`forbidRoles user/ejecutivo`), busca con `contactScopeWhere` (404 fuera del alcance) y borra en `$transaction`.
- `PATCH/DELETE /tags/[id]`: solo admin; `findOwnTag` limita a las cuentas de la persona o a las etiquetas sin canal de su organización; zod en el cuerpo; 409 con P2002.
- `DELETE /appointments/[id]`: solo citas `CANCELLED` (409 para las demás), con el alcance que ya existía.
- `POST /contacts/[id]/tags` por nombre: crea la etiqueta en la cuenta del propio contacto ya validado.
- Todas tienen pruebas de 401, 403 o 404.
- `/canales` está en PROTECTED y EXECUTIVE_BLOCKED.

Sin migraciones destructivas, porque no hay migraciones. Sin dependencias nuevas. Sin secretos.

**Accesibilidad:**
- El foco visible se conserva (`:focus-visible` global y anillo en inputs).
- El bloque `prefers-reduced-motion` se mantiene.
- Los pendientes están en A1 y B3.

## 5. Lo que tienes que decidir tú
1. ¿Conservar el historial de ventas al eliminar un contacto? Hoy se borra (M1) y cambiarlo requiere migración.
2. ¿Buzón de seguridad propio para security.txt o se queda contacto@colibly.com?
3. ¿Borro yo los datos QA- de "Prueba Bobert QA" desde la interfaz, ahora que existe Eliminar?

## 6. Correcciones para Claude (prompt listo para pegar)

Guardado también como `/workspace/prompt-claude-correcciones-revision-2026-11-15.txt`.

```text
PROMPT PARA CLAUDE CODE · Colibly · Correcciones de la revisión unificada (15 nov 2026)
Repo: ludaisca/Colibly, rama main (punto de partida: da43119). Contexto: revisamos tus commits ab406c5 … da43119 contra docs/prompts/prompt-claude-revision-unificada-colibly-2026-11.txt. El trabajo quedó bien en general (tokens exactos, dirección congelada, QA-001/002/008/011/013/014/017/012 verificados en producción). Abajo van las correcciones, en orden de prioridad.

REGLAS (las mismas de antes)
- Lee AGENTS.md y CLAUDE.md ("Dirección de diseño (congelada, nov 2026)") antes de empezar. No cambies paleta, fuentes ni metáfora visual.
- Sin dependencias nuevas. Sin cambios de esquema de Prisma ni migraciones (si alguno te parece indispensable, NO lo hagas: déjalo descrito en el resumen para que Luis decida).
- Textos en español de México, tuteo, sin "¡". "contacto" (no "lead") y "trato" para la tarjeta del embudo.
- Al cerrar cada bloque: npm run lint, tsc --noEmit, npm test y npm run build en verde. Un commit por bloque ("correcciones N: ...") y push a main al cerrar CADA bloque (la vez pasada todo subió en un solo push y CI solo corrió sobre el último commit).
- No toques secretos, Coolify ni variables de entorno. No hagas deploy.

BLOQUE 1 · Embudo en el teléfono (alta)
1. app/(dashboard)/ventas/_board.tsx usa PointerSensor (distance 5) + TouchSensor (delay 200) y app/components/pipeline/lead-card.tsx pone `touch-none` en TODA la tarjeta. Resultado probable en el teléfono: deslizar el dedo sobre una tarjeta no hace scroll (touch-action: none) y el PointerSensor arranca el arrastre a los 5 px, así que el TouchSensor con demora nunca actúa.
   Cambia a: useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }), useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }). En la tarjeta reemplaza `touch-none` por `touch-manipulation`.
   Con el KeyboardSensor solo en Space, haz que Enter abra la ficha (onKeyDown Enter → onOpen). Hoy Enter inicia el arrastre y no hay forma de abrir la ficha con teclado salvo el menú ⋯.
   Criterio: en Playwright con emulación táctil (hasTouch, 390x844), un swipe vertical sobre una columna llena hace scroll y no mueve tarjetas; una pulsación larga (≥200 ms) y arrastre sí cambia la etapa y persiste al recargar. Agrega esa prueba (o déjala documentada si el entorno no puede).
2. moveCard usa `boardData`/`totals` del cierre (no actualizaciones funcionales). Con dos movimientos rápidos, el segundo parte de un estado viejo y el rollback del primero puede duplicar la tarjeta. Usa setBoardData/setTotals con función, o bloquea un segundo movimiento de la misma tarjeta mientras el PATCH está en curso.
3. "Agregar trato" (placeNewContact): el PATCH de pipelineStageId ignora errores (`.catch(() => null)` y no revisa res.ok). Si falla, muestra toast "El contacto se creó, pero no se pudo poner en «{etapa}»".
4. Pestañas de etapa en el teléfono: hoy tienen role="tablist"/"tab" sin tabpanel ni flechas. Usa botones con aria-pressed o implementa el patrón completo (aria-controls + flechas izquierda y derecha).

BLOQUE 2 · Contactos y etiquetas (media)
5. app/(dashboard)/whatsapp/contactos/_table.tsx, runEach: `if (res && !res.ok) failed++` cuenta un error de red (res = null) como éxito. Cámbialo a `if (!res || !res.ok) failed++`.
6. Eliminar contacto: el DELETE borra en cascada mucho más de lo que dice el aviso. Según prisma/schema.prisma, con onDelete: Cascade se borran citas (WAAppointment), notas, tareas, actividad, CSAT, LeadOutcomeEvent (las ventas ganadas dejan de contar en "Ventas ganadas 30 días" y en reportes), MetaConversionEvent, inscripciones a secuencias y corridas de automatización. El texto actual solo dice "Se borran sus chats y mensajes".
   - Cambia la descripción del ConfirmDialog a: "Se borran sus chats, mensajes, citas, notas y tareas, y su historial en el embudo (sus ventas ganadas dejan de contar en los reportes). No se puede deshacer."
   - NO cambies el esquema. En el resumen, propón a Luis si conservar el historial de ventas (por ejemplo, LeadOutcomeEvent con SetNull, que requiere migración).
   - Agrega a lib/contacts/__tests__/delete-route.test.ts un caso que confirme que un contacto "sin canal" de OTRA organización responde 404.
7. Asignar en lote: la lista de personas sale de /api/whatsapp/contacts/{primero}/assignees (solo la cuenta del primer contacto), y los contactos con Conversation (Instagram, Messenger, Telegram, Web) se omiten aunque tienen chat. Usa una lista de personas válida para todas las cuentas seleccionadas (o agrupa por cuenta) y asigna también las conversaciones de canal con su endpoint. Si alguna no se pudo, el toast debe decir cuántas.
8. Eliminar etiqueta (app/api/whatsapp/tags/[id]/route.ts + _etiquetas.tsx): si la etiqueta es disparador de una secuencia (TAG_ADDED con triggerValue = tag.id) o de una automatización, avisa en la confirmación ("La usa la secuencia «X»; dejará de dispararse.").

BLOQUE 3 · Sitio público y aviso de cookies (media)
9. app/components/analytics/analytics.tsx: a 390 px el enlace "Detalles" queda dentro del <p> con `truncate` y no se ve (verificado en producción: scrollWidth 229 vs clientWidth 183). Saca el enlace del texto truncado (texto corto "Usamos cookies." + enlace "Detalles" fijo) o usa un botón ⓘ con aria-label. Criterio: a 390x844, "Detalles", "Solo necesarias" y "Aceptar" visibles y tocables.
10. app/(marketing)/layout.tsx: todos los enlaces del encabezado y del pie pasaron a <a href="https://colibly.com/..."> también EN colibly.com. Ahí se pierde la navegación del cliente y el prefetch de Next (cada clic recarga la página entera). Haz los enlaces absolutos solo cuando la página se sirve en el host de la app (por ejemplo, detecta el host con headers() en el layout y pásalo a un helper siteHref(path, isAppHost)). En colibly.com deja <Link> relativo.

BLOQUE 4 · Pendientes de la fase 3 que no quedaron (media)
11. Chats: encabezado de conversación de 56 px con nombre, número tabular-nums, "Asignado a", "Marcar venta" y menú ⋯. Ficha derecha de 288 px con secciones plegables (Contacto, Trato con etapa editable, Próxima cita, Notas, Historial). Compositor blanco radio 8 con herramientas calladas (Respuestas, Plantilla, Adjuntar, IA) y "Enviar" como único primario.
12. Citas: en el teléfono la vista por defecto debe ser "Agenda" (hoy sigue en Mes). En "Mes" a 390 px, tocar un día abre la lista de citas de ese día (QA-104).
13. Chats: contador en la pestaña "Después" (QA-102; agrega snoozed a viewCounts).
14. Contactos: la columna Etapa mezcla estado ("Nuevo") y etapa ("Nuevos"). Muestra siempre el nombre de la etapa del embudo por defecto (QA-103).
15. Configuración: "Cambios sin guardar" usa md:left-[232px] fijo y queda mal con el menú colapsado (w-16). Toma el ancho real del menú (variable CSS o contexto del AppShell). Revisa también "Canales disponibles como tabla de una línea con estado real" y el guardado por sección, que no se ven en los commits.
16. Estadísticas/Reportes: confirma que quedaron sin tarjeta dentro de tarjeta y con dos columnas separadas por filetes; si no, aplícalo.

BLOQUE 5 · Limpieza menor (baja)
17. Panel (app/(dashboard)/dashboard/page.tsx):
   - "Ventas ganadas 30 días" cuenta toda la organización aunque el resto del panel sale del alcance de la persona. Para quien no es admin, filtra LeadOutcomeEvent por contacto dentro de contactScopeWhere.
   - Los chats de WhatsApp en espera usan displayName(c.name, null): pasa remoteJid para que un chat sin nombre muestre el número.
18. app/globals.css: quita --text-eyebrow (el comentario dice que se retiraba en la fase 3) si ya no tiene usos.
19. Badge "Perdido" en chat-conversation-header.tsx: rounded-full + borde contradice la regla (rounded-full solo avatares, puntos y switch). Usa <Badge tone="neutral">.
20. Vocabulario: "Calificar lead" (lead-score-badge.tsx) → "Calificar contacto"; "Nueva fuente de leads" (campanas/automatizacion/nueva) → "Nueva fuente de contactos". Busca otros textos visibles con "lead" en app/(dashboard) y app/components y cámbialos (no toques identificadores ni nombres de modelos).
21. security.txt: el campo Policy apunta al aviso de privacidad, que no es una política de divulgación. Quítalo o crea /seguridad con una política corta. El contacto (contacto@) se queda hasta que Luis defina un buzón propio.

AL TERMINAR
Resumen en español con: hash por bloque, qué quedó pendiente y por qué, y la propuesta sobre conservar el historial de ventas al eliminar contactos (sin aplicarla). No hagas deploy; Luis lo hace.
```
