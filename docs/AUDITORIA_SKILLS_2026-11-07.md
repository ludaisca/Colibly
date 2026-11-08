# Segunda pasada con las skills — 2026-11-07

Rama `feat/nueva-interfaz`, después de cerrar la revisión de pantallas (`REVISION_PANTALLAS_2026-11-07.md`).

## Cómo se hizo

Se revisaron los 161 archivos de interfaz que cambiaron en la rama y el panel completo con cuatro herramientas:

- **Impeccable `detect`** sobre `app/(dashboard)`, `app/components` y `app/csat`.
- **Impeccable `audit`** (`reference/audit.md`), que evalúa cinco dimensiones, y su **piso de calidad** (`reference/craft-floor.md`).
- **Web Design Guidelines** (`command.md`): búsqueda por regla en los archivos cambiados y lectura de cada caso dudoso. Se evaluaron nombres accesibles, campos sin etiqueta, `outline-none`, `transition-all`, `...`, `div` con clic, imágenes, `autoFocus`, fechas armadas a mano, mayúsculas de título, `&`, `overscroll-behavior` y `theme-color`.
- **Medición en el navegador**, teléfono de 390 px:
  - en las 36 rutas: desplazamiento horizontal, texto de menos de 11 px, objetivos táctiles de menos de 24 px, botones sin nombre y errores de consola;
  - errores de hidratación en 8 rutas, con dos zonas horarias (Ciudad de México y Tokio).

## Puntaje (Impeccable audit)

| # | Dimensión | Puntaje | Hallazgo principal |
|---|---|---|---|
| 1 | Accesibilidad | 3 | 7 botones de solo ícono sin nombre accesible (corregido) |
| 2 | Rendimiento | 3 | Sondeo de llamadas ya corregido; las imágenes del chat sin tamaño son contenido de tamaño desconocido |
| 3 | Temas | 4 | Tokens en todo el panel; `theme-color` no coincidía con Andén (corregido) |
| 4 | Responsivo | 3 | Sin desbordes; los objetivos chicos que quedan están dentro de una línea de texto o sin vecinos (excepciones de WCAG 2.5.8) |
| 5 | Integridad | 3 | 5 etiquetas sobre títulos, que el piso de calidad prohíbe (corregido); detector en 0 |
| **Total** | | **16/20** | **Bueno**: los hallazgos se corrigieron en esta misma pasada |

**Veredicto de integridad: pasa.** El panel expresa un sistema propio y coherente:
- la espera como cifra de tablero;
- una línea de color por cuenta, sin choques;
- la selección en tinta;
- los estados como estaciones de la ruta;
- el ámbar y el rojo solo como lámparas.

El detector de Impeccable da 0 avisos.

## Hallazgos y lo que se hizo

- **[P1] Error de hidratación en Calificadores (regresión de la pasada anterior).**
  - **Causa:** el rango por defecto («hoy») se calculaba al renderizar. El servidor usa UTC y el navegador la zona de México, así que después de las 18:00 no coincidían. Métricas de plantilla tenía el mismo riesgo.
  - **Arreglo:** el rango se calcula en el cliente.
  - **Verificación:** 8 rutas sin errores en dos zonas horarias.
- **[P1] 7 botones de solo ícono sin nombre accesible.**
  - **Dónde:**
    - eliminar en Bots, Secuencias y Campañas (borrador y fuente);
    - eliminar borrador en el detalle de campaña;
    - quitar documento del bot;
    - quitar botón de plantilla.
  - **Por qué se escaparon:** el código de cada uno ocupa varias líneas, y la búsqueda anterior las revisaba de a una.
  - **Arreglo:** `aria-label` en los siete, y `Tooltip` donde antes había `title`.
- **[P2] Etiqueta sobre el título («eyebrow»), prohibida sin excepciones por el piso de calidad.**
  - **Dónde:** Configuración de plataforma («INTELIGENCIA ARTIFICIAL» sobre «OpenCode Go y Google»), tres paneles del editor de automatizaciones («Disparador», «Probar» y el grupo del paso) y la encuesta CSAT.
  - **Arreglo:** el título va solo. Lo que decía la etiqueta pasa a una línea debajo, o se elimina si repetía el título.
- **[P2] `theme-color` del panel** era el teal de la marca de día y negro puro de noche.
  - **Arreglo:** ahora es el concreto y el andén de Andén (`BRAND_COLORS.andenConcrete` y `andenNight`), solo en el layout del panel. La landing conserva el suyo.
- **[P2] Cajones sin `overscroll-behavior: contain`.**
  - **Efecto:** al llegar al final del cajón, el desplazamiento seguía con la página de atrás.
  - **Arreglo:** corregido en `Drawer` y en el cajón de contacto.
- **[P3] Superficies del navegador sin tematizar.**
  - **Arreglo:** la selección de texto y el cursor de escritura ahora usan la paleta (`::selection` y `caret-color`).

## Lo que se revisó y no se cambió

- **`outline-none` en ventanas emergentes de Base UI y en campos internos.** Tienen reemplazo: el foco lo marca el contenedor o `data-highlighted`, y la regla global sin capa gana de todos modos.
- **`autoFocus`.** Solo aparece en tres casos, todos justificados:
  - el día activo del calendario al abrirlo;
  - el campo de la búsqueda;
  - el campo de renombrar.
- **Casillas nativas dentro de su `label`.** Son las de Macros, Operación de plataforma, tareas del contacto y selección de chats. El objetivo táctil es la etiqueta completa, así que no hay zonas muertas.
- **Objetivos de menos de 24 px.**
  - Los enlaces «← Volver a…», «Ver contacto», «Por qué» y «Ver mi plan» están dentro de una línea de texto o sin vecinos, que es una excepción de WCAG 2.5.8.
  - Las casillas de días hábiles tienen su etiqueta como objetivo.
- **Imágenes sin `width`/`height`.** Son medios del chat y stickers, de tamaño desconocido, con contenedor de tamaño fijo.
- **«Conectar Página».** «Página» es el nombre del producto de Meta.
- **Reducir movimiento (`0.01ms` global).** La guía de Impeccable lo marca como posible pérdida de información. En el panel no se pierde nada: la cifra de espera y los paneles cambian de estado igual, sin animación.

## Detalles menores: hecho (2026-11-07)

- **Campos nativos a componentes del sistema:**
  - el contador de asientos del plan, la nueva tarea del contacto y los botones del compositor pasan a `Input`;
  - las tareas del contacto, las acciones de Macros y los alcances de tokens de Plataforma pasan a `Checkbox`.
- **Dos errores encontrados en `Checkbox` al hacerlo, ya corregidos:**
  - sin `id`, la etiqueta no quedaba asociada: tocar el texto no marcaba la casilla (ahora `useId`);
  - `Checkbox` y `Radio` dibujaban doble anillo de foco (ahora `data-focus-ring` y `focus-visible`).
- **Horas con formato es-MX** («8:00 a.m.», «12:00 a.m. (medianoche)») mediante `formatHourOfDay()`, en el horario del negocio y en Respaldos de plataforma.
