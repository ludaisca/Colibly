# Product

<!-- impeccable:product-schema 1 -->

> Registro de producto para Impeccable (`.claude/skills/impeccable`). Solo hechos confirmados; las reglas técnicas viven en `CLAUDE.md` / `AGENTS.md` y el sistema visual en `DESIGN.md`, `docs/COLOR.md`, `docs/TIPOGRAFIA.md` y `docs/arquitectura/frontend.md`. Si algo choca, ganan esos archivos.

## Platform

web

## Users

Dos perfiles por igual (confirmado 2026-11-07):

- **Dueño que lo hace todo**: negocio pequeño (1–3 personas) que atiende, vende y configura él mismo, a ratos y entre otras tareas.
- **Equipos con agentes**: ejecutivos de ventas o atención que contestan chats durante horas en una computadora; un admin/dueño revisa pipeline, reportes y configuración.

Roles en la app: `admin`, `user` y `ejecutivo` (este último solo ve Chats, Contactos, Citas y Configuración). Los clientes finales del negocio solo ven WhatsApp/Instagram/Messenger o el widget web, nunca el panel.

## Product Purpose

CRM y bandeja de mensajería multicanal para pymes en México: WhatsApp (canal principal), Telegram, Messenger, Instagram y un widget web propio en una sola bandeja, con bots de IA que responden con el conocimiento del negocio, automatizaciones, pipeline de ventas, contactos, citas, tareas, campañas de WhatsApp y reportes. Éxito: que ningún chat se pierda o quede sin respuesta y que las conversaciones avancen hasta una venta.

## Positioning

- **Precio en MXN por usuario**: licencias Básico $59, Avanzado $89 y Pro $149 MXN por usuario al mes (`lib/billing/plans.ts`), pensadas para pymes mexicanas; 14 días de prueba de Pro sin tarjeta.
- **Bots de IA incluidos**: la plataforma pone los modelos y los créditos; el cliente no trae claves ni elige proveedor.

## Operating Context

- **Se usa sobre todo en el celular** (confirmado 2026-11-07): atendiendo desde el teléfono, en cualquier lugar y con cualquier luz (mostrador, calle, casa de noche). El escritorio es secundario. La bandeja es la superficie central y debe funcionar primero en una pantalla de teléfono.
- Las burbujas tipo WhatsApp (izquierda/derecha) se conservan en cualquier rediseño: es el modelo mental de los usuarios.
- Todo en español de México, con tuteo ("Atiende", "Tus chats").
- Ventana de 24 h de WhatsApp, plantillas aprobadas por Meta y números mexicanos (52 / 521) son parte del trabajo diario.
- Sin websockets: la información en vivo llega por sondeo, así que los estados de carga y "actualizado hace…" importan.

## Capabilities and Constraints

- Superficies: panel (`app/(dashboard)`, modo Operate), landing y precios (`app/(marketing)`, modo Persuade), autenticación, y el operador de plataforma (`/plataforma`, solo correos autorizados).
- Los canales genéricos no tienen campañas, plantillas, lead scoring ni etiquetas de chat; la interfaz lo oculta a propósito.
- Lo que cada persona ve depende de su rol y licencia; un rediseño no puede mostrar acciones que el rol no permite.
- Producción en Next.js 16 + Tailwind v4 con tokens semánticos; tema claro y oscuro controlados por la app (no por el sistema).

## Brand Commitments

- Nombre **Colibly** (`colibly.com`), siempre a través de `lib/brand.ts`. Logo **Nexo** (C geométrica + triángulo al este), `BrandMark`.
- Paleta vigente "Laguna + coral" y tipografía Newsreader + Figtree: son el estado actual, **no** compromisos fijos; la nueva interfaz puede proponer cambiarlos con una decisión explícita (ver `docs/INVENTARIO_UI_2026-11-07.md`).
- Un rediseño editorial (crema, serif, terracota, navegación numerada) fue rechazado en noviembre de 2026; no repetir esa dirección.
- **Identidad visual universal** (confirmado 2026-11-07): nada folclórico ni exclusivo de México (lotería, papel picado, Metro CDMX, etc.) en la interfaz, para poder expandirse a otros países sin rehacerla. El mercado inicial sigue siendo México; lo local vive en el contenido (moneda, números, idioma), no en el estilo.

## Evidence on Hand

Ninguna todavía: el producto está en beta. **No hay clientes públicos, testimonios, logos ni cifras de uso.** No inventar ninguno en la interfaz ni en la landing; los precios y la prueba sí son reales y salen de `app/(marketing)/_landing-offer-data.ts`.

## Product Principles

1. **Ningún chat se pierde**: lo que espera respuesta, lo asignado y lo vencido se ve primero.
2. **Sirve igual al dueño solo y al equipo**: lo simple no estorba al que trabaja solo; lo de equipos (asignación, equipos, SLA) aparece cuando se usa.
3. **Conocido antes que original** en el panel: los patrones de WhatsApp y de las bandejas que la gente ya usa ganan sobre la expresión.
4. **Honesto**: nada de cifras, clientes o promesas que no existan.

## Accessibility & Inclusion

Pares de color probados por contraste en `lib/design/__tests__/contrast.test.ts`; foco visible y uso completo con teclado en la bandeja. Uso largo frente a la pantalla: texto legible y densidad sin fatiga.
