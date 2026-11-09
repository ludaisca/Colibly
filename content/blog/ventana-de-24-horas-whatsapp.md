---
title: "La ventana de 24 horas de WhatsApp: qué es y cómo usarla"
description: "Qué es la ventana de atención de 24 horas de WhatsApp Business, qué puedes mandar dentro y fuera de ella y cómo evitar quedarte sin poder responder."
date: 2026-11-09
updated: 2026-11-09
category: whatsapp-business
author: equipo-colibly
related: [whatsapp-business-app-vs-api, precio-whatsapp-business-api]
---
**Respuesta corta:** la ventana de 24 horas es el periodo, contado desde el último mensaje del cliente, durante el cual puedes responderle con mensajes libres en la API de WhatsApp Business. Pasadas las 24 horas, solo puedes escribirle con una plantilla aprobada por Meta. Cada mensaje del cliente reinicia el conteo.

Si usas la API oficial de WhatsApp Business, tarde o temprano te toparás con esta regla. Entenderla evita mensajes que no se envían y sorpresas en la facturación de Meta.

## Cómo funciona la ventana

Cuando un cliente te escribe, se abre una ventana de atención de 24 horas. Dentro de ella puedes mandar cualquier mensaje: texto, imágenes, documentos, respuestas a sus preguntas. Cada vez que el cliente vuelve a escribir, la ventana se renueva por otras 24 horas.

Cuando la ventana se cierra, no puedes enviarle mensajes libres. Para retomar la conversación necesitas una **plantilla de mensaje**: un texto aprobado de antemano por Meta. Cuando el cliente responde a esa plantilla, la ventana se abre de nuevo.

## Qué cambia respecto a la app de WhatsApp Business

En la app del celular no existe esta restricción: puedes escribirle a quien quieras cuando quieras. La ventana es una regla de la API oficial, pensada para evitar el envío masivo de mensajes no solicitados. Si vas a pasar de la app a la API, conviene que tu equipo lo sepa desde el inicio. Hay más diferencias en [WhatsApp Business: app o API](/whatsapp-business-app-vs-api).

## Qué hacer según el caso

| Situación | Qué puedes hacer |
|---|---|
| El cliente escribió hace menos de 24 horas | Responder con mensajes libres |
| Pasaron más de 24 horas | Enviar solo una plantilla aprobada |
| El cliente responde a tu plantilla | La ventana se abre y vuelves a mensajes libres |

## Cómo no quedarte sin poder responder

- **Contesta dentro de la ventana.** Si un chat se queda sin atender y se cierra la ventana, perderás la posibilidad de responderle libremente.
- **Ten plantillas listas.** Para retomar conversaciones (seguimiento, recordatorios, avisos) crea plantillas con anticipación, porque su aprobación toma tiempo.
- **Revisa qué chats están por cerrar su ventana.** Una buena bandeja te muestra el tiempo que lleva cada chat esperando.
- **Pide una respuesta en tus plantillas.** Una pregunta al final invita al cliente a contestar y reabrir la conversación.

## Y los costos

Meta cobra algunos mensajes según su categoría, y la regla de cobro cambia con el tiempo. Lo importante es que revises la lista de precios vigente de Meta antes de planear campañas y que separes ese costo del de tu software. Lo explicamos en [cuánto cuesta la API de WhatsApp Business](/precio-whatsapp-business-api).

## Cómo lo maneja Colibly

Colibly aplica esta regla por ti: dentro de la ventana te deja escribir con libertad; fuera de ella, te lleva a elegir una plantilla aprobada, para que no intentes enviar un mensaje que Meta va a rechazar. Los envíos que salen por la API o por una automatización comprueban la misma regla antes de enviar. Consulta los [planes y precios](/precios) y prueba 14 días sin tarjeta.
