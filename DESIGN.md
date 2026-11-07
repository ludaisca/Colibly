---
name: Colibly
description: Bandeja multicanal y CRM para pymes; panel "Andén", un tablero de espera claro de día y oscuro de noche.
colors:
  concrete: "#F3F4F2"
  paper: "#FFFFFF"
  concrete-raised: "#ECEEEB"
  hairline: "#DCDFDB"
  board-cell: "#E6E8E4"
  ink: "#15171A"
  slate-muted: "#5B6B7A"
  platform-night: "#0F1113"
  night-surface: "#181B1E"
  night-raised: "#22262A"
  night-hairline: "#2C3035"
  night-cell: "#262A2E"
  night-ink: "#EEF0EE"
  laguna: "#0E7490"
  laguna-deep: "#0C5F75"
  laguna-ink: "#0A5A6E"
  lamp-amber: "#9A4307"
  lamp-red: "#B42318"
  success: "#17663F"
  info: "#1D5FBF"
typography:
  display:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1.05
  headline:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.35
  micro:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1rem
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  board-figure:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    fontFeature: "\"tnum\""
rounded:
  cell: "3px"
  control: "9px"
  row: "8px"
  card: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.laguna}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.laguna-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  selection-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.concrete}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  nav-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.concrete}"
    rounded: "{rounded.control}"
  chat-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "8px 10px"
  wait-cell:
    backgroundColor: "{colors.board-cell}"
    textColor: "{colors.ink}"
    typography: "{typography.board-figure}"
    rounded: "{rounded.cell}"
    height: "24px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "16px"
---

<!-- Mundo "Andén" del panel, documentado desde lo construido en la rama feat/nueva-interfaz (2026-11-07). Fuente normativa de valores: app/globals.css (bloques :has([data-world="anden"])); contrato: .impeccable/surfaces/app-dashboard-whatsapp-chat-page-tsx.md. La landing (app/(marketing)) no usa este mundo: conserva Laguna + Newsreader/Figtree y tendrá su propia dirección. -->

# Design System: Colibly

## Overview

**Creative North Star: "Andén"**

El panel es el tablero de un andén: lo que importa es quién lleva más tiempo esperando, y el tiempo es el dato protagonista. Cada cuenta es una línea con su color; cada conversación avanza por estaciones hasta la venta. Se usa sobre todo en el celular, con cualquier luz, por eso tiene dos temas de primera: concreto claro de día y andén casi negro de noche.

Es una herramienta de trabajo: densidad de producto, controles estándar y una sola familia tipográfica (Barlow) con su versión condensada para títulos y cifras. Los controles son precisos y discretos: sin saltos al pasar el cursor, superficies planas, la selección marcada en tinta. Nada folclórico ni exclusivo de un país: lenguajes de señalética y tableros que se entienden en cualquier lugar.

Se rechazaron: la dirección editorial cálida (crema, serif, terracota, navegación numerada) y la lotería/Metro CDMX por locales.

**Key Characteristics:**
- La espera como cifra de tablero ("1:12") con lámpara ámbar o roja.
- Una línea de color por cuenta (hue por entidad) en filas, tarjetas y chips.
- Selección en tinta (pestañas, chips, navegación activa); el teal Laguna solo para la acción principal y el foco.
- Superficies blancas planas sobre concreto; la sombra queda para lo que flota.
- Barra inferior en el celular: Chats, Contactos, Pipeline, Más.

## Colors

Neutros de concreto y tinta, colores de línea por cuenta y lámparas de estado; un solo acento de acción.

### Primary
- **Laguna** (`laguna`, hover `laguna-deep`): botón principal y anillo de foco. Texto en acento: `laguna-ink`.

### Neutral
- **Concreto** (`concrete`): fondo del panel de día. **Andén** (`platform-night`): fondo de noche.
- **Papel** (`paper`) / `night-surface`: filas, tarjetas, superficies.
- **Concreto alto** (`concrete-raised`) / `night-raised`: campos, pestañas inactivas, lienzo del hilo.
- **Celda** (`board-cell`) / `night-cell`: fondo de cada cifra del tablero.
- **Filete** (`hairline`) / `night-hairline`: bordes y divisores.
- **Tinta** (`ink`) / `night-ink`: texto principal y selección.

### Lámparas y estados
- **Ámbar** (`lamp-amber`, token `warning`): espera desde 15 min.
- **Roja** (`lamp-red`, token `danger`): espera desde 60 min o fuera de SLA.
- `success` e `info` conservan su trío texto/fondo/borde.

### Líneas
Los colores de cuenta salen de `hueClassFor(id)` (8 tonos OKLCH, más claros en oscuro), nunca escritos a mano.

### Named Rules
**La regla de la tinta.** Lo seleccionado se marca en tinta; el teal es para actuar, no para señalar dónde estás.

**La regla de la lámpara.** Ámbar y rojo solo encienden por tiempo de espera o SLA; ningún adorno usa esos colores.

## Typography

**Display Font:** Barlow Condensed (con system-ui)
**Body Font:** Barlow (con system-ui)

**Character:** la sans de la señalética de transporte: clara, firme y legible en movimiento; la condensada pone las cifras y títulos como en un tablero.

### Hierarchy
- **Display** (700, 2.75rem / 1.05): cifras de KPIs.
- **Headline** (700, 1.875rem / 1.2): título de página (`PageHeader`) y "Chats".
- **Title** (600, 1rem): títulos de sección y tarjeta.
- **Body** (400, 0.875rem / 1.5): interfaz, listas, mensajes.
- **Caption** (400, 0.75rem, `text-xs`): ayudas bajo campos, texto secundario.
- **Micro** (500, 0.6875rem / 1rem, `text-micro`): metadatos, insignias, contadores. Es el piso del panel.
- **Label** (600, 0.6875rem, mayúsculas, 0.08em): etiquetas de KPI, pestañas del tablero y encabezados de columna.
- **Board figure** (700, 1rem, cifras tabulares): celdas de espera.

### Named Rules
**La regla del título solo.** Ningún título lleva etiqueta encima; se sostiene solo.

**La regla del piso.** Nada en el panel va por debajo de 11px (`text-micro`); los tamaños escritos a mano (`text-[10px]`) no se usan.

## Layout

Rejilla de 4px. En el celular: cabecera compacta, contenido a todo lo ancho y barra inferior fija con tres accesos por rol más "Más" (abre el menú); dentro de una conversación la barra se oculta. En escritorio: barra lateral colapsable con navegación en tinta. La bandeja es una lista única ordenada por espera en "Esperando". Las páginas de resumen siguen `PageHeader` → `KpiStrip` → `Workbench`.

## Elevation & Depth

Plano por defecto: superficies blancas separadas del concreto por tono y un filete de 1px; `--shadow-sm` es casi nulo. La sombra media/alta queda para menús, paneles y modales. En oscuro, la separación la dan los filetes.

## Shapes

Celdas de 3px, controles de 9px, filas de 8px, tarjetas de 12px y píldoras para selección. La línea de cuenta es una franja de 4px pegada al borde izquierdo de filas y tarjetas (ganada por el contrato de dirección).

## Components

### Buttons
- **Primary:** Laguna con texto blanco, 38px, sin sombra ni elevación; hover a Laguna profunda.
- **Secondary / Ghost:** filete sobre papel / sin fondo; mismas medidas.

### Selección (pestañas, chips, navegación)
- Píldora o ítem en tinta con texto concreto cuando está activo; inactivo en `muted` sobre `concrete-raised`.

### Filas de chat
- Papel, 8px, franja de cuenta a la izquierda, avatar con insignia de canal, nombre y último mensaje; a la derecha la cifra de espera con lámpara o la hora.

### Cifra de espera (componente firma)
- Celdas de 24px con línea de corte tenue; la cifra voltea al cambiar (260 ms, sin animación con "reducir movimiento"); lectura para lectores de pantalla ("Espera 1 h 12 min").

### Ruta de la venta
- Nuevo → Contactado → Calificado → Cliente en el color de la cuenta; la estación actual es un círculo de correspondencia; "Perdido" aparte.

### Cards / KPIs
- Papel con filete, 12px, planas; hover en `concrete-raised`.

## Do's and Don'ts

### Do:
- **Do** marcar la selección en tinta y la acción en Laguna.
- **Do** usar `hueClassFor(id)` para toda línea de cuenta.
- **Do** mostrar la espera con `WaitCells` donde un chat espera respuesta.

- **Do** conservar la barra de cita de WhatsApp (franja izquierda) dentro de la burbuja: es el modelo que la gente conoce. Es la única franja de color permitida dentro de un mensaje; está registrada como excepción del detector en `.impeccable/config.json`.
- **Do** usar la escala de radios (3, 8, 9, 12 px y píldora) también en CSS a mano.

### Don't:
- **Don't** poner etiquetas sobre los títulos.
- **Don't** usar ámbar o rojo fuera de espera/SLA/errores.
- **Don't** agregar sombras o saltos a controles en reposo.
- **Don't** usar referencias folclóricas o exclusivas de un país.
- **Don't** usar Tailwind `dark:`; el tema lo controla la app.
