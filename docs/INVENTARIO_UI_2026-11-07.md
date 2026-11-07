# Inventario de interfaz — 2026-11-07

Punto de partida de la nueva interfaz (rama `feat/nueva-interfaz`): qué componentes tiene Colibly, qué librerías los sostienen, qué ofrece Tesela y qué falta. Las cifras salen del código en `b4dbb59` (Colibly) y `8241798` (Tesela v1.5.0).

## 1. Resumen

- **Colibly tiene 72 archivos en `app/components/ui/`**. Diez concentran casi todo el uso: `Button` (115 archivos), `toast` (84), `Banner` (64), `Input` (56), `Spinner` (55), `Badge` (53), `Select` (45), `FormField` (45), `Modal` (42) y `SectionHeader` (32). Otros 59 son de dominio, sobre todo la bandeja de WhatsApp (44 en `whatsapp/`).
- **Hay cuatro librerías de comportamiento para la misma tarea**: HeroUI v3 (3 archivos), Base UI (2 en `ui/` + 2 de dominio), `react-aria-components` (1) y `cmdk` (1). `Modal`, el componente más delicado, va sobre HeroUI.
- **Tesela** (`/data/Proyectos/Tesela`) tiene 47 Custom Elements y unas 60 familias solo CSS, con más de 1300 pruebas y axe en 111 secciones. **No se importa en Colibly**: se portan piezas a React con los tokens de Colibly. Hasta ahora son 4 (`OtpInput`, `CurrencyInput`, `ContextMenu`, `FormatToolbar`).
- **Huecos claros**: no hay tooltip (262 atributos `title=` hacen ese trabajo), ni popover genérico, ni tabs propias, ni lista virtualizada, ni campo de teléfono. Además hay dos selectores de fecha distintos y tres selects hechos a mano.

## 2. Librerías instaladas

| Librería | Dónde | Qué aporta | Veredicto |
|---|---|---|---|
| `@heroui/react` + `@heroui/styles` v3 | `modal.tsx` (42 usos indirectos), `hero-tabs.tsx` (5), `hero-date-range.tsx` (3) | Diálogo, tabs, rango de fechas (sobre React Aria) | **Salir.** Trae su propia capa de estilos; tres componentes no justifican dos paquetes |
| `@base-ui/react` 1.x | `drawer.tsx`, `context-menu.tsx`, `chat-list-panel.tsx` (combobox), `contact-drawer.tsx` | Primitivas sin estilo (foco, teclado, posicionamiento, ARIA) | **Base única.** Ya es la más usada, no trae estética |
| `react-aria-components` + `@internationalized/date` | solo `hero-date-range.tsx` | Calendario de rango | **Salir** con el rango de fechas |
| `cmdk` | `command-palette.tsx` | Paleta ⌘K | Se queda (hace una sola cosa y bien) |
| `motion` | `chat-thread-panel.tsx`, demo | Animación | Se queda, uso puntual |
| `@dnd-kit/core` | pipeline (2 archivos) | Arrastrar tarjetas | Se queda |
| `recharts` | estadísticas (1 archivo) | Gráficas | Se queda; las gráficas pequeñas (sparkline) pueden salir de Tesela |
| `lucide-react` | todo | Iconos | Se queda (Tesela usa el mismo set) |

Quitar HeroUI y `react-aria-components` elimina 4 dependencias y deja **una sola** forma de hacer diálogos, menús y popovers.

**Estado (2026-11-07): hecho.** Menús, paneles, selectores, tooltips, modales y pestañas van sobre Base UI; fechas con el calendario de Tesela. HeroUI, `react-aria-components` y `@internationalized/date` ya no están en `package.json`.

## 3. Componentes de Colibly (`app/components/ui/`)

Uso = archivos que lo importan. "Hecho a mano" = comportamiento propio, sin librería.

### Base (los que definen el aspecto de todo)

| Componente | Uso | Implementación | Nota |
|---|---|---|---|
| `button` | 115 | propio | Bien; 32 `<button className=…>` sueltos fuera de `ui/` lo esquivan |
| `toast` | 84 | propio | Tesela tiene `TeselaUI.toast()` con cola y pausa al pasar el ratón |
| `banner` / `alert` | 64 / 0 | propio | `alert.tsx` sin uso: candidato a borrar o fusionar |
| `input`, `textarea` | 56 / 19 | propio | `textarea` sin autoajuste (Tesela: `textarea-autosize`) |
| `spinner`, `skeleton`, `progress` | 55 / 11 / 3 | propio | — |
| `badge` | 53 | propio | — |
| `select` | 45 | `<select>` nativo estilizado | Correcto para formularios simples |
| `form-field` | 45 | propio | Patrón `{(id) => …}` |
| `modal` | 42 | **HeroUI** | Migrar a Base UI `Dialog` / `AlertDialog` |
| `confirm-dialog` | 28 | sobre `modal` | Sigue a `modal` |
| `card`, `section-header`, `page-header`, `page-container` | 31 / 32 / 30 / 6 | propio | Estructura de página |
| `dropdown` | 25 | **hecho a mano** (portal + `getBoundingClientRect`) | Migrar a Base UI `Menu` |
| `switch`, `checkbox`, `radio` | 19 / 5 / 2 | propio | Revisar teclado/ARIA de `radio` (grupo) |
| `avatar`, `channel-avatar` | 16 / 6 | propio + blobatar | Identidad de Colibly, se queda |
| `table`, `pagination` | 16 / 4 | propio | Sin orden por columna (Tesela: `data-table`) |

### Selección y fechas (donde está el riesgo de accesibilidad)

| Componente | Uso | Implementación | Nota |
|---|---|---|---|
| `multi-select` | 5 | **hecho a mano** (`role="button"`) | Migrar a Base UI `Combobox` múltiple |
| `searchable-select` | 2 | **hecho a mano** (listbox propio) | Migrar a Base UI `Combobox` (ya lo usa `chat-list-panel`) |
| `date-picker` | 2 | **hecho a mano** (261 líneas) | Portar `tsl-date-picker` |
| `hero-date-range` | 3 | **HeroUI + React Aria** | Portar `tsl-date-range`; mismo calendario que el anterior |
| `hero-tabs` | 5 | **HeroUI** | Base UI `Tabs` |
| `otp-input`, `currency-input` | 2 / 1 | portados de Tesela | Ya hechos |
| `password-input`, `password-strength` | 6 / 4 | propio | Equivalen a `tsl-password` |

### Patrones de página y listas (propios de Colibly, se quedan)

`entity-list` (18), `kpi-strip` (11), `detail-page` (11) + skeleton (10), `list-page-skeleton` (12), `list-error-state` (10), `empty-state` (8), `workbench` (2), `filters-panel` (2), `icon-box` (2), `status-page` (2), `hue.ts`, `cn.ts`, `use-poll.ts`, `relative-time` (5).

### Estructura y piezas únicas

`app-shell` (324 líneas), `user-dropdown` (246, menú propio), `notification-bell` (372, popover propio), `command-palette` (cmdk), `drawer` y `context-menu` (Base UI), `format-toolbar` (de Tesela), `route-progress-bar`, `site-mobile-nav`, `logo`, `brand-marks`, `channel-icons`, `billing-banner`, `verify-email-banner`, `onboarding-checklist`, `getting-started`, `business-context`, `turnstile`.

`user-dropdown` y `notification-bell` reimplementan menú y popover: pasan a Base UI junto con `dropdown`.

### Fuera de `ui/`

- `whatsapp/` (44): bandeja completa: lista, hilo, compositor, pickers de asignado/etiqueta/equipo/prioridad, snooze, macros, plantillas, drawer de contacto, línea de tiempo, llamadas. Los pickers repiten el patrón popover + lista: un `Combobox`/`Popover` común los simplifica.
- `billing/` (4), `channel-accounts/` (3), `analytics`, `integrations`, `meta-messaging`, `pipeline` (1 cada uno), `theme-toggle.tsx`.
- `app/(dashboard)/demo-componentes/` (`_demo`, `_showcase`, `_flow-preview`): página de pruebas con Base UI. Sirve de banco para la nueva interfaz.

## 4. Tesela

Biblioteca propia sin dependencias: HTML + CSS en `@layer` + Custom Elements en light DOM. Textos por defecto en español, temas claro/oscuro, 97 tokens `--tsl-*`, 11 presets, RTL, `forced-colors`, formularios con `ElementInternals`, axe WCAG 2.2 AA en cada sección y pruebas en Chromium, Firefox y WebKit. Peso: 78 KB gz de JS y 23 KB gz de CSS.

**Por qué no se importa tal cual en Colibly** (regla vigente en `frontend.md`):
- Sus tokens `--tsl-*` y su estética (negro lacado, dorado) chocan con los tokens semánticos de Colibly.
- Custom Elements en React 19 + RSC: eventos `tsl-*` sin tipado JSX, estado fuera de React, hidratación del light DOM.
- El propio plan maestro de Tesela deja los envoltorios de React como pendiente (P3, o P1 "si se usa en React").

**Cómo se aprovecha:** como fuente de comportamiento ya probado (teclado, ARIA, casos límite, textos en español) que se porta a un componente React con los tokens de Colibly, igual que `OtpInput`.

### Lo que Tesela ofrece, agrupado por interés para Colibly

| Interés | Tesela | Para qué en Colibly |
|---|---|---|
| **Alto** | `date-picker`, `date-range`, `calendar`, `time-picker` | Un solo calendario para citas, filtros y reportes; reemplaza `date-picker` + `hero-date-range` |
| **Alto** | `phone` | Números de WhatsApp con lada (hoy texto libre; encaja con `jidCandidates()`) |
| **Alto** | `message`, burbuja, `attachment`, `message-scroller`, `prompt-input`, `suggestion` | Hilo y compositor de la bandeja: seguimiento del final, adjuntos, sugerencias de respuesta IA |
| **Alto** | `virtual-list` | Lista de chats y contactos largas |
| **Alto** | `tags` | Etiquetas de chat/contacto como campo |
| Medio | `upload` / `dropzone` | Importar contactos, adjuntos, base de conocimiento del bot |
| Medio | `sparkline`, `chart` (línea, barras, dona, mapa de calor) | Mini-gráficas en `KpiStrip`; las grandes siguen en recharts |
| Medio | `data-table` (orden, selección) | Tablas de reportes y contactos |
| Medio | `wizard` / `steps` | Alta de canal, onboarding |
| Medio | `kanban`, `sortable` | Referencia para el pipeline (el arrastre sigue con dnd-kit) |
| Medio | `resizable`, `scroll-area` | Paneles de la bandeja |
| Medio | `textarea-autosize`, `mention` | Compositor y notas internas con @mención |
| Medio | `toast` (cola, pausa, acción) | Mejora de `toast` actual |
| Bajo | `editor`, `color-picker`, `rating`, `carousel`, `tree`, `menubar`, `nav-menu`, `branch`, `reasoning`, `questionnaire` | Sin caso claro hoy |
| Ya cubierto | `select`, `combobox`, `menu`, `popover`, `hovercard`, `tooltip`, `dialog`, `sheet`, `tabs`, `toggle-group`, `collapsible`, `radio-group`, `slider` | Mejor desde **Base UI** (primitivas mantenidas, mismas garantías) |
| Ya portado | `otp`, `currency`, `context-menu`, barra flotante | — |

También sirven sus 5 patrones completos (panel, autenticación, ajustes con navegación lateral, alta por pasos, chat con asistente) como referencia de composición, no de estética.

## 5. Hallazgos que la nueva interfaz debe resolver

1. **Cuatro librerías headless** para la misma tarea (sección 2).
2. **Sin tooltip**: 262 `title=` en `app/`. `title` no aparece con teclado ni en táctil; los botones de solo icono necesitan `aria-label` + tooltip real.
3. **Menús y popovers hechos a mano** en `dropdown`, `user-dropdown`, `notification-bell`, `multi-select`, `searchable-select` y los pickers de la bandeja: cada uno con su propio posicionamiento y manejo de foco.
4. **Dos selectores de fecha** con aspecto y teclado distintos.
5. **Controles fuera del sistema**: 32 `<button className=…>`, 4 `<select>` y 1 `<input>` sueltos fuera de `ui/`.
6. **Componentes sin uso**: `alert.tsx` (0 importaciones directas).

## 6. Propuesta de reparto

| Capa | Fuente | Contenido |
|---|---|---|
| Primitivas de comportamiento | **Base UI** | Dialog, AlertDialog, Popover, Tooltip, Menu, Select, Combobox, Tabs, Drawer, ContextMenu, ToggleGroup, Accordion/Collapsible, ScrollArea, Toast si conviene |
| Campos compuestos y piezas de dominio | **Portados de Tesela** | Calendario/rango/hora, teléfono, tags, upload, sparkline, lista virtual, piezas del hilo y compositor |
| Aspecto y patrones | **Colibly** | Tokens semánticos, `Button`/`Input`/`Badge`…, `EntityList`, `KpiStrip`, `Workbench`, `PageHeader`, avatares, marca |

Cada componente nuevo o migrado conserva su API pública cuando sea posible (los 42 usos de `Modal` no deberían cambiar) y se prueba en `demo-componentes` antes de entrar a las pantallas.
