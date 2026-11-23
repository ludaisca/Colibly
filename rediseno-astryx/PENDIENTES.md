# Pendientes de la migración a Astryx

Rama `rediseno/astryx`. Estado al 2026-11-22 (último commit de código: `cc61e60`).
Marca cada casilla en el mismo commit que la resuelve.

## Hecho (para contexto)

- Todos los componentes de `app/components/ui/` son adaptadores sobre Astryx (misma API, Astryx por dentro): botones, campos, selects, fechas, modales, cajones, toasts, menús, menú contextual, pestañas, tablas, listas, tarjetas, encabezados, paleta ⌘K, menú lateral, menú de usuario, filtros, notificaciones.
- Sin Base UI ni cmdk (dependencias quitadas). Español es-MX con `lib/astryx/es-mx.ts` para los textos que el catálogo es-ES de Astryx aún no trae.
- Pruebas: 1562 (incluye `lib/design/__tests__/astryx-theme-contrast.test.ts`, 60 de contraste del tema). Documentación: `docs/arquitectura/frontend.md` → "Astryx", `docs/COLOR.md`, `AGENTS.md`.

## 1. Verificación antes de unir a `main`

- [ ] **Build de producción** (`docker build --target builder …`, ver `CLAUDE.md`). El último que pasó fue antes de quitar `@base-ui/react` y `cmdk`; hay que repetirlo con el `package-lock.json` actual.
- [ ] **Arranque de producción** (`--target runner` contra una base desechable): no se ha probado con Astryx.
- [ ] **Revisión en el celular (390 px)** de todas las pantallas. Cada tanda se revisó en su pantalla, pero falta un recorrido completo de punta a punta.
- [ ] **Revisión en modo oscuro** de todas las pantallas. Solo se revisaron la bandeja, Configuración y un cajón.
- [ ] **Recorrido completo con una cuenta real de WhatsApp** (la bandeja se probó con un Chat web local): plantillas, adjuntos, audio, stickers, botones interactivos, campañas.
- [ ] **Comparación visual antes/después** (el diff de estilos calculados de ~4,000 elementos de la fase 1 ya no aplica: ahora los cambios son a propósito). Hacer una revisión pantalla por pantalla con capturas.
- [ ] Abrir el PR a `main` cuando lo anterior esté listo (solo si Luis lo pide).

## 2. Decisiones que necesitan aprobación de Luis

- [ ] **Ancho del menú: 232 → 260 px.** Es el ancho propio del `SideNav` de Astryx; la "Dirección de diseño" decía 232. Se ajustaron `--sidebar-w`, el cajón del celular y `AGENTS.md`. Confirmar o pedir que se fuerce a 232.
- [ ] **Toasts de error persistentes**: ya no se van solos a los 4 s (WCAG 2.2.1); se quedan hasta cerrarlos. Confirmar.
- [ ] **Posición de los toasts**: antes arriba a la derecha en escritorio; ahora la de Astryx (abajo a la derecha).
- [ ] **"Marcar venta"** en la cabecera de la conversación: como botón solo desde 1536 px (`2xl`); debajo está en el menú ⋯ (a 1280 px invadía el panel del contacto).
- [ ] **Bandeja, opción 2**: rehacerla con los componentes de chat de Astryx (`ChatLayout`, `ChatMessageList`, `ChatComposer`, prototipo en `rediseno-astryx/prototipo/`). Hoy se hizo la opción 1 (mismos paneles, controles de Astryx). `AGENTS.md` pide confirmar antes de reestructurar la barra de `/whatsapp/chat`.

## 3. Controles nativos que quedan

Conteo de `<button|input|select|textarea>` fuera de los adaptadores. Algunos son legítimos (marcados *se queda*); el resto conviene pasarlo a Astryx.

- [ ] `whatsapp/automatizaciones/[id]/_flow-builder-preview.tsx` (9) y `_builder.tsx` (4): nodos del editor de automatizaciones. *Probablemente se queda* (lienzo propio); revisar los botones de "agregar paso" y el selector de tipo de paso.
- [ ] `components/whatsapp/chat-list-panel.tsx` (8): filas de chat, chips de cuenta, selección múltiple. Las filas *se quedan* (fila densa propia); chips y botones de selección → `Button`/`Token`.
- [ ] `components/whatsapp/chat-views-menu.tsx` (4), `chat-thread-panel.tsx` (3), `chat-conversation-header.tsx` (2), `sticker-picker.tsx` (2), `audio-transcript.tsx` (2).
- [ ] `components/whatsapp/chat-composer.tsx` (3): el `<textarea>` del compositor (crece solo, atajos `/`, Enter) y el `<input type=file>` oculto *se quedan* salvo que se elija la opción 2 de la bandeja; revisar la lista de respuestas rápidas.
- [ ] `components/ui/format-toolbar.tsx` (2), `components/ui/otp-input.tsx` (1; Astryx no tiene campo de código: *se queda*, pero darle el estilo del tema).
- [ ] `whatsapp/citas/_view.tsx` (3): celdas del calendario mensual y filas de la agenda. *Se quedan* las celdas.
- [ ] `whatsapp/campanas/nueva/page.tsx` (2, inputs de archivo ocultos → valorar `FileInput`), `plantillas/_form.tsx`, `monitores/page.tsx`, `campanas/automatizacion/nueva/page.tsx`, `bots/[id]/page.tsx` (1 cada uno).
- [ ] Fuera del panel: `(auth)/login/page.tsx` (2), `oauth/autorizar/_consent-form.tsx` (3), `conectar/[token]/_connect.tsx` (2), `global-error.tsx` (1).
- [ ] Sitio público `(marketing)` (landing, docs de la API): no se migró; decidir si también va con Astryx o se queda con su diseño propio.

## 4. Diseño de páginas

- [ ] Los layouts de cada página siguen con clases de Tailwind (`flex`, `grid`, `gap-*`, `space-y-*`). Valorar `Layout`/`VStack`/`HStack`/`Grid`/`Section` de Astryx pantalla por pantalla.
- [ ] Clases de variantes de Base UI que quedaron sin efecto (`data-[popup-open]:…`, `data-[highlighted]:…`): buscarlas y quitarlas.
- [ ] `KpiStrip` es una `Card` de Astryx con la cuadrícula propia (Astryx no tiene componente de cifras); revisar si el tema necesita un estilo para `text-figure`.

## 5. Entorno de desarrollo

- [ ] **Tailscale**: correr en el equipo `ldic` `sudo tailscale serve --bg --https=10100 http://127.0.0.1:1100` (o `sudo tailscale set --operator=$USER` una vez). Dirección: `https://ldic.taila2291d.ts.net:10100`.
- [ ] `.env`: `APP_URL` y `NEXT_PUBLIC_APP_URL` apuntan a `http://localhost:1100`; los enlaces de los correos no sirven desde Tailscale. Cambiar si se va a probar desde otro equipo.
- [ ] Datos de prueba en la base local: cuenta Chat web "Sitio de prueba" y un chat de "Visitante web" con una respuesta. Borrar cuando ya no sirvan.
- [ ] Turbopack se queda sirviendo CSS o componentes viejos tras cambios grandes (errores de hidratación falsos): detener la app, borrar `.next` y arrancar (`docs/arquitectura/frontend.md`).

## 6. Mantenimiento

- [ ] `AGENTS.md` mide ~31.7K (límite ~30K): mover detalle a `docs/arquitectura/`.
- [ ] Al subir Astryx de 0.7.17: revisar textos faltantes del catálogo es-ES (comando en `frontend.md` → "Astryx") y repetir `astryx-theme-contrast.test.ts`.
- [ ] El `ContextMenu` de Astryx envuelve al hijo en un `<div>`: si una fila nueva con menú contextual vive en una cuadrícula, necesita `min-w-0`.
