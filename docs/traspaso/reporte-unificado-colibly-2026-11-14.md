# Colibly: revisión unificada de funcionamiento y diseño

**Fecha:** 14 de noviembre de 2026 (hora de la Ciudad de México, UTC-6)  
**Producto:** [app.colibly.com](https://app.colibly.com), el CRM de WhatsApp e Instagram con IA de Colibly  
**Fuentes:**
- QA funcional (`reporte-revision-app-colibly-2026-11-14.md`, `REPORTE-publico.md`, `parte1-3`)
- Revisión del código de diseño (`diseno-codigo-y-referencias.md`, repo `ludaisca/Colibly`, snapshot `bada0cf`)
- Recorrido visual con la cuenta QA a 1920×1072 y 390×844 (`diseno/capturas/`)
- Tres mockups de antes y después (`diseno/mockups/`)

**Alcance:** solo lectura. No se cambió nada en la app ni en el repo y no se subió nada. La cuenta QA no tenía ningún canal conectado, así que las capturas "antes" muestran estados vacíos. Los mockups "después" llevan datos ficticios. La comparación sirve para juzgar el oficio visual, no para comparar lleno contra vacío.

---

## 1. Veredicto

Colibly funciona y su base es más seria de lo que parece a simple vista. No hay hallazgos críticos, el sistema de diseño tiene tokens, contraste probado y foco accesible, y no es una plantilla shadcn sin tocar. Lo que la hace ver "hecha por IA" no es un cliché en particular. Es la suma de muchas decisiones de kit que nadie ha cuestionado:

- la paleta sale directo de Tailwind (cyan-700) y los neutros mezclan dos temperaturas
- cada número va en una tarjeta igual a las demás, con etiqueta en mayúsculas
- cada estado vacío usa el mismo ícono dentro de un cuadro teal
- el panel entra con animaciones escalonadas
- los subtítulos repiten el título
- el menú llega a 22 entradas
- hay un banner azul de prueba en todas las pantallas

A eso se suma la señal más fuerte de todas: cinco paletas y tres parejas tipográficas en tres semanas.

En lo funcional hay 3 hallazgos altos:
- el aviso de cookies tapa el registro en el celular
- la documentación de la API manda a los visitantes al login
- no se pueden editar ni borrar contactos, etiquetas ni citas canceladas

La recomendación es **congelar la marca** (teal, Barlow, la franja de color por cuenta) y **pulir el oficio**:
- una sola familia de neutros
- un acento propio
- una escala de radios
- filas en lugar de tarjetas
- más densidad
- textos con datos

Casi todo se resuelve en `app/globals.css` y en unos 10 componentes de `app/components/ui/`, sin tocar la lógica.

**Conteo unificado:** 34 hallazgos funcionales (0 críticos, 3 altos, 14 medios, 12 bajos y 5 sugerencias) y 25 hallazgos de diseño (D-01 a D-25). Fusionados, quedan **50 acciones** en la lista priorizada.

---

## 2. Lo que ya está bien (no tocar)

**Funcional**
- Login, recuperar contraseña, la 404 e invitación funcionan en español, con `autocomplete` correcto y foco visible. A 390 px no hay desborde horizontal, salvo en el registro.
- Seguridad de base sólida:
  - HSTS de un año, `nosniff`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`
  - sin source maps públicos ni secretos en los bundles
  - sin tracking antes de aceptar cookies
- Funcionan las altas básicas de contactos (los 10 dígitos se formatean a +52), la importación por CSV, el cambio de etapa con el selector, citas (crear, editar y cancelar), macros, API keys, webhooks, bots (crear, conocimiento e indexar), monitores, calificadores y usuarios.
- Rendimiento percibido de 0.5 a 1.5 s en la mayoría de las páginas autenticadas.

**Diseño**
- Hay tokens semánticos de verdad. Los componentes consumen semánticos, así que un cambio de paleta se hace en un solo archivo.
- El contraste está probado con tests (`contrast.test.ts`), hay un piso de 11 px y el foco accesible es visible.
- No hay texto con degradado, morados, emojis en títulos ni sombras grandes en reposo. Los únicos degradados son los fundidos del scroll del embudo, y están bien usados.
- Barlow es distintiva (tiene aire DIN y no es la Inter de todos). El teal ya está en el logo, en el sitio y en los directorios.
- Hay buenas ideas propias que conviene conservar:
  - la **franja de color por cuenta** en la bandeja
  - la **espera como dato protagonista**
  - el subtítulo con dato vivo del embudo ("1 embudo · 0% en etapas ganadas")
  - los totales en MXN por columna
- La barra inferior móvil (Chats, Contactos, Embudo, Más) está bien pensada.

---

## 3. Lista priorizada unificada

**Cómo se ordena:** primero los arreglos de impacto alto y esfuerzo S, después los de impacto alto con esfuerzo M y los medios con esfuerzo S, y al final lo de bajo impacto. **Esfuerzo:** S = menos de un día; M = de 1 a 3 días; L = más de 3 días. **Tipo:** funcional o diseño. La severidad de los hallazgos funcionales es la del QA original. A los de diseño se les asignó con el mismo criterio de impacto en el usuario.

| # | ID | Área | Tipo | Severidad | Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|---|---|
| 1 | QA-001 | Registro (móvil) | Funcional | Alto | Bloquea leer términos e iniciar sesión desde el registro en celular; cuesta altas | S | Aviso de cookies como banda inferior de 1 línea (máx. 56 px) que no tape el formulario; `padding-bottom` del contenido = alto del aviso; quitar el bloqueo de scroll |
| 2 | QA-002 | Docs API | Funcional | Alto | Visitantes de la docs (tráfico SEO) caen en el login | S | `href` absolutos a `https://colibly.com/#producto`, `#como-funciona`, `#preguntas`; logo a `https://colibly.com` |
| 3 | D-01 | Shell (todas) | Diseño | Alto | El banner azul de prueba roba ~40 px en cada pantalla y compite con avisos reales | S | Quitar la banda; tarjeta neutra al pie del sidebar: "Prueba Pro · quedan 10 días", barra de 4 px, enlace "Elegir plan". Banner de color solo si algo bloquea (≤3 días o pago fallido) |
| 4 | D-03 | Tipografía (todas) | Diseño | Alto | H1 de 30 px condensado "grita", cuerpo y etiquetas pequeñas, mayúsculas espaciadas por todos lados | S | `text-page-title` 22/28 Barlow 600 (no Condensed); cuerpo de UI 13/18 peso 500 en nombres/menú; quitar `uppercase tracking-wider` de tabla, menú, pestañas y KPIs |
| 5 | D-05 | Panel, Estadísticas, Embudo, Citas | Diseño | Alto | 4–5 tarjetas KPI idénticas = "dashboard de plantilla" | S | `KpiStrip` como una sola superficie con divisores verticales, etiqueta 12 px minúscula, cifra Condensed 600 28/32, línea de contexto 12 px |
| 6 | D-22 | Proceso (repo) | Diseño | Alto | Sin regla, cada sesión de IA vuelve a "rediseñar" (5 paletas en 3 semanas) | S | Sección "Dirección de diseño congelada" en `AGENTS.md` y `CLAUDE.md`: tokens, fuentes y reglas; cambios solo con aprobación de Luis |
| 7 | QA-018 + D-13 | Contactos, etiquetas, citas | Funcional + diseño | Alto | No se pueden corregir ni borrar datos; quedan residuos; la lista no escala | M (acciones) · L (tabla) | Primero las acciones: "Editar" en la ficha, menú `⋯` de fila con "Eliminar" (confirmación con nombre), administrador de etiquetas (renombrar/borrar), "Eliminar" en citas canceladas. Después, tabla tipada (§4.4) |
| 8 | D-02 | Tokens (`globals.css`) | Diseño | Alto | Paleta = Tailwind; neutros de dos temperaturas se ven "sucios" | M | Aplicar el set de tokens de §5 (neutros cálidos `#F4F4F1`/`#E1E1DB`/`#5E5F5A`, acento `#0F6E7E`); actualizar `contrast.test.ts` |
| 9 | QA-004 + QA-019 + QA-021 + QA-025 | Validación (login, contactos, Mi cuenta) | Funcional | Medio | Mensajes en spanglish y guardados sin validar | S | "El correo es obligatorio" / "El correo no es válido"; teléfono inválido y nombre vacío muestran error junto al campo y bloquean guardar con explicación |
| 10 | QA-020 + D-12 | Embudo | Funcional + diseño | Medio | El gesto natural (arrastrar) no funciona; la tarjeta trae selector y botones | M | Arreglar el drop de `@dnd-kit` (actualizar etapa + persistir); tarjeta de 3 datos (nombre · monto · señal), selector a menú `⋯`, KPIs a una línea resumen |
| 11 | D-09 | Menú lateral | Diseño | Alto | 22 entradas, 6 "Cuentas X", etiquetas pequeñas | M | Agrupar por tarea: Bandeja (Chats, Contactos, Citas) · Ventas (Embudo, Campañas) · Automatización (Bots IA, Automatizaciones, Secuencias, Plantillas) · Reportes (Estadísticas, Calificadores, Monitores) · Canales (una entrada con pestañas). Usuarios, Meta Ads, Configuración y Ayuda al pie. Ítems 30 px, activo en tinta `#E6E6E1` |
| 12 | D-10 | Panel | Diseño | Alto | El checklist de onboarding ocupa toda la vista; "Acceso rápido" duplica el menú | M | Frase de estado con datos arriba, KPI strip, "Chats que esperan" en filas, "Citas de hoy", "Embudo" en barras finas. Checklist al pie del sidebar mientras esté incompleto |
| 13 | QA-007 | Fiabilidad | Funcional | Medio | 503 intermitentes al arrancar (TTFB de hasta 23 s) | M | Revisar healthcheck/readiness en Coolify, arranque en frío y réplicas; alertar si hay 503 |
| 14 | D-06 | Estados vacíos (todas) | Diseño | Medio | Mismo cuadro teal de 64 px con ícono en contactos, citas, plantillas, chats y estadísticas | S | `EmptyState`: ícono Lucide 20 px gris sin caja, titular de 3 a 5 palabras, 1 línea, 1 CTA. Dashboards mantienen estructura con ceros |
| 15 | D-07 | Panel | Diseño | Medio | `fade-in-up` escalonado (24 px, 0.6 s) = "landing generada" | S | Quitar los 16 usos de `animate-fade-in-up` y `animation-delay-*` |
| 16 | D-08 + D-20 | Encabezados y textos | Diseño | Medio | Subtítulos de relleno ("Administra…", "Gestiona…"); vocabulario mezclado (lead/contacto) | S | Subtítulo solo si es dato vivo; vocabulario fijo: Chats, Contactos, Embudo, Etapa, Venta ganada/perdida |
| 17 | QA-023 + QA-024 | Estadísticas | Funcional | Medio | Etiqueta de rango desfasada; bot "Activo" vs "0/2 activos" | S | Etiqueta derivada del estado de la URL; un solo cálculo de estado de bot para tarjeta y tabla |
| 18 | QA-003 | Público (CSP) | Funcional | Medio | Consola llena de errores de CSP en login/registro/docs | S | `prefetch={false}` (o `<a>`) en enlaces a `/privacidad`, `/terminos`, `/blog`, `/precios`, o apuntarlos directo a colibly.com |
| 19 | D-11 | Bandeja (chats) | Diseño | Alto | Lista y conversación con mucho aire; pestañas en mayúsculas; sin ficha lateral | L | 3 paneles (lista 320 · conversación · ficha 288), pestañas Esperando/Mías/Todas/Después, filas 64 px, encabezado 56 px, burbujas radio 10 con cola de 3, compositor blanco radio 8 |
| 20 | QA-022 + D-15 | Configuración | Funcional + diseño | Medio | Pestañas cortadas a 390 px; página larga y repetitiva | M | Dos columnas: subnavegación (Cuenta, Equipo, Canales, IA, Horario, Respuestas rápidas, Campos, API, Plan) + formulario max-w-3xl a la izquierda; en móvil, lista que entra a cada sección |
| 21 | D-16 | Móvil | Diseño | Medio | KPIs y filtros apilados empujan el contenido bajo el pliegue; calendario recortado | M | En móvil: KPIs como línea resumen o scroll horizontal de 1 fila; filtros en un botón "Filtros (2)"; Citas abre en vista Agenda (lista por día) y el mes completo cabe en 7×6 celdas de 48 px |
| 22 | D-14 | Estadísticas / Reportes | Diseño | Medio | Tarjeta dentro de tarjeta; ceros sin sensación de estructura | M | Gráficas con ejes en cero y nota "Sin envíos en este periodo"; 2 columnas con filetes, sin bordes anidados |
| 23 | D-24 | Chats, Bots, Plantillas | Diseño | Medio | Contenido centrado en `max-w-6xl` con aire a los lados | S | Listas y tablas a todo lo ancho con `px-6`; formularios a `max-w-3xl` alineados a la izquierda |
| 24 | D-23 | Plantillas, Campañas, Automatizaciones | Diseño | Medio | CTAs repetidos y controles deshabilitados sin canal | S | Máximo un botón primario por vista; sin canal, ocultar controles y dejar un solo "Conectar WhatsApp" |
| 25 | D-18 | Inputs | Diseño | Medio | Inputs grises sobre blanco: "de plantilla" y bajo contraste del borde | S | Fondo blanco, borde `#93948D` (3.1:1), foco borde teal + anillo 2 px `#E3F0F1`; gris solo deshabilitado |
| 26 | D-04 | Radios | Diseño | Medio | 3, 8, 9, 12, 16, 24 px y full en una misma pantalla | S | Escala 4/6/8/10; `rounded-full` solo avatares, puntos y switch |
| 27 | QA-009 | Registro | Funcional | Medio | Turnstile dice "¡Operación exitosa!" antes de enviar | S | Modo `appearance: interaction-only` o widget invisible |
| 28 | QA-008 | API pública | Funcional | Medio | `/api/health` detalla db y redis | S | Público: solo `{"status":"ok"}`; detalle tras token interno |
| 29 | QA-006 | Docs API | Funcional | Medio | Falta `og:image` | S | Agregar `openGraph.images` en la metadata |
| 30 | QA-010 | Docs API | Funcional | Medio | HTML de 1.18 MB, más de 80 000 px | M | Dividir por secciones o cargar ejemplos bajo demanda |
| 31 | QA-005 | Conectar WhatsApp | Funcional | Medio | Título con la marca duplicada; sin salida | S | `title: "Conectar WhatsApp"` con plantilla; enlaces a login y soporte; responder 404 |
| 32 | QA-031 + D-25 | Login / registro | Diseño | Sugerencia | Mucho espacio vacío y texto pequeño | S | Columna de 400 px, logo arriba a la izquierda, título 22 px, inputs blancos de 40 px, botón a todo lo ancho |
| 33 | D-17 | Badges y etiquetas | Diseño | Bajo | Píldoras con borde "encajonan" las tarjetas | S | Badge sin borde, radio 4, 12 px 500; etiquetas de usuario = punto de color + texto neutro |
| 34 | D-19 | Íconos y avatares | Diseño | Bajo | `Sparkles` como "IA genérica"; caras `blobatar` de juguete | S | La palabra "IA" o un ícono propio; avatares con iniciales sobre el tono de la cuenta |
| 35 | D-21 | Deuda de estilos | Diseño | Bajo | 31 `font-mono` muertos, `font-extrabold` sin peso cargado, dos temas oscuros, brief con texto del generador | M | Limpiar (ver fase 4 del prompt) |
| 36 | QA-016 | Formularios públicos | Funcional | Bajo | Error no asociado al campo | S | `aria-describedby` al id del mensaje |
| 37 | QA-026 | Contactos | Funcional | Bajo | Nombre >120 se recorta en silencio | S | Contador "118/120" al acercarse al límite |
| 38 | QA-027 | Bots IA | Funcional | Bajo | Instrucciones cortadas en la fila | S | `line-clamp-2` + "Ver todo" |
| 39 | QA-028 | Bots IA / Conocimiento | Funcional | Bajo | "Choose File" en inglés | S | Botón propio "Elegir archivo" sobre input oculto |
| 40 | QA-030 | Calificadores | Funcional | Bajo | "la IA" en minúscula tras punto | S | Corregir texto |
| 41 | QA-013 | Rutas | Funcional | Bajo | `/registro` da 404 | S | Redirección 308 a `/register` |
| 42 | QA-011 | Estáticos | Funcional | Bajo | `/favicon.ico` 404 | S | Servir o redirigir al icono |
| 43 | QA-012 | Estáticos | Funcional | Bajo | Iconos y manifest sin caché | S | `Cache-Control: public, max-age=86400` |
| 44 | QA-014 | Cabeceras | Funcional | Bajo | `X-Powered-By: Next.js` | S | `poweredByHeader: false` |
| 45 | QA-015 | CSP | Funcional | Bajo | `unsafe-eval` y `unsafe-inline` | M | Nonces y quitar `unsafe-eval` |
| 46 | QA-029 | Navegación | Funcional | Bajo | URL y contenido desincronizados una vez | M | Intentar reproducir; revisar `router` y caché del cliente |
| 47 | QA-032 | Monitores / Secuencias | Funcional | Sugerencia | Se crean activos por defecto | S | Crear inactivos y pedir "Activar" |
| 48 | QA-033 | Bots IA / Probar | Funcional | Sugerencia | Límite de 10 pruebas sin explicar | S | Mostrar "7 de 10 pruebas · se renuevan el …" |
| 49 | QA-034 | Ayuda | Funcional | Sugerencia | FAQ sin buscador propio | M | Filtro en página |
| 50 | QA-017 | Hardening | Funcional | Sugerencia | Sin `security.txt` ni HSTS preload | S | Publicar `/.well-known/security.txt` |

**Quick wins, en un día de trabajo:** 1, 2, 3, 4, 5, 6, 9, 14, 15, 16, 17, 18, 23, 24, 25 y 26. Con eso se arreglan los dos altos públicos y se quita la mayor parte de la sensación de "plantilla".

---

## 4. Diseño, pantalla por pantalla

La captura de referencia de cada pantalla está en `diseno/capturas/` (escritorio a 1920×1072 y móvil a 390×844).

### 4.1 Shell y menú lateral (`dashboard-escritorio.png`, `dashboard-movil.png`)
- **Problema:**
  - Sidebar blanco de 22 entradas en 12 px, con grupos en MAYÚSCULAS y activo en bloque negro.
  - Banner azul de prueba a todo lo ancho.
  - Logos de colores (WhatsApp, Messenger, Instagram, Telegram) en el menú.
- **Por qué se ve genérico:** es el sidebar por defecto de cualquier kit de admin. El negro sólido pesa demasiado con 22 ítems, y los logos de colores rompen la regla de un solo acento.
- **Cambio:**
  - Sidebar de 232 px con fondo `#F4F4F1` (igual al lienzo) y filete derecho de 1 px `#E1E1DB`.
  - Ítems de 30 px en 13 px peso 500, color `#3B3C38`, íconos Lucide de 16 px con `stroke 1.75` en `#76776F`.
  - Activo en `#E6E6E1` con texto `#17181A`.
  - Grupos en 12 px 500 `#8A8B84`, sin mayúsculas.
  - Contador de chats en espera en ámbar `#9A4A0B`.
  - Prueba y plan en una tarjeta neutra al pie.
  - Sin logos de canal en el menú; van dentro de Canales.
  - Búsqueda "Buscar · Ctrl K" arriba.

### 4.2 Panel (`dashboard-escritorio.png`)
- **Problema:**
  - La vista la domina el checklist "Deja lista tu cuenta" con un recuadro teal "SIGUIENTE PASO".
  - Debajo hay otro aviso azul ("Prepara tu bandeja") y 4 tarjetas KPI iguales.
  - "Acceso rápido" con íconos en cajitas.
  - Todo entra con `fade-in-up`.
  - El subtítulo es "Resumen de la actividad de tus canales".
- **Por qué se ve genérico:** apila tres avisos que dicen lo mismo, repite el menú y usa tarjetas KPI de plantilla.
- **Cambio** (ver mockup):
  - Encabezado de 56 px: "Panel" en 22 px más la fecha en gris.
  - A la derecha, "Ver estadísticas" (secundario) e "Ir a la bandeja" (primario).
  - Frase de estado: "3 chats esperan respuesta · el más antiguo hace 42 min".
  - KPI strip de 5 celdas.
  - En dos columnas (1fr y 372 px):
    - Chats (esperan respuesta y atendidos hace poco), en filas de 52 px con franja de cuenta de 3 px y espera en Condensed sobre fondo ámbar o rojo
    - Bots IA
    - Citas de hoy, en filas de 48 px con la hora en Condensed 16 px
    - Embudo con barras de 6 px
  - Sin cuenta conectada se mantiene la estructura con ceros, más una sola línea de "Conecta tu WhatsApp para recibir mensajes aquí" con un botón.

### 4.3 Chats (`chat-escritorio.png`, `chat-movil.png`)
- **Problema:**
  - Dos paneles con mucho aire.
  - Pestañas "ESPERANDO / TODOS" en mayúsculas de 11 px.
  - El estado vacío de la derecha lleva un ícono en cuadro teal y "Selecciona un chat".
  - Sin ficha del contacto.
- **Por qué se ve genérico:** es el "ícono centrado + texto gris" de cualquier generador, y no aprovecha lo que hacen Front, Intercom o Kommo.
- **Cambio** (ver mockup):
  - Lista de 320 px con pestañas "Esperando 3 · Mías 8 · Todas 64 · Después 2" en 13 px 500 con subrayado de 2 px.
  - Filas de unos 60 px: franja de cuenta, nombre 500 más la cuenta en 12 px gris, vista previa a una línea y espera en Condensed 14 px.
  - Encabezado de conversación de 56 px con nombre, número en `tabular-nums`, "Asignado", "Marcar venta" y un menú `⋯`.
  - Burbujas de 15/21 con radio 10 y cola de 3 px: entrante `#FFFFFF`, saliente `#DCEFEC`, sobre el lienzo `#EEEEEA`. Sin sombras.
  - Nota interna con borde punteado `#93948D`.
  - Compositor blanco con radio 8, herramientas calladas (Respuestas, Plantilla, Adjuntar, "IA · Sugerir respuesta") y un solo botón primario "Enviar".
  - Ficha de 288 px con secciones plegables: Contacto, Trato (etapa editable), Próxima cita, Notas e Historial.
  - Aviso de ventana de 24 h en 12 px gris.

### 4.4 Contactos (`contactos-escritorio.png`, `contactos-panel-escritorio.png`)
- **Problema:**
  - Lista tipo `EntityList` con avatares `blobatar`.
  - Badges tipo píldora con borde.
  - No se puede editar ni borrar (QA-018).
- **Cambio:**
  - Tabla real con filas de 40 px y encabezado `#EEEEEA` en 12 px minúscula.
  - Columnas: checkbox · Nombre (iniciales de 24 px) · Teléfono `+52 55 1234 5678` · Etiquetas (punto y texto, máximo 2 más "+3") · Etapa · Asignado · Última actividad ("hace 2 h").
  - Barra de acciones al seleccionar (Etiquetar, Asignar, Eliminar) y menú `⋯` por fila.
  - Vistas guardadas: "Sin contestar", "VIP" y "Nuevos esta semana".

### 4.5 Embudo (`ventas-escritorio.png`, `ventas-movil.png`)
- **Problema:**
  - 4 tarjetas KPI y un aviso azul antes del tablero.
  - Columnas con puntos "●●○○" y nombres truncados ("QA-Conta…").
  - Cada tarjeta trae su selector de etapa y "Ver contacto", y aun así no se puede arrastrar (QA-020).
  - Las columnas vacías ocupan la altura completa con "Sin leads".
- **Cambio** (ver mockup):
  - Título "Embudo" y selector del embudo en la misma línea.
  - Una línea de resumen: "14 tratos abiertos · $35,300 en juego · 4 ganados y 1 perdido en 30 días · 2 sin movimiento en más de 3 días".
  - Filtros como chips de 28 px.
  - Columnas `#EEEEEA` sin borde, de radio 10, con encabezado que lleva punto de color, nombre 600, conteo y total en Condensed 15 px.
  - Tarjeta blanca de radio 8 con tres datos:
    - nombre más avatar de 20 px
    - monto en Condensed 16 px y servicio
    - señal: ámbar "Sin movimiento 4 d", rojo a partir de 6 d, gris para el siguiente paso
  - "Agregar trato" en línea. Sombra solo al arrastrar.
  - En el celular, una columna a la vez con pestañas de etapa y conteo.

### 4.6 Citas (`citas-lista-escritorio.png`, `citas-calendario-escritorio.png`, `citas-calendario-movil.png`)
- **Problema:**
  - 4 tarjetas KPI (Hoy, Esta semana, Vencidas, Total) encima del calendario.
  - En el celular, el mes no cabe y los KPIs empujan el calendario bajo el pliegue.
- **Cambio:**
  - Línea de resumen ("Hoy 5 · semana 18 · 1 vencida").
  - En escritorio, Semana como vista por defecto, con columnas por día y bloques de color tenue por servicio.
  - En el celular, la vista "Agenda", una lista por día con la hora en Condensed. El mes queda como opción con celdas de 48 px y puntos.

### 4.7 Bots IA, Automatizaciones, Monitores, Plantillas (`bots-*`, `automatizaciones-*`, `monitores-*`, `plantillas-*`)
- **Problema:**
  - Una sola fila de bot perdida en una página de 1920 px.
  - Plantillas con controles deshabilitados más un estado vacío con ícono en caja.
  - Automatizaciones con 3 tarjetas de plantilla y el ícono en caja.
- **Cambio:**
  - Listas a todo lo ancho, en filas de 52 px: nombre, canal, estado con punto verde y la palabra "Activo", y una métrica a la derecha ("132 respuestas esta semana").
  - Las plantillas de automatización como filas ("Nuevo lead → asignar y saludar" con "Usar"), no como tarjetas.
  - Sin canal, no se muestran controles deshabilitados: solo una línea y "Conectar WhatsApp".

### 4.8 Estadísticas y Reportes (`estadisticas-*`, `reportes-*`)
- **Problema:**
  - 5 tarjetas KPI con 0, 0/1 y 0/0.
  - Estados vacíos con borde dentro de tarjetas.
  - Un ícono en caja dentro de "Mensajes por campaña".
  - Una columna derecha con 4 tarjetas sueltas.
- **Cambio:**
  - KPI strip.
  - Gráficas con ejes en cero y la nota "Sin envíos en este periodo" en 12 px.
  - Dos columnas separadas por filetes de 1 px, sin tarjeta dentro de tarjeta.
  - Series de las gráficas en `#0F6E7E`, `#7A6A3A`, `#5B6FA6`, `#9C5B7A` y `#8A8B84`. El ámbar y el rojo se reservan para alertas.

### 4.9 Configuración, Plan, API, Ayuda (`config-*`, `plan-*`, `api-*`, `ayuda-*`)
- **Problema:**
  - Página larga de tarjetas apiladas con pestañas arriba, que en el celular se cortan (QA-022).
  - "Canales disponibles" repite un "Disponible" en verde por cada canal.
  - Inputs grises.
- **Cambio:**
  - Subnavegación izquierda de 200 px y formulario `max-w-3xl` alineado a la izquierda.
  - Cada bloque lleva título y descripción corta a la izquierda (240 px) y los campos a la derecha, con filetes entre bloques.
  - Guardado por sección y barra fija de "Cambios sin guardar".
  - Inputs blancos de 32 px con borde `#93948D`.
  - Los canales en una tabla de una línea cada uno, con el estado real ("Conectado · +52 55…" o "Sin conectar").

### 4.10 Login y registro (`publico/login-1440.png`, `publico/register-390.png`)
- **Problema:** mucho aire, texto pequeño y el aviso de cookies tapa el registro en el celular.
- **Cambio:**
  - Columna de 400 px, logo arriba a la izquierda y título "Entra a Colibly" o "Crea tu cuenta" en 22 px.
  - Inputs blancos de 40 px y botón a todo lo ancho.
  - Aviso de cookies como banda inferior de una línea.

---

## 5. Set de tokens propuesto

Estos valores reemplazan a los de la capa semántica y del bloque Andén en `app/globals.css`. Se conservan el teal y Barlow.

**Color, tema claro**

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#F4F4F1` | lienzo y sidebar |
| `--surface` | `#FFFFFF` | paneles, tablas, modales, inputs |
| `--surface-light` | `#EEEEEA` | hover de fila, encabezado de tabla, columnas del embudo, lienzo del chat |
| `--nav-active` (nuevo) | `#E6E6E1` | ítem activo y fila seleccionada |
| `--border` | `#E1E1DB` | filetes de 1 px |
| `--border-strong` (nuevo) | `#93948D` | borde de inputs, selects y checkbox (3.1:1) |
| `--foreground` | `#17181A` | texto |
| `--muted` | `#5E5F5A` | texto 2 (6.4:1 sobre blanco) |
| `--subtle` (renombra `--muted-strong`) | `#8A8B84` | metadatos de 12 px o más y placeholders |
| `--accent` | `#0F6E7E` | primario, switch, progreso (5.9:1 con blanco) |
| `--accent-hover` | `#0B5864` | |
| `--accent-ink` | `#0B5D6A` | enlaces, íconos activos (7.5:1) |
| `--accent-subtle` | `#E3F0F1` | anillo de foco, selección |
| `--accent-muted` | `#A9CFD4` | borde de chip activo |
| `--success` / bg / border | `#1F6B45` / `#E6F2EA` / `#BCDCC8` | |
| `--warning` / bg / border | `#9A4A0B` / `#FBF0E2` / `#EFCFA6` | solo espera y SLA |
| `--danger` / bg / border | `#B3261E` / `#FBE9E7` / `#F0BDB8` | errores, SLA vencido |
| `--info` / bg / border | `#2F5D8A` / `#EAF0F6` / `#C3D3E4` | avisos neutrales |
| `--bubble-in` / `--bubble-out` | `#FFFFFF` / `#DCEFEC` | burbujas |
| Series de gráficas | `#0F6E7E` `#7A6A3A` `#5B6FA6` `#9C5B7A` `#8A8B84` | |

**Tema oscuro (uno solo):** lienzo `#111211`, superficie `#18191A`, superficie 2 `#222321`, borde `#2E2F2C`, texto `#ECECE8`, texto 2 `#A3A49E`, relleno de acento `#0F6E7E`, acento de texto y foco `#5FB8C4`. Se eliminan el AMOLED `#000` y el bloque duplicado.

**Se quitan:** el coral `--accent-2` del panel y los primitivos sin uso (`--teal-300/400`, `--coral-*`, `--graphite-*`, la pizarra `#5B6B7A` y `#7A96A8`).

**Tipografía:** Barlow 400/500/600 y Barlow Condensed 600/700 (solo para cifras).

| Token | Tamaño/interlineado | Peso |
|---|---|---|
| `text-micro` | 11/16 | 500 |
| `text-xs` | 12/16 | 500 |
| `text-sm` (cuerpo de UI) | 13/18 | 400–500 |
| `text-base` (burbujas, párrafos) | 15/22 | 400 |
| `text-title` (nuevo) | 16/22 | 600, −0.01em |
| `text-page-title` | 22/28 | 600, −0.015em, Barlow normal |
| `text-figure` (nuevo) | 28/32 | Condensed 600, `tabular-nums` |
| `text-hero` | 40/44 | Condensed 600 (solo 404/500) |

**Radios:** `--radius-xs` 4 (badges, chips, checkbox) · `--radius-sm` 6 (botones, inputs, menú) · `--radius-md` 8 (tarjetas del embudo, popovers) · `--radius-lg` 10 (paneles, tablas, modales) · burbuja 10 con cola de 3 · `rounded-full` solo para avatares, puntos y switch.

**Sombras:** ninguna en reposo · `--shadow-sm` `0 1px 2px rgb(23 24 26 / .06)` (arrastre y hover) · `--shadow-md` `0 4px 12px rgb(23 24 26 / .08), 0 1px 3px rgb(23 24 26 / .06)` (menús) · `--shadow-lg` `0 16px 40px rgb(23 24 26 / .14)` (modales).

**Espaciado y densidad:**
- Base de 4 px, con ritmo 4 · 8 · 12 · 16 · 24 · 32.
- Fila de lista de 44 a 52 px y fila de tabla de 40 px.
- Encabezado de página de 56 px.
- Botones de 28, 32 o 40 px.

**Movimiento:** solo transiciones de color de 120 ms y la apertura de menús y modales en 150 a 200 ms (opacidad más 4 px). Sin animaciones de entrada.

---

## 6. Mockups: antes y después

Los mockups son HTML autocontenido con las fuentes Barlow embebidas y los tokens de §5, renderizados a 1440×900 con Chromium headless. Los datos son ficticios: el negocio "Estética Brisa", sus clientas y el equipo. A la izquierda va la captura real de la cuenta QA (sin canales) y a la derecha el mockup.

### Panel
![Panel: antes y después](diseno/mockups/panel-antes-despues.png)

### Chats (bandeja)
![Chats: antes y después](diseno/mockups/chat-antes-despues.png)

### Embudo de ventas
![Embudo: antes y después](diseno/mockups/embudo-antes-despues.png)

Archivos sueltos en `diseno/mockups/`: `panel-despues.html/.png`, `chat-despues.html/.png` y `embudo-despues.html/.png`.

**Qué demuestran los mockups:**
- un solo acento, usado solo en acciones y foco
- neutros de una temperatura
- filas en lugar de tarjetas
- cifras en Condensed con `tabular-nums`
- encabezados de 56 px sin subtítulo de relleno
- estados de espera en ámbar y rojo como única nota de color "de alerta"
- sin degradados, emojis ni íconos en caja

**Qué no demuestran:** el estado sin datos. Para ese caso aplica la regla de §4.2: misma estructura con ceros y un solo CTA.

---

## 7. Referencias

- Linear, rediseño de UI: [Karri Saarinen, "How we redesigned the Linear UI"](https://karrisaarinen.com/posts/how-we-redesigned-the-linear-ui/) · [Changelog 2024](https://linear.app/changelog/2024-03-20-new-linear-ui)
- Attio, tablas densas y una sola nota de color: [Gummble, "CRM App UI"](https://gummble.com/blog/crm-app-ui-design-examples) · [Design Atlas: Attio](https://geoffreymanda.github.io/design-atlas/styles/attio.html)
- Intercom Inbox, 3 paneles colapsables: [Intercom Help](https://www.intercom.com/help/en/articles/7911926-customize-the-inbox-to-suit-you-and-how-you-work-best)
- Front, Abiertos/Después/Hechos y encabezado compacto: [Front, inbox redesign](https://front.com/blog/front-inbox-redesign)
- Pipedrive, tarjeta de 3 datos y totales por etapa: [Pipeline view](https://support.pipedrive.com/en/article/pipeline-view) · [Totales por etapa](https://support.pipedrive.com/en/article/how-can-i-see-the-total-value-of-my-deals-by-stage-or-pipeline)
- HubSpot, navegación por trabajo y lienzo cálido: [HubSpot Canvas](https://github.com/HubSpot/canvas/)
- Kommo, menú corto y acciones dentro del chat: [Nuevo menú izquierdo](https://support.kommo.com/docs/es/kommos-new-left-menu) · [Chat inbox](https://support.kommo.com/resources/docs/es/kommo-chat-inbox-overview)
- Leadsales, embudo por color y Vendido/Perdido desde el chat: [Embudos de venta](https://leadsales.io/blog/embudos-de-venta-en-leadsales/) · [Qué es Leadsales](https://leadsales.io/blog/leadsales-que-es-como-funciona/)
- Estados vacíos: [Northbase, Empty states (10 sistemas)](https://www.northbase.design/patterns/empty-states)

---

## 8. Datos de prueba que quedan por limpiar (en base de datos)

Workspace **Prueba Bobert QA**. La UI no permite borrar estos registros (QA-018), así que hay que quitarlos en la base o en un panel de administración:

- Contacto / lead **QA-Contacto**
- Contacto / lead **QA-Importado** (alta por CSV)
- Etiqueta global **QA-Etiqueta**
- Cita cancelada **QA-Cita Editada**

Todo lo demás que se creó (QA-Etapa, QA-Macro, QA-key, QA-webhook, QA-Bot y sus documentos, QA-Monitor, QA-Calificador y QA-Equipo) ya se eliminó. No se guardó ningún cambio de configuración.

---

## 9. Límites

- Sin canal conectado no se probaron envíos, plantillas reales, campañas, el editor de automatizaciones ni secuencias de punta a punta.
- La revisión de código cubrió unos 70 archivos de los ~320 del panel. Las cuentas de usos (31 `font-mono`, 16 `fade-in-up`) son de esos archivos, así que en todo el repo serán más.
- Los mockups muestran una dirección, no un spec cerrado. Hay que validar el contraste de los pares nuevos con `contrast.test.ts` antes de fusionar.
- El prompt para Claude Code está en `/workspace/prompt-claude-rediseno-y-fixes-colibly-2026-11.txt`.

*Revisión del 14 de noviembre de 2026 (America/Mexico_City). Imparcial: no se suavizaron severidades ni se agregaron hallazgos sin evidencia.*
