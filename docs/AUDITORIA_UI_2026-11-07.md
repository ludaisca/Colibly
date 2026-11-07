# Auditoría de `app/components/ui/` — 2026-11-07

Primera pasada de las skills sobre los componentes base, antes de la nueva interfaz (rama `feat/nueva-interfaz`). Dos fuentes:

- **Web Design Guidelines** (`.claude/skills/web-design-guidelines`): reglas de accesibilidad, foco, formularios, animación y texto. Revisión por búsqueda en los 72 archivos y lectura de los casos dudosos; no es una lectura línea por línea de cada componente.
- **Detector de Impeccable** (`impeccable detect --json app/components/ui`): 26 avisos, todos de nivel *advisory* y todos de desvío respecto a `DESIGN.md` (no de calidad).

Formato: `archivo:línea — problema → arreglo`.

## Web Design Guidelines

### Teclado y ARIA (lo más importante)

- `dropdown.tsx` — menú sin `role="menu"`/`menuitem`, sin `aria-expanded` en el disparador y sin navegación con flechas (solo Escape) → Base UI `Menu`
- `user-dropdown.tsx:140` — `aria-expanded` sí, pero sin flechas ni roles de menú; el cierre es un `<div onClick>` a pantalla completa (`:157`) → Base UI `Menu`
- `notification-bell.tsx` — panel sin `aria-expanded` en la campana ni manejo de foco al abrir → Base UI `Popover`
- `multi-select.tsx:75` — disparador `div role="button"` (justificado por los botones anidados de quitar etiqueta) pero la lista no tiene flechas ni `aria-activedescendant` → Base UI `Combobox` múltiple
- `searchable-select.tsx:106` — mismo patrón; este sí tiene flechas, pero reimplementa listbox y posicionamiento → Base UI `Combobox`
- `table.tsx:187` — `div onClick` solo para `stopPropagation`; correcto, pero si la fila es clicable necesita un enlace o botón real para teclado

### Foco

- `date-picker.tsx:157` — `outline-none` con `focus:ring-1`: anillo de 1px casi invisible → `focus-visible:ring-2` como `Input`
- `currency-input.tsx:103`, `searchable-select.tsx:177` — `outline-none` en el campo interno; el foco lo marca el contenedor; verificar que el contenedor use `focus-within`
- `filters-panel.tsx:183` — botón de texto con `focus:outline-none` y sin reemplazo → `focus-visible:underline` o anillo
- `context-menu.tsx:31,33` — `outline-none` en menú e ítems con `data-[highlighted]` como foco: correcto (Base UI)

### Animación

- `app-shell.tsx:83,100,101,149,238` — `transition-all` → listar propiedades (`width`, `padding`, `background-color`)
- `progress.tsx:35` — `transition-all` → `transition-[width]`
- Solo `drawer.css`, `route-progress-bar.tsx` y `globals.css` respetan `prefers-reduced-motion`; el botón hace `translate`/`scale` al pasar el cursor sin esa guarda → añadir `motion-reduce:transform-none` en `button.tsx`

### Texto

- `multi-select.tsx:27`, `searchable-select.tsx:35,36` — `"Seleccionar..."`, `"Buscar..."` → `…`
- `tabular-nums` solo en 5 componentes (`currency-input`, `kpi-strip`, `notification-bell`, `onboarding-checklist`, `status-page`); falta en `table.tsx` (columnas numéricas), `pagination.tsx`, `relative-time.tsx`, `date-picker.tsx`

### Fuera de `ui/` (para la siguiente pasada)

- 262 atributos `title=` en `app/`: no se muestran con teclado ni en táctil → tooltip real (Base UI `Tooltip`) + `aria-label` en botones de solo icono
- 32 `<button className=…>` y 4 `<select>` sueltos fuera de `ui/`

### Bien resuelto

- `modal.tsx:52` — cerrar con `aria-label="Cerrar"`; título y descripción enlazados por id
- `hero-date-range.tsx:63` — botón de quitar con `aria-label`
- `confirm-dialog.tsx:64` — foco inicial en "Cancelar" (acción segura)
- `color-scheme` declarado por tema en `globals.css`
- `app-shell.tsx:229` — enlace para saltar al contenido

## Detector de Impeccable (desvío de `DESIGN.md`)

| Tipo | Avisos | Dónde |
|---|---|---|
| Tamaño de letra fuera de la escala | 18 | 9–13px literales en `command-palette.css` (7), `hero-ui.css` (4), `notification-bell.tsx` (2), `app-shell`, `avatar`, `command-palette.tsx`, `date-picker`, `filters-panel` |
| Radio fuera de la escala | 5 | `hero-ui.css` (2, 4, 10px), `command-palette.css` (5px), `drawer.css` (24px) |
| Color sin token | 3 | Fondos de superposición `rgb(17 13 31 / 56–62%)` en `modal.css`, `drawer.css` y `rgb(23 19 43 / 55%)` en `command-palette.css` |

Lectura: la escala tipográfica real tiene un escalón de 10–13px que `DESIGN.md` no recoge (micro-etiquetas, insignias), y las tres superposiciones usan un violeta oscuro sin token. Las dos cosas se deciden en la nueva interfaz: o entran como tokens (`text-micro`, `--overlay`) o se quitan.

## Estado

- **Hecho (2026-11-07):** `dropdown`, `user-dropdown`, `notification-bell` (escritorio), `multi-select` y `searchable-select` pasan a Base UI (Menu / Popover / Combobox); `"..."` → `…` en los dos selectores; foco visible en sus campos. Verificado con teclado en el navegador (flechas, Fin, Escape y foco de regreso).
- **Hecho (2026-11-07, segunda pasada):** `Tooltip` sobre Base UI en lugar de `title` en 30 controles (de los 262 `title=` medidos al principio, la mayoría eran props `title` de componentes como `PageHeader`; los nativos en controles eran 32). Nueve botones de solo icono no tenían nombre accesible y ahora llevan `aria-label`. `transition-all` del shell → propiedades concretas; `Button` sin elevación y con `motion-reduce`; `tabular-nums` en tabla, paginación y `RelativeTime`; foco visible en `date-picker` (`ring-2`) y en el selector de `filters-panel`; 46 `"..."` → `…`; velo común `--overlay` para modal, cajón y paleta; `SectionHeader` sin etiqueta sobre el título.
- Hecho: `Modal` sobre Base UI (ver `INVENTARIO_MODALES_2026-11-07.md`) y calendario de Tesela para `DatePicker` y `DateRangePicker` (fuera `hero-date-range`).
- Hecho: pestañas sobre Base UI con la pestaña en la URL (`useUrlTab`); fuera `@heroui/*`, `react-aria-components`, `@internationalized/date` y `hero-ui.css`.
- Hecho: token `text-micro` (11px) como piso del panel; 99 tamaños escritos a mano reemplazados por la escala (`micro`, `xs`, `sm`, `base`).
- Hecho (2026-11-07), una regla a la vez:
  - **Radios:** teclas de la paleta 5→3 px, hoja inferior del cajón 24→12 px (igual que el modal), editor de flujos 7/10→8/12 px.
  - **Colores:** velo del cajón de contacto → `--overlay`; el verde de variables de la vista previa de plantillas va a la paleta `WA` del archivo (imita a WhatsApp a propósito).
  - **Franja de la cita:** se conserva (modelo de WhatsApp, PRODUCT.md) como excepción registrada en `.impeccable/config.json` con su motivo.
  - Resultado: `impeccable detect` sobre `app/(dashboard)` y `app/components` da **0 avisos** (sin contar `demo-componentes`).

## Prioridad sugerida

1. Menús y popovers propios → Base UI (`dropdown`, `user-dropdown`, `notification-bell`, `multi-select`, `searchable-select`): concentra los fallos de teclado.
2. Tooltip real y `aria-label` para sustituir los `title=`.
3. Foco visible uniforme (`focus-visible:ring-2`) y `motion-reduce` en `Button`.
4. Tokens para micro-texto y superposición; quitar `hero-ui.css` al salir de HeroUI.
5. Arreglos de texto (`…`, `tabular-nums`).
