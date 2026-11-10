# n8n-nodes-colibly

Nodos de [n8n](https://n8n.io) para [Colibly](https://colibly.com), el CRM para WhatsApp: contactos, conversaciones, mensajes, plantillas y automatizaciones, más un disparador por webhook firmado.

*English below.*

## Instalación

En tu n8n (self-hosted): **Settings → Community Nodes → Install** y escribe `n8n-nodes-colibly`.

## Credencial

1. En Colibly, ve a **Configuración → API** y crea una API key. Activa los permisos de lo que vas a usar:
   | Permiso | Para |
   |---|---|
   | `contacts:read` / `contacts:write` | Buscar, crear y actualizar contactos y etiquetas |
   | `conversations:read` / `conversations:write` | Leer conversaciones y mensajes; cambiar estado y asignación |
   | `messages:send` | Enviar mensajes |
   | `automations:run` | Iniciar automatizaciones manuales |
   | `webhooks:manage` | El nodo **Colibly Trigger** |
2. En n8n crea una credencial **Colibly API** con esa key. La URL se queda en `https://app.colibly.com`.

## Nodo «Colibly»

| Recurso | Operaciones |
|---|---|
| Contact | Get, Get Many (búsqueda y filtros), Create or Get (solo cuentas de WhatsApp), Update (nombre, etapa, valor del trato, fecha de cierre, campos), Add Tag, Remove Tag |
| Conversation | Get, Get Many, Get Messages, Update (estado, persona asignada, equipo) |
| Message | Send (texto, botones, plantilla, imagen, documento, audio, video por URL), Get |
| Automation | Get Many, Run (automatizaciones con disparador «manual», con variables) |
| Workspace | Cuentas, etiquetas, usuarios, equipos, plantillas e identidad de la key |

- Los envíos y las ejecuciones de automatizaciones llevan `Idempotency-Key`: reintentar el flujo no manda el mensaje dos veces.
- Texto, botones y archivos solo se pueden enviar dentro de la ventana de 24 h del cliente; fuera de ella usa una plantilla aprobada.
- Se puede usar como herramienta del **AI Agent** de n8n.

## Nodo «Colibly Trigger»

Elige los eventos (mensaje recibido, contacto nuevo, cambio de etapa, etiqueta, conversación asignada o resuelta, citas, lead calificado…) y, si quieres, las cuentas. Al **activar** el flujo, el nodo crea su webhook en Colibly; al **desactivarlo**, lo borra. Cada entrega se verifica con la firma `X-Colibly-Signature` (HMAC-SHA256, 5 minutos de tolerancia); sin firma válida responde 401 y no dispara.

La URL de tu n8n debe ser **pública por HTTPS** (Colibly no entrega a direcciones privadas). Con n8n en tu computadora usa un túnel.

## Ejemplos

- **Lead nuevo → Google Sheets**: Colibly Trigger (`contact.created`) → Google Sheets (Append).
- **Etiqueta VIP → plantilla**: Colibly Trigger (`tag.added`) → IF (`data.tagName` = VIP) → Colibly (Message → Send, tipo Template).
- **Respuesta con IA**: Colibly Trigger (`message.received`) → AI Agent → Colibly (Message → Send, tipo Text, a la conversación).

Documentación completa de la API: <https://app.colibly.com/docs/api>.

---

## English

n8n community nodes for Colibly (WhatsApp CRM). Install `n8n-nodes-colibly` from **Settings → Community Nodes**, create a **Colibly API** credential with an API key from Colibly (**Configuración → API**) and use:

- **Colibly** — contacts, tags, conversations, messages (text, buttons, templates, media by URL) and manual automations. Sends are idempotent.
- **Colibly Trigger** — registers its own webhook in Colibly when the workflow is activated, verifies `X-Colibly-Signature` on every delivery and removes the webhook when deactivated. Requires the `webhooks:manage` scope and a public HTTPS n8n URL.

## Desarrollo

```bash
npm ci
npm run lint     # reglas de n8n para nodos de la comunidad
npm run build
npm test         # firma de los webhooks
```

Licencia MIT.
