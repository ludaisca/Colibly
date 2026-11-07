---
version: 1
slug: "app-dashboard-whatsapp-chat-page-tsx"
primary_target: "app/(dashboard)/whatsapp/chat/page.tsx"
related_targets: ["app/components/whatsapp"]
---

# Bandeja de chats — brief de superficie

**Alcance:** bandeja multicanal (`/whatsapp/chat`): lista de chats, conversación y ficha de contacto. Modo **Operate**. Primera superficie de la nueva interfaz; el mundo elegido se extiende después al resto del panel.

**Audiencia y tarea:** dueños y agentes que atienden **sobre todo desde el celular**, con cualquier luz. Tarea: ver qué chat espera, contestarlo y moverlo hacia la venta sin que ninguno se enfríe.

**Restricciones:** burbujas tipo WhatsApp (izquierda/derecha) intactas; identidad universal, sin folclor ni referencias exclusivas de un país; controles estándar de la web (Base UI + `app/components/ui/`); tokens semánticos; tema claro y oscuro controlados por la app.

**Decisión:** dirección **Andén**, elegida en la segunda ronda (2026-11-07) entre Andén, Recorrido y Turno. Bocetos: https://claude.ai/artifact/5XijttbAPF6AmZMf6J5oYz

## Direction contract

THESIS: La bandeja es el tablero de un andén: los chats se ordenan por tiempo de espera y el tiempo es el dato protagonista. Rechaza la bandeja estándar ordenada por último mensaje, con avatares redondos y contadores de no leídos como único estado.

OWN-WORLD: Concreto claro de día (#F3F4F2) y andén casi negro de noche (#0F1113), tinta #15171A, superficies blancas planas. Cada cuenta lleva su color de línea (franja de 4px a la izquierda de la fila, chips de línea). Lámparas de estado: ámbar a los 30 min de espera, rojo al vencer el SLA. Barlow para todo; Barlow Condensed solo en títulos y cifras del tablero. Cifras de espera en celdas con línea de corte al medio, `tabular-nums`.

STORY: Al abrir, el agente ve de inmediato cuál chat lleva más esperando y cuánto; entiende por color de qué cuenta es y por lámpara si ya es urgente; abre, contesta y ve en qué estación de la venta va el cliente (Nuevo → Atendido → Cotizado → Venta).

FIRST VIEWPORT: Teléfono 390px. Arriba: título "Chats" condensado y "Ordenado por espera" a la derecha. Debajo: chips de línea por cuenta (la activa en tinta llena). Cabecera de tabla "Esperando N · Espera". Lista de filas blancas: franja de color de cuenta, nombre y último mensaje, y a la derecha la lámpara y la espera en celdas (h:mm). Barra inferior estándar: Chats, Contactos, Pipeline, Más. En la conversación: cabecera con nombre, cuenta, asignado y la ruta de estaciones en el color de la cuenta.

FORM: Fusión elegida por el usuario de dos direcciones de la primera ronda (tablero de espera, retador `signals-instruments-split-flap-concourse`, + líneas de señalética de transporte, candidata propia #1), sin referencias locales. Firma: el tiempo que voltea (celdas de espera que giran al cambiar; desactivado con prefers-reduced-motion). seed:d7fe44f887bd80d9

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
