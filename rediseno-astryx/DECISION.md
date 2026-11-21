# Decisión: UI de Colibly sobre Astryx

> Propuesta de diseño (2026-11-21). Sustituye al "issue de propuesta" que pide
> AGENTS.md → "Dirección de diseño". Aprobada por Luis para esta rama.

## Por qué Astryx y no reescribir

Colibly tiene ~133k líneas, 84 modelos, 306 endpoints y CI verde: la lógica está
madura; el problema es solo la UI, "demasiado genérica". Se cambia la capa de UI
pantalla por pantalla, empezando por la bandeja (superficie central, uso en
celular). `lib/`, `prisma/` y `app/api/` no se tocan.

## Qué validó el prototipo (`prototipo/`, capturas en `capturas/`)

| Requisito (PRODUCT.md / AGENTS.md) | Estado |
|---|---|
| Burbujas tipo WhatsApp (cliente izq., equipo der.) | ✓ `ChatMessage sender="assistant"/"user"` |
| Colores de burbuja `#FFFFFF`/`#DCEFEC` (claro), `#222321`/`#163A3E` (oscuro) | ✓ por remitente y modo |
| Celular primero; escritorio secundario | ✓ una superficie en <768 px, dos paneles en ≥768 px |
| Abrir chat sin navegar (pushState + popstate) | ✓ Atrás vuelve a la lista |
| Orden por espera, lámpara ámbar ≥15 min / roja ≥60 min | ✓ lógica copiada sin cambios |
| Ventana de 24 h de Meta: bloquear compositor fuera de ella | ✓ |
| Claro/oscuro controlado por la app, clave `theme` | ✓ `Theme mode` + `ColorMode.tsx` |
| Barlow, neutros cálidos, radios 6/10 | ✓ tema `colibly` |

## Cambios a la dirección congelada (aprobados)

Se aplicaron **todas** las correcciones del editor de temas de Astryx; queda con
0 problemas de contraste abiertos.

1. **Acento en oscuro: `#0F6E7E` → `#00869a`** con texto casi negro (4.88:1).
   `#0F6E7E` solo contrastaba 2.56:1 contra el fondo oscuro (un relleno pide
   3:1) y el blanco sobre `#00869a` daría 4.31:1. El claro conserva `#0F6E7E`.
2. **Error en oscuro: `#c04c40`** con texto blanco (4.83:1). El texto de error
   usa tonos derivados que leen ≥4.5:1 (`#a11711` claro, `#f4b5ab` oscuro).
3. **Toast de error**: relleno `#b3261e` (claro) / `#c04c40` (oscuro), texto
   blanco en ambos (convención `text-surface` sobre `bg-danger`).
4. **Pista de la barra de progreso en oscuro: `#30312f`** (el relleno contrastaba 1.80:1).
5. **Seleccionado** en menú lateral, barra superior, paginación y filas de lista:
   `--color-accent-muted` = `#A9CFD4` / `#24474C` (valores de Colibly). El texto
   secundario sobre ellos se oscurece solo para mantener 4.5:1.
6. **Botón primario deshabilitado**: relleno neutro con texto primario, en vez de
   acento translúcido.

Pendiente: llevar estos cambios a `app/globals.css`, `lib/brand-colors.ts`,
`docs/COLOR.md` y `lib/design/__tests__/contrast.test.ts` cuando se integre, y
actualizar "Dirección de diseño" en AGENTS.md/CLAUDE.md.

El editor lista 15 partes que conservan grises del tema base (lightbox, scrim,
mobile-nav, segmented-control, token, code-block, kbd, slider…). No propone
correcciones ni tienen problemas de contraste: revisar visualmente al usarlas.

## Señal de la fila del chat (`prototipo/lib/inbox/row-signal.ts`)

En 360 px cabe una sola señal a la derecha. Precedencia (inspirada en Intercom,
Zendesk y Front):

1. Resuelto → solo la hora.
2. Espera ≥ 15 min → cifra de espera (equivale a un SLA en riesgo; gana a todo).
3. Prioridad URGENT → "Urgente".
4. Sin leer → contador.
5. Espera corta ya leída sin responder → cifra gris.
6. Nada que atender → hora.

El orden de la lista no cambia: sigue siendo `chatRowComparator`.

## Trampas encontradas

- `ChatLayout` necesita **altura explícita** (`style={{height: '100%'}}`) dentro
  de un contenedor flex; si no, crece con los mensajes y saca el compositor de
  la pantalla.
- Fechas con zona y locale fijos (`es-MX` + zona de la organización) para que
  servidor y navegador produzcan el mismo texto.
- El tema `colibly` extiende `@astryxdesign/theme-neutral`: debe seguir instalado.
- Astryx es 0.x: fijar versiones exactas.
