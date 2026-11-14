# n8n-nodes-colibly

Nodos de [n8n](https://n8n.io) para [Colibly](https://colibly.com), el CRM para WhatsApp. Incluye dos nodos:

- **Colibly**: contactos, conversaciones, mensajes, plantillas, medios, llamadas, automatizaciones y administración del número de WhatsApp.
- **Colibly Trigger**: inicia el flujo cuando pasa algo en Colibly. Usa un webhook firmado que se registra solo.

La interfaz está en español. Se puede usar como herramienta del **AI Agent** de n8n.

## Instalación

En tu n8n (self-hosted), entra a **Settings → Community Nodes → Install** y escribe `n8n-nodes-colibly`.

## Credencial

1. En Colibly, entra a **Configuración → API** y crea una API key. Activa solo los permisos de lo que vas a usar:

   | Permiso | Para qué sirve |
   |---|---|
   | `contacts:read` / `contacts:write` | Buscar, crear y actualizar contactos; ver y asignar etiquetas |
   | `conversations:read` / `conversations:write` | Leer conversaciones, mensajes, llamadas y usuarios; cambiar estado y asignación |
   | `messages:send` | Enviar mensajes y reacciones; subir medios; listar plantillas aprobadas |
   | `automations:run` | Listar y ejecutar automatizaciones manuales |
   | `webhooks:manage` | El nodo **Colibly Trigger** |
   | `whatsapp:manage` | Recurso **WhatsApp** y crear, editar o eliminar plantillas |

   También puedes limitar la key a ciertas cuentas. Una **key de prueba** (`sk_test_…`) solo lee y simula los envíos, así que sirve para armar el flujo sin mandar nada.
2. En n8n, crea una credencial **Colibly API** y pega la key. Deja la URL en `https://app.colibly.com`.

## Nodo «Colibly»

### Contacto

| Operación | Qué hace |
|---|---|
| Listar | Busca por nombre o teléfono y filtra por cuenta, etapa, etiqueta o fecha de actualización |
| Obtener | Un contacto por su ID |
| Crear u obtener | Crea el contacto en una cuenta de WhatsApp o devuelve el que ya tiene ese teléfono. Acepta nombre, etapa, etiquetas y campos personalizados. En los demás canales los contactos se crean solos cuando escriben |
| Actualizar | Nombre, nombre real, etapa del lead, valor del trato (MXN), fecha estimada de cierre y campos personalizados |
| Agregar etiqueta | Por nombre (si no existe, la crea) o elegida de la lista |
| Quitar etiqueta | Quita una etiqueta del contacto |

### Conversación

| Operación | Qué hace |
|---|---|
| Listar | Filtra por cuenta, estado, persona asignada, equipo o contacto |
| Obtener | Una conversación por su ID |
| Obtener mensajes | Los mensajes de una conversación, paginados |
| Actualizar | Estado (abierta, pendiente o resuelta), persona asignada o equipo. Si dejas el campo vacío, se quita la asignación |

### Mensaje

**Enviar** a un contacto, a una conversación o a un número de teléfono. Para enviar a un número eliges la cuenta de WhatsApp y escribes el teléfono con código de país; un número de 10 dígitos sin `+` se toma como de México. Si el contacto no existe, se crea. Enviar a un número solo funciona con plantilla.

Tipos de mensaje:

- **Texto**, **Botones** (hasta 3), **Lista** (hasta 10 opciones) y **Botón con URL**.
- **Imagen**, **Documento**, **Audio**, **Video** y **Sticker**. Indica la URL https del archivo o el ID de un medio subido.
- **Ubicación** y **Pedir ubicación**.
- **Producto** y **Catálogo**, de tu catálogo de Meta.
- **Flow**: un formulario de WhatsApp Flows. Puedes indicar la primera pantalla, los datos iniciales y una referencia que vuelve en el evento «Flow completado». También puedes mandar un Flow en borrador para probarlo.
- **Plantilla**: para escribirle a alguien fuera de la ventana de 24 h. Acepta variables por posición (`Ana|Pedido 123`) o con nombre (`{"nombre": "Ana"}`), el parámetro del encabezado (texto, URL o ID de medio), el del botón y el código de una plantilla de autenticación. En **Avanzado (JSON)** van los botones (payload, cupón), la oferta (`offerExpiresAt`), las tarjetas del carrusel y la ubicación del encabezado. La lista de plantillas muestra qué pide cada una.
- **Avanzado (JSON)**: cualquier otro tipo de `POST /messages`, como una lista de productos o tarjetas de contacto.

Opcionalmente, **ID del mensaje a citar** responde citando un mensaje de la misma conversación (solo WhatsApp).

Las otras operaciones son **Obtener**, que trae un mensaje por su ID, y **Reaccionar**, que pone un emoji sobre un mensaje de WhatsApp. Si el emoji va vacío, se quita la reacción.

Texto, botones y archivos solo se pueden enviar dentro de la ventana de 24 h del cliente; fuera de ella usa una plantilla aprobada.

### Plantilla

| Operación | Qué hace |
|---|---|
| Listar | Todas las plantillas |
| Obtener | Una plantilla con lo que pide al enviarse |
| Crear | La manda a revisión de Meta. Admite variables con nombre, botones (respuesta rápida, URL, teléfono, copiar código, Flow), oferta por tiempo limitado, carrusel y autenticación (OTP) |
| Editar | Cambia los componentes, y la categoría si aún no está aprobada. La plantilla vuelve a revisión |
| Eliminar | Borra la plantilla. Meta no deja reusar el nombre durante 30 días |
| Obtener analíticas | Envíos, entregas, lecturas y clics de una plantilla |

### Medio

Los medios son archivos que se suben una vez y se reusan en varios envíos.

| Operación | Qué hace |
|---|---|
| Subir | Sube un archivo desde una URL (imagen, documento, audio, video o sticker) y devuelve un ID que vale 30 días. Úsalo en un envío o en el encabezado o las tarjetas de una plantilla |
| Eliminar | Borra un medio subido |

### Llamada

Las operaciones son **Listar** y **Obtener**. Listar filtra las llamadas de WhatsApp por cuenta, contacto, dirección (entrante o saliente), estado (terminada, perdida, rechazada o fallida) y fecha.

### Automatización

| Operación | Qué hace |
|---|---|
| Listar | Todas las automatizaciones, o solo las activas con disparador manual |
| Ejecutar | Inicia una automatización con disparador manual para un contacto. Puedes pasarle variables |

### WhatsApp

Administra un número de WhatsApp. Necesita el permiso `whatsapp:manage`.

| Área | Operaciones |
|---|---|
| Estado | **Obtener estado del número**: calidad, límite de envío y avisos de Meta |
| Perfil | **Obtener perfil** y **Actualizar perfil**: descripción, dirección, correo, sitios web, giro y foto |
| Bloqueos | **Listar usuarios bloqueados**, **Bloquear usuarios** y **Desbloquear usuario** |
| Automatización conversacional | **Obtener** y **Actualizar** las sugerencias (hasta 4), los comandos y el mensaje de bienvenida |
| Códigos QR | **Listar**, **Crear** (con mensaje precargado) y **Eliminar** códigos QR |
| Analíticas | **Obtener costos**: costo de mensajería por periodo (por omisión, los últimos 30 días) |
| Catálogo y pedidos | **Obtener catálogo**: configuración del catálogo del número. Los pedidos llegan con el evento «Pedido recibido» |
| Flows | **Listar Flows**, **Obtener Flow**, **Crear Flow** (opcionalmente con el endpoint de datos de Colibly) y **Publicar Flow** |
| Números de la WABA | **Listar números**: los números de la cuenta de WhatsApp Business del número |
| Alta del número | **Cambiar PIN de dos pasos** y **Registrar número** en Cloud API. Si dejas el PIN vacío al registrar, se usa el guardado. La baja del número (`POST /accounts/{id}/deregister`) solo está en la API; desde n8n se llama con un nodo HTTP Request |
| Enlaces de conexión | **Crear enlace de conexión** y **Obtener enlace de conexión**. Tu cliente abre el enlace, conecta su número con su Facebook y el número entra a tu cuenta de Colibly, sin que el cliente tenga cuenta. Puedes poner el nombre de la cuenta, una referencia tuya, una URL de regreso y la vigencia (hasta 720 h). Cuando termina, llega el evento «Número conectado» |

### Espacio de trabajo

Listas para elegir valores o consultar la cuenta: **Listar cuentas**, **Listar etiquetas**, **Listar usuarios**, **Listar equipos**, **Listar plantillas** (todas o solo las de una cuenta) y **Obtener identidad de la key** (dueño, permisos y cuentas de la API key).

### Reintentos sin duplicados

Enviar, Reaccionar, Ejecutar automatización y Crear enlace de conexión mandan un `Idempotency-Key` por ejecución e ítem. Si reintentas el flujo, el mensaje no se manda dos veces.

## Nodo «Colibly Trigger»

1. Elige los eventos que te interesan, o **Todos los eventos**, que incluye también los que se agreguen después.
2. Si quieres, elige en **Cuentas** las cuentas que te interesan. Si lo dejas vacío, escucha todas las cuentas a las que la key tiene acceso. Si eliges una cuenta fuera del alcance de la key, el flujo no se activa y te avisa.

Al **activar** el flujo, el nodo crea su webhook en Colibly; al **desactivarlo**, lo borra. Cada entrega se verifica con la firma `X-Colibly-Signature` (HMAC-SHA256, 5 minutos de tolerancia). Sin firma válida, el nodo responde 401 y no dispara el flujo.

Estos son los eventos disponibles:

| Grupo | Eventos |
|---|---|
| Mensajes | Mensaje recibido, Mensaje enviado, Cambió el estado de un mensaje (entregado, leído o fallido), Mensaje actualizado |
| Contactos y leads | Contacto creado, Cambió la etapa del lead, Etiqueta agregada, Lead calificado (IA), Lead de anuncio capturado, Cambió la preferencia de marketing (baja o alta de marketing) |
| Conversaciones | Conversación asignada, Conversación resuelta, Bienvenida solicitada |
| Citas | Cita creada, Cambió el estado de una cita |
| Llamadas | Llamada sonando, Llamada contestada, Llamada terminada |
| WhatsApp | Flow completado, Pedido recibido, Cambió el estado de una plantilla, Cambió la categoría de una plantilla, Cambió la calidad del número, Número conectado |

La URL de tu n8n debe ser **pública por HTTPS**, porque Colibly no entrega a direcciones privadas. Si tu n8n corre en tu computadora, usa un túnel.

## Ejemplos

- **Lead nuevo a Google Sheets**: Colibly Trigger («Contacto creado») → Google Sheets (Append).
- **Etiqueta VIP a plantilla**: Colibly Trigger («Etiqueta agregada») → IF (`data.tagName` = VIP) → Colibly (Mensaje → Enviar, tipo Plantilla).
- **Respuesta con IA**: Colibly Trigger («Mensaje recibido») → AI Agent → Colibly (Mensaje → Enviar, tipo Texto, a la conversación).
- **Alta de clientes de una agencia**: tu CRM → Colibly (WhatsApp → Crear enlace de conexión, con tu ID de cliente en Referencia) → correo al cliente; Colibly Trigger («Número conectado») → guarda el `accountId` con esa referencia.

Documentación completa de la API: <https://app.colibly.com/docs/api>.

## Desarrollo

```bash
npm ci
npm run lint     # reglas de n8n para nodos de la comunidad
npm run build
npm test         # firma de los webhooks
```

Algunas reglas de `eslint-plugin-n8n-nodes-base` exigen textos en inglés. Están desactivadas con un comentario al inicio de cada nodo, que explica el motivo de cada una.

Licencia MIT.
