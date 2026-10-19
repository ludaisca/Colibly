# Propuesta de oferta beta de Colibly

**Superado (2026-10-18): decisión de Luis, el registro es ABIERTO** (sin beta privada por invitación ni tope de 10 negocios): cualquiera crea su cuenta en `/register` con 30 días de prueba del plan Pro, sin tarjeta. Los precios son los de `lib/billing/plans.ts` (Básico 5 USD, Pro 10 USD, sujetos a ajuste) y se muestran en `/precios`. El formulario de solicitud pasó a ser un contacto opcional. El resto de este documento queda como referencia de la propuesta original.

Estado original: propuesta para revisar antes de publicarla. Identidad visual actual durante la beta.

## A quién invitamos

Negocios pequeños que reciben consultas y venden por WhatsApp, especialmente cuando una o varias personas necesitan responder, dar seguimiento y recordar qué pidió cada cliente. Primer grupo: hasta 10 negocios, incorporados personalmente.

## Promesa principal

**Que ninguna conversación de venta se pierda entre los chats.** Colibly reúne las conversaciones en una bandeja para el equipo, organiza los contactos y ayuda a responder y dar seguimiento con IA.

## Oferta recomendada

**30 días de beta sin costo y sin tarjeta, a partir de que la cuenta quede lista para usarse.** Incluye una configuración inicial acompañada: una cuenta de WhatsApp, hasta tres integrantes, una bandeja compartida y un asistente de IA configurado con la información que facilite el negocio. Habrá una sesión inicial y seguimiento cercano para corregir fricciones. Al terminar, el negocio decide si sigue con un plan disponible; no se inicia un cobro automático por la beta.

Los límites de uso del plan Pro y de sus créditos de IA siguen vigentes durante la beta; la oferta no promete uso ilimitado. Los canales adicionales, campañas y automatizaciones avanzadas se pueden explorar con participantes adecuados, pero no forman parte de la promesa de incorporación inicial.

## Texto corto para la invitación

> **Vende por WhatsApp sin perder conversaciones.** Reúne tus chats, clientes y equipo en un solo lugar, con un asistente de IA que aprende sobre tu negocio. Te ayudamos a dejarlo listo. Estamos invitando a 10 negocios a probar Colibly durante 30 días sin costo y sin tarjeta. Al terminar, tú decides si continúas.

Llamada a la acción sugerida: **Solicitar acceso a la beta**. Tras la solicitud, pedir solo nombre, negocio, correo, WhatsApp de contacto y una breve descripción de cómo atienden hoy. El resto se recopila durante la incorporación acompañada.

## Experiencia de incorporación

1. Conversación breve para conocer el negocio y comprobar que WhatsApp es el canal adecuado.
2. El cliente confirma o crea su cuenta de Meta y autoriza la conexión de su número con nuestra guía. Nunca se solicitan contraseñas por correo o chat.
3. Cargamos horarios, productos o servicios, precios y preguntas frecuentes que el cliente apruebe.
4. Configuramos el asistente y probamos respuestas con ejemplos reales antes de activarlo.
5. Invitamos al equipo y enseñamos bandeja, asignación y seguimiento en una sesión corta.
6. Acordamos dos puntos de revisión durante el primer mes para recoger problemas y resultados.

La conexión de WhatsApp debe simplificarse antes de invitar negocios externos: el flujo actual solicita datos técnicos de la aplicación Meta de cada cliente. El objetivo es incorporar Embedded Signup o un proceso asistido que no obligue al cliente a copiar tokens y secretos. La prueba de 30 días ya es la duración por defecto (`TRIAL_DAYS`, desde 2026-10-01); si hace falta más, se extiende desde Plataforma y registrar la fecha de activación; después conviene automatizarlo para el programa beta.

## Condiciones que se deben comunicar sin letra pequeña

- La beta de Colibly es gratuita; Meta puede cobrar ciertos mensajes de WhatsApp según categoría y destino. Esos cargos son independientes de la suscripción de Colibly. Confirmar el modo de pago y quién recibe esos cargos durante la incorporación.
- El cliente conserva el control de su cuenta de Meta y de su número. La conexión depende de los requisitos y aprobaciones del proveedor.
- La IA se configura con información aprobada por el negocio y debe probarse antes de responder a clientes. El cliente puede pausar el bot y atender manualmente.
- La beta tiene límites de usuarios, canales y créditos; las funciones incluidas se muestran antes de activar la cuenta.
- Al terminar los 30 días, la cuenta no se cobra automáticamente. Si el cliente no elige plan, aplican el modo de solo lectura y la conservación de datos que describen los términos definitivos.

## Correos del dominio

Mínimo recomendado al comprar `colibly.com`:

| Dirección | Uso | Tipo |
|---|---|---|
| `contacto@colibly.com` | Solicitudes de beta, contacto público y respuesta general | Buzón real |
| `luis@colibly.com` | Administración de cuentas del negocio y conversaciones personales | Buzón real |
| `soporte@colibly.com` | Ayuda a participantes; puede llegar al mismo equipo de contacto | Alias hacia `contacto@` |
| `notificaciones@colibly.com` | Remitente de verificación, invitaciones y avisos de la aplicación; las respuestas deben llegar a una bandeja atendida | Alias hacia `contacto@` y remitente autorizado en SMTP |

`facturacion@colibly.com` puede añadirse como alias cuando se active el cobro. Configurar SPF, DKIM y DMARC para los proveedores que envíen correo. En `/plataforma` se debe establecer el remitente SMTP: el valor de reserva del código actual es `no-reply@colibly.com`.

## Antes de publicar esta oferta

- Cerrar si el primer grupo será de 10 negocios y si se ofrecerán 30 días desde la activación.
- Alinear landing, registro, correo de bienvenida, pantalla del plan y términos con la duración real de la beta. La prueba estándar es de 30 días (`TRIAL_DAYS`), como la beta; quedan por revisar correo de bienvenida y textos legales.
- Resolver la conexión sencilla de WhatsApp y probarla con al menos un negocio externo.
- Definir el formulario y seguimiento de solicitudes, y el proceso de selección e incorporación.
- Validar los precios posteriores a la beta y el coste real de IA y mensajería antes de publicarlos en la invitación.
