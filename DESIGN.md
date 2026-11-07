---
name: Colibly
description: Bandeja multicanal y CRM para pymes en México; interfaz de trabajo calmada con un solo acento.
colors:
  laguna-deep: "#0E7490"
  laguna-deeper: "#0C5F75"
  laguna-ink: "#0A5A6E"
  laguna-mist: "#DDF0F5"
  laguna-haze: "#9BD0DE"
  coral: "#C21E4C"
  coral-deep: "#9F1840"
  coral-blush: "#FFE4EA"
  mist-canvas: "#F3F6F8"
  paper: "#FFFFFF"
  cloud: "#ECF0F3"
  hairline: "#D5DCE3"
  slate-muted: "#5B6B7A"
  slate-strong: "#3D4B58"
  night-ink: "#0C1A22"
  bubble-out: "#D5EEF4"
  success: "#17663F"
  warning: "#9A4307"
  danger: "#B42318"
  info: "#1D5FBF"
  night-canvas: "#000000"
  night-surface: "#0A0A0B"
  night-raised: "#161718"
  night-hairline: "#26282A"
  night-text: "#EDEFF0"
  night-accent-ink: "#67E8F9"
typography:
  display:
    fontFamily: "Newsreader, system-ui, sans-serif"
    fontSize: "2.75rem"
    lineHeight: 1.05
  headline:
    fontFamily: "Newsreader, system-ui, sans-serif"
    fontSize: "1.875rem"
    lineHeight: 1.2
  title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1rem
rounded:
  control: "9px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.laguna-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.laguna-deeper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-ghost:
    textColor: "{colors.slate-muted}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  input:
    backgroundColor: "{colors.cloud}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nav-item-active:
    backgroundColor: "{colors.laguna-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
  bubble-outbound:
    backgroundColor: "{colors.bubble-out}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.xl}"
---

<!-- LÍNEA BASE: documenta la interfaz de `main` en b4dbb59 (2026-11-07) antes de la nueva interfaz (rama feat/nueva-interfaz). La fuente normativa de los valores sigue siendo app/globals.css; docs/COLOR.md, docs/TIPOGRAFIA.md y docs/arquitectura/frontend.md tienen el detalle. Cuando la nueva interfaz fije su mundo visual, este archivo se reemplaza. -->

# Design System: Colibly

## Overview

**Creative North Star: "La bandeja serena"**

Colibly es una herramienta de trabajo para gente que contesta chats durante horas y para dueños que entran a ratos. La interfaz busca calma y orden: superficies claras y frías, un solo acento teal que marca la acción y el lugar, y todo subordinado a que ningún chat se pierda. El color fuerte aparece poco y con intención; el resto es papel, niebla y tinta.

La densidad es de producto, no de revista: listas compactas, tipografía sans en casi todo, y la serif Newsreader reservada a cifras protagonistas y títulos de página. Los controles deben sentirse **precisos y discretos**: compactos, consistentes y al servicio del contenido.

Una dirección editorial (crema, serif en etiquetas, terracota, navegación numerada) se probó y se rechazó en noviembre de 2026.

**Key Characteristics:**
- Un acento (Laguna) para acción primaria, selección y foco; un segundo acento (coral) escaso.
- Tema claro frío y tema oscuro casi negro, ambos controlados por la app (clase `.dark`), nunca por el sistema.
- Color por entidad (cuenta, persona) solo mediante `hue-N` en OKLCH, nunca a mano.
- Estados semánticos (éxito, aviso, peligro, info) con trío texto/fondo/borde.

## Colors

Paleta "Laguna + coral": neutros fríos con un teal profundo como única voz principal.

### Primary
- **Laguna profunda** (`laguna-deep`): fondo del botón primario, ítem de navegación activo y anillo de foco en claro. Su versión **más profunda** (`laguna-deeper`) es el hover.
- **Tinta laguna** (`laguna-ink`): texto y enlaces en acento sobre fondo claro (`text-accent-ink`); en oscuro pasa a cian claro (`night-accent-ink`).
- **Niebla laguna** (`laguna-mist`) y **bruma laguna** (`laguna-haze`): fondos sutiles de selección y anillos suaves.

### Secondary
- **Coral** (`coral`, hover `coral-deep`, fondo `coral-blush`): acento secundario para avisos de marca y llamadas puntuales. Nunca compite con el teal en la misma zona.

### Neutral
- **Lienzo niebla** (`mist-canvas`): fondo de la app.
- **Papel** (`paper`): superficies, tarjetas, burbujas entrantes.
- **Nube** (`cloud`): superficie secundaria, campos, fondo del hilo de chat.
- **Filete** (`hairline`): bordes y divisores.
- **Pizarra** (`slate-muted`, `slate-strong`): texto secundario y microtexto (≥ 7:1).
- **Tinta noche** (`night-ink`): texto principal.
- **Burbuja saliente** (`bubble-out`): mensajes enviados, teal muy claro.
- Tema oscuro: `night-canvas`, `night-surface`, `night-raised`, `night-hairline`, `night-text`.

### Named Rules
**La regla de la voz única.** El teal marca acción, selección y foco; nada más usa el acento a pantalla completa. Nunca `text-accent` para texto (falla contraste): se usa `text-accent-ink`.

**La regla del token.** Ningún color literal de Tailwind ni modificadores de opacidad sobre el acento; todo pasa por tokens semánticos y cada par nuevo entra a `contrast.test.ts`.

## Typography

**Display Font:** Newsreader (con system-ui)
**Body Font:** Figtree (con system-ui)
**Label/Mono Font:** Figtree; `font-mono` es un alias temporal de la sans y las cifras usan `tabular-nums`.

**Character:** una serif de lectura, cálida, para las cifras y títulos que se miran de lejos, sobre una sans redonda y clara que hace todo el trabajo.

### Hierarchy
- **Display** (`text-hero`, 2.75rem / 1.05): cifras protagonistas en KPIs.
- **Headline** (`text-page-title`, 1.875rem / 1.2): h1 de cada página vía `PageHeader`.
- **Title** (600, 1rem): títulos de tarjetas y secciones.
- **Body** (400, 0.875rem / 1.5): texto de interfaz, listas, mensajes.
- **Label** (`text-eyebrow`, 600, 0.6875rem / 1rem, mayúsculas): etiquetas de sección.

### Named Rules
**La regla de la serif escasa.** Newsreader solo en display y headline; nunca en etiquetas, botones, datos ni navegación.

## Layout

Rejilla de Tailwind en pasos de 4px. Shell con barra lateral colapsable y contenido en `max-w-* mx-auto`. Las páginas de resumen siguen `PageHeader` → `KpiStrip` (2 columnas en móvil, 4 en `lg`) → `Workbench` + `SectionHeader`; los listados usan `EntityList`. La bandeja es la excepción: tres paneles a pantalla completa (rail de cuentas, lista, hilo) con su propia densidad. Breakpoints por defecto de Tailwind (`md` 768px, `lg` 1024px).

## Elevation & Depth

Híbrido: superficies planas separadas por tono (lienzo niebla → papel) y filetes de 1px, con sombras suaves y frías para lo que flota o responde al cursor. En oscuro, la sombra se vuelve un filete claro casi invisible más una sombra negra profunda.

### Shadow Vocabulary
- **Reposo** (`--shadow-sm`, `0 1px 2px rgba(15,26,26,.05)`): botón primario, ítem activo.
- **Hover / flotante** (`--shadow-md`): tarjetas interactivas al pasar el cursor, menús.
- **Capa** (`--shadow-lg`): modales, drawers, enlace de salto.

## Shapes

Esquinas suaves y uniformes: 9px en todos los controles (botón, campo, select, chip, ítem de navegación), 12px en tarjetas, 16px en burbujas y contenedores grandes. `rounded-bubble` (una esquina recortada) es herencia de un rediseño anterior: no agregar usos nuevos.

## Components

### Buttons
- **Shape:** esquinas suaves (9px); alturas 32 / 38 / 44px.
- **Primary:** fondo laguna profunda, texto blanco, semibold, sombra de reposo.
- **Hover / Focus:** hover a laguna más profunda con sombra flotante y elevación de 1px; activo vuelve a 0 y escala 0.98; foco con anillo teal.
- **Secondary / Ghost / Danger / Link:** secundario con filete sobre papel; ghost sin fondo en pizarra; peligro con trío rojo; enlace en tinta laguna subrayado al pasar.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** papel con filete.
- **Shadow Strategy:** plana en reposo; sombra flotante solo si es interactiva.
- **Internal Padding:** 12 / 16 / 20px.

### Inputs / Fields
- **Style:** fondo nube, filete, 9px, `text-sm`; icono opcional a la izquierda.
- **Focus:** borde teal y anillo bruma.
- **Error / Disabled:** borde y mensaje en peligro con `role="alert"`; deshabilitado al 60 %.

### Navigation
- Barra lateral con grupos por rol; ítem en `text-sm` medio, pizarra en reposo, hover sobre nube, activo con fondo laguna y texto blanco (`aria-current="page"`). En móvil, cajón.

### Bandeja (componente firma)
Burbujas: entrantes en papel, salientes en teal muy claro, esquinas de 16px, sobre el lienzo nube del hilo. Densidad alta en la lista de chats; la estructura del rail se mantiene salvo acuerdo explícito.

## Do's and Don'ts

### Do:
- **Do** usar los componentes de `app/components/ui/` y los tokens semánticos (`bg-surface`, `text-muted`, `text-accent-ink`, `bg-accent` + `text-on-accent`).
- **Do** usar `hueClassFor(id)` para el color de cada entidad.
- **Do** mantener 9px en todo control y `tabular-nums` en cifras.

### Don't:
- **Don't** usar `dark:` de Tailwind: el tema lo controla la app.
- **Don't** usar Newsreader fuera de display/headline.
- **Don't** volver a la dirección editorial rechazada (crema, terracota, serif en etiquetas, navegación numerada).
- **Don't** escribir clases inline de botón, tarjeta o campo.
