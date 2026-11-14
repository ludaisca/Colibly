# Changelog

## 0.3.0

- WhatsApp: crear y consultar enlaces de conexión (tu cliente conecta su número sin cuenta en Colibly), ver los números de la cuenta de Meta, cambiar el PIN y registrar el número.
- Colibly Trigger: evento Account Connected.

## 0.2.0

- Mensajes: lista, botón con URL, ubicación, pedir ubicación, sticker, producto, catálogo, WhatsApp Flow y «Advanced (JSON)» para cualquier otro tipo (lista de productos, tarjetas de contacto…). Envío a un número (cuenta + teléfono), citar un mensaje (Reply To) y archivos por URL o por ID de Media.
- Plantillas: variables con nombre (objeto JSON), código de autenticación y «Advanced (JSON)» para botones, oferta y carrusel. Recurso Template: crear, editar, borrar, obtener y métricas.
- Mensaje → React: reaccionar con un emoji.
- Recursos nuevos: WhatsApp (estado, perfil, bloqueos, sugerencias y comandos, QR, costos, catálogo y Flows), Media (subir y borrar archivos) y Call (llamadas).
- Colibly Trigger: eventos de llamadas, plantillas, calidad del número, Flows, pedidos, bienvenida y preferencia de marketing.

## 0.1.1

- Colibly Trigger: si una cuenta elegida no está al alcance de la API key, al activar el flujo muestra un error claro en vez de descartarla en silencio (antes el webhook quedaba escuchando todas las cuentas).

## 0.1.0

- Credencial «Colibly API» (API key + URL).
- Nodo Colibly: contactos, etiquetas, conversaciones, mensajes, automatizaciones y catálogos.
- Nodo Colibly Trigger: webhook que se registra y se borra solo, con verificación de firma.
