# Segunda revisión de Chatwoot y Twenty: qué más traer a Colibly

**Fecha:** 2026-11-01 · **Rama:** `feat/inbox-operativa`
**Fuentes:** el código de `/data/Proyectos/colibly-bench/{chatwoot,twenty}` (Chatwoot `0e3f51d`, Twenty `62dda814`, ambos del 30-oct-2026) y capturas de las dos apps corriendo en `localhost:3001` y `localhost:3002`. Cada "falta en Colibly" se comprobó con grep sobre este repo, no de memoria.

**Qué no repite este documento.** La primera ronda ([`GAP_ANALYSIS.md`](../../colibly-bench/GAP_ANALYSIS.md) y [`PLAN_MEJORAS_FASES_2026-11-01.md`](PLAN_MEJORAS_FASES_2026-11-01.md)) ya trajo snooze, prioridad, reclamar chat, acciones masivas, vistas guardadas, typing, borradores, timeline, reportes por rango, palette con acciones, deep link, importación CSV, CSAT, macros, atributos de conversación y calendario. Siguen pendientes de esa ronda: SLA, equipos, sugerencias de FAQ con IA y fusionar duplicados. Las **notas internas y @menciones** se descartaron a propósito (decisión 14 del plan) y aquí tampoco se proponen.

**Qué ya tiene Colibly** (se revisó y no se propone): respuesta citada (*reply-to*), grabadora de notas de voz en el compositor, sugerir y reescribir con IA, plantillas de automatización (menú de bienvenida, triaje con IA, lead de anuncio, post-cita), checklist de onboarding y condición "en horario" en automatizaciones.

---

## 1. Funciones

### P1: alto impacto para pymes que venden por WhatsApp (S = días, M = 1–2 semanas)

| # | Función | Quién la tiene | Qué haría en Colibly | Esfuerzo |
|---|---|---|---|---|
| 1 | **Transcribir notas de voz para el agente** | Chatwoot (`audio_transcriptions`, ajuste por cuenta) | En México se escribe con notas de voz. Hoy el bot "entiende" el audio con Gemini, pero el ejecutivo tiene que escucharlo. Propuesta: botón "Transcribir" en la burbuja de audio (1 crédito de IA) y opción por organización para transcribir todo lo entrante. Se guarda en `WAMessage.transcript` / `ChannelMessage.transcript` y entra en la búsqueda (#2). | S |
| 2 | **Buscar dentro de los mensajes** | Chatwoot (`search_with_gin`, búsqueda avanzada) | Era el P1 #5 de la primera ronda y sigue faltando: `lib/chats/query.ts` solo busca en `name`, `remoteJid` y `lastMessage`. Propuesta: índice GIN `pg_trgm` sobre `WAMessage.body` y `ChannelMessage.body` (más las transcripciones), con resultados por mensaje que salten al punto exacto del hilo. | M |
| 3 | **Valor del trato en el pipeline** | Twenty (`opportunity.amount`, `closeDate`, `owner`; suma por columna en el kanban) | El kanban de `/ventas` no tiene montos, así que el dueño no ve "cuánto hay en Propuesta". Propuesta: `Contact.dealValue` (Decimal, MXN), `expectedCloseAt` y responsable; total por columna en la cabecera; monto ganado y perdido por periodo en reportes (ya existe `LeadOutcomeEvent`). | S–M |
| 4 | **"Esperando respuesta" (desatendido)** | Chatwoot (vista *Desatendido*: el último mensaje es del cliente y nadie contestó) | Hoy existe `hasReplied` (si el *lead* respondió), pero no lo inverso. Propuesta: `lastInboundAt`/`lastOutboundAt` en `WAChat` y `Conversation` (los mantienen el ingest y los envíos), filtro `awaiting=1` y un reloj en la fila ("espera 25 min") que pasa a ámbar o rojo según el tiempo. Además es la base del SLA. | S |
| 5 | **Mensaje fuera de horario** | Chatwoot (`working_hours` + `out_of_office_message` por bandeja) | El motor ya tiene la condición "en horario" y `Organization.businessHour*`, pero no hay una forma de un clic. Propuesta: plantilla de automatización "Fuera de horario" (primer mensaje + condición + respuesta) y un interruptor en Configuración que la publique. Así no hace falta un segundo motor. | S |
| 6 | **Resolver solos los chats inactivos** | Chatwoot (`auto_resolve_after`, mensaje y etiqueta opcionales, `ignore_waiting`) | La bandeja se llena de chats viejos en OPEN. Propuesta: en Configuración, "Resolver tras N horas sin mensajes", con mensaje y etiqueta opcionales, y sin tocar los que esperan respuesta nuestra (#4). Un tick cada 15 min, que emite `conversation.resolved` (dispara el CSAT si está activo). | S |
| 7 | **Disponibilidad del ejecutivo** | Chatwoot (En línea / Ocupado / Fuera de línea, punto en el avatar, tarjeta "Estado del agente" en reportes) | Propuesta: `User.availability` y un punto en el avatar del shell. La autoasignación solo reparte a quien está "En línea", y si el ejecutivo no hace ninguna petición en 10 min pasa solo a "Fuera de línea" (la actividad ya se ve por el polling). | S–M |
| 8 | **Notificaciones push web (PWA)** | Chatwoot (web push y móvil) | Era el P1 #9 y sigue faltando: no hay `PushSubscription` ni service worker. Sin app móvil ni push, se pierden chats. Propuesta: manifest + service worker + Web Push (VAPID), solo para `CHAT_MESSAGE`/`CHAT_ASSIGNED` del asignado. | M |

### P2: pronto

| # | Función | Quién la tiene | Qué haría en Colibly | Esfuerzo |
|---|---|---|---|---|
| 9 | **Mapa de calor de tráfico** (día × hora) | Chatwoot (reporte Resumen, "Tráfico de conversación" y "Resolutions") | Rejilla de 7 × 24 con mensajes entrantes y resoluciones en `/estadisticas/reportes`, para planear turnos. Con la zona horaria de la organización (no la fija actual). | S |
| 10 | **Panel en vivo** | Chatwoot (Abiertos / Desatendido / Sin asignar / Pendientes + estado de agentes, marcado "En vivo") | Una franja de `KpiStrip` arriba de reportes que se refresca cada 30 s, con un punto "En vivo". Depende de #4 y #7. | S |
| 11 | **Rendimiento del bot** | Chatwoot (`conversation_outcomes` y BotReports: chats que resolvió el bot, traspasos, motivo del traspaso) | Hoy medimos lo que *cuesta* el bot, no lo que *resuelve*. Propuesta: por bot, el % de chats cerrados sin respuesta humana, la tasa de traspaso a persona, el tiempo hasta el traspaso y el CSAT del bot contra el humano. Los datos ya existen: `senderId` nulo/no nulo, `handoff`, `CsatResponse`. | M |
| 12 | **Atajos de teclado en la bandeja** | Chatwoot (Alt+J/K, Alt+E, Alt+L…), Twenty (menú de atajos con `?`) | Alt+J/K para chat siguiente/anterior, Alt+E resolver, Alt+A asignarme, Alt+S posponer, `/` buscar y `?` para ver la lista. Se reutilizan las acciones del palette, sin una segunda ruta de mutación. | S |
| 13 | **Importación con mapeo de columnas** | Twenty (`spreadsheet-import`: elegir hoja → fila de cabecera → mapear columnas → validar) | Hoy exigimos que las cabeceras se llamen `telefono`/`nombre`. Propuesta: un paso para mapear cada columna a teléfono, nombre, etiqueta o campo personalizado, y una vista previa con las filas inválidas marcadas. | M |
| 14 | **Atributos obligatorios al resolver** | Chatwoot (`conversation_required_attributes`) | `ChatCustomFieldDefinition.required` ya existe, pero no se exige en ningún lado. Propuesta: al resolver, un modal pide los atributos obligatorios vacíos (p. ej. "Motivo de cierre"). Aplicaría en el resolver individual, en las macros y en la acción masiva. | S |
| 15 | **Monitores de temas con IA** | Chatwoot Enterprise (`conversation_monitors`, con plantillas: reembolso, intención de cancelar, competencia, quejas, escalamiento) | Detectar en los chats temas que define el negocio ("pide factura", "menciona a la competencia", "quiere cancelar"), con los mensajes como evidencia y un conteo por periodo. Corre sobre créditos de IA en un tick, como el scoring programado. Sería un diferenciador; reimplementar el comportamiento, no el código. | M |
| 16 | **Variables en respuestas rápidas** | Chatwoot (`{{contact.name}}`, `{{agent.name}}`) | `CannedResponse.content` se inserta tal cual. Propuesta: sustituir `{{nombre}}`, `{{agente}}` y `{{negocio}}` al insertar, con la misma sintaxis que las automatizaciones. | S |
| 17 | **Firma personal del ejecutivo** | Chatwoot (firma de mensaje en el perfil) | Opcional por usuario ("— Ana, Ventas") y añadida al enviar manualmente. Útil cuando varios ejecutivos atienden el mismo número. | S |
| 18 | **2FA y sesiones activas** | Chatwoot (MFA con TOTP, sesiones activas) | TOTP en el perfil y un botón "Cerrar las demás sesiones" (ya existe `sessionVersion`). Lo piden las empresas de 30 a 100 ejecutivos. | M |

### P3: después o solo si el ICP lo pide

- **Empresas** (Chatwoot y Twenty): solo si entran clientes B2B; para pymes B2C no aporta.
- **"Pregúntale a la IA" sobre los datos del CRM** (Twenty, con aprobación antes de modificar registros): llamativo pero caro en créditos; esperar a validar la demanda.
- **Traducción automática** (Chatwoot): baja prioridad para un mercado mexicano.
- **Widget web con formulario previo y marca propia**: ya estaba en el P2 de la primera ronda y sigue pendiente.
- **Favoritos y papelera con restauración** (Twenty): la papelera evita borrar un contacto por error. Es útil, pero toca todas las consultas (`deletedAt`), así que conviene hacerlo junto con el merge.
- **Tamaño de letra en el perfil** (Chatwoot): accesibilidad barata, un ajuste por usuario.

---

## 2. Diseño UI/UX

Observado en las capturas (`localhost:3001` y `localhost:3002`) y en sus componentes.

| # | Patrón | Dónde | Cómo aplicarlo en Colibly | Esfuerzo |
|---|---|---|---|---|
| U1 | **Panel lateral con pestañas y URL** | Twenty: el registro se abre a la derecha (`?panel=/object/person/<id>`) con pestañas Inicio · Cronología · Tareas · "+4 Más", botón de pantalla completa y acciones fijas al pie | El `ContactDrawer` ya tiene `?contacto=` pero muestra todo en un solo scroll largo (próxima cita, campos, tareas, actividad, notas…). Propuesta: pestañas **Resumen · Actividad · Tareas y citas · Campos**, con la pestaña en la URL (`?contacto=<id>&tab=actividad`) y las acciones principales fijas abajo. | S–M |
| U2 | **Totales en la cabecera de cada columna del kanban** | Twenty (`New 80k`, `Screening 75k`…) | Con #3: suma de `dealValue` y número de tarjetas por etapa. Además, un "＋ Nuevo" al pie de cada columna para crear un lead directo en esa etapa. | S |
| U3 | **Fila de cálculos al pie de las tablas** | Twenty ("Calcular": únicos, % vacío, más antiguo… por columna) | En Contactos y en las tablas de reportes: un pie con conteo y % sin teléfono/sin etiqueta. Ayuda a ver de un vistazo la calidad de los datos. | S |
| U4 | **Contadores en las vistas de la bandeja** | Chatwoot (`Mías 0 · Sin asignar 0 · Todos 0`) | **Sin reintroducir las pestañas de estado** (se quitaron a propósito): mostrar el conteo junto a cada vista guardada y a los tres filtros predefinidos del menú de vistas. Se calcula con el mismo `where` de `lib/chats/query.ts`. | S |
| U5 | **Indicador "En vivo"** | Chatwoot (pastilla verde "• En vivo" en las tarjetas que se actualizan solas) | Un punto pulsante (`animate-pulse-live` ya existe) en los KPIs que se refrescan por polling. Así se distingue lo que es en tiempo real de lo histórico. | S |
| U6 | **Estados vacíos que enseñan** | Chatwoot (bandeja vacía con 4 tarjetas ilustradas: conectar canal, invitar equipo, respuestas rápidas, etiquetas) | La bandeja vacía de Colibly es solo texto. Propuesta: reutilizar los pasos de `getOnboardingSteps()` como tarjetas con acción directa en la bandeja vacía y en Contactos. | S |
| U7 | **Ayuda de atajos y pistas en el palette** | Twenty (secciones "Vista actual / Objeto / Espacio de trabajo" con la tecla a la derecha), Chatwoot (modal de atajos) | Agrupar el palette por contexto (Chat actual · Crear · Ir a) y mostrar el atajo de cada acción (con #12). | S |
| U8 | **Fechas relativas con la absoluta al pasar el ratón** | Twenty ("hace 2 días") | Unificar en un componente `<RelativeTime>` (relativa visible, absoluta en `title`) y usarlo en filas, timeline y tarjetas. Hoy cada pantalla formatea a su manera. Debe calcularse con la zona horaria de la organización para no repetir el error de hidratación de "Miembro desde". | S |
| U9 | **Estado del usuario en el avatar del shell** | Chatwoot (punto verde en el avatar de abajo a la izquierda; desde ahí se cambia el estado) | Va con #7: el punto en `EntityAvatar` del usuario en `app-shell` y el selector de estado en el mismo menú de perfil. | S |
| U10 | **Kanban más rico, sin perder densidad** | Twenty (cada tarjeta lleva monto, fecha, empresa y responsable, con iconos alineados) | `lead-card.tsx` ya muestra teléfono, etiquetas, actividad y score. Con #3, añadir monto y fecha estimada de cierre en una línea con iconos, y el avatar del responsable. | S |

**Lo que no conviene copiar del diseño:**
- El editor de layouts y tableros con widgets de Twenty (es XL y ya se descartó en la primera ronda).
- El sidebar de Chatwoot con subniveles para cada reporte: Colibly tiene 5 grupos y está más limpio.
- Las tablas editables celda por celda de Twenty: en un CRM conversacional la edición vive en el drawer, y la edición en línea complica los permisos por rol.

---

## 3. Recomendación de orden

1. **Bandeja que no deja leads sin atender** (1–2 semanas): #4 esperando respuesta, #6 auto-resolver, #5 fuera de horario, U4 contadores y #12 atajos. Es barato y se nota en cualquier demo.
2. **Voz y búsqueda** (1–2 semanas): #1 transcribir notas de voz y #2 buscar en mensajes, juntas, porque la transcripción alimenta la búsqueda.
3. **Ventas con dinero** (1 semana): #3 valor del trato, U2 totales del kanban, U10 tarjeta y U1 drawer con pestañas.
4. **Equipo en tiempo real** (2 semanas): #7 disponibilidad, U9, #10 panel en vivo, #9 mapa de calor y #8 push web.
5. Después: #11 rendimiento del bot, #15 monitores con IA, #13 importación con mapeo, #14 atributos obligatorios, #16–#18.

Los puntos 1 y 4 dejan lista la base para el **SLA** pendiente: `lastInboundAt` da el tiempo de espera, la disponibilidad dice a quién avisar y el horario ya existe. Conviene hacer el SLA justo después del bloque 4 y no antes.

## 4. Licencias

Chatwoot: `app/` es MIT; `enterprise/` (monitores, `conversation_outcomes`, SLA, capacidad, MFA en parte) es comercial. Twenty: AGPLv3 con archivos `@license Enterprise`. **Se toman ideas de producto y comportamiento, no código.**
