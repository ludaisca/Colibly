# Colibly

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

La beta busca primero negocios de servicios que venden y atienden consultas por WhatsApp. Sus dueños y equipos pequeños necesitan responder, compartir el contexto de cada cliente y dar seguimiento a oportunidades sin perder conversaciones entre personas o teléfonos.

Dentro de cada negocio hay administradores que configuran canales y equipo, usuarios que trabajan campañas y conversaciones, y ejecutivos concentrados en la atención diaria. La operación también tiene un panel separado para quien administra la plataforma.

## Product Purpose

Colibly reúne conversaciones, contactos y equipo en una bandeja de atención; permite organizar seguimiento y configurar un asistente de IA con información aprobada por el negocio. El resultado buscado es que el equipo sepa qué cliente necesita respuesta y pueda avanzar la conversación sin reconstruir su historial.

## Positioning

En la primera beta, la ventaja que se puede sostener es la **configuración acompañada**: conocer el negocio, conectar WhatsApp con guía, preparar y probar el asistente con su información, enseñar al equipo y revisar el uso durante el primer mes. No presentar esta atención como una automatización ya resuelta ni como prueba de resultados comerciales todavía no medidos.

## Operating Context

El canal de entrada para la oferta inicial es WhatsApp. Un cliente pregunta por horarios, servicios o precios; distintas personas pueden responder, asignar la conversación y volver a ella. Durante la incorporación se revisan horarios, servicios, precios y preguntas frecuentes del negocio antes de activar respuestas automáticas.

La beta invita hasta diez negocios por 30 días desde que su espacio está listo para usar, sin tarjeta ni cobro automático. La solicitud pública recoge nombre, negocio, correo, WhatsApp de contacto y una descripción opcional. Las copias de la landing Next.js y PHP se mantienen por separado.

## Capabilities and Constraints

- Producto multiempresa con roles `admin`, `user` y `ejecutivo`; la información de una organización no debe filtrarse a otra.
- WhatsApp es el alcance de la promesa inicial. Telegram, Messenger, Instagram, webchat, campañas y automatizaciones existen, pero no son el centro de la incorporación beta.
- La IA usa créditos limitados; el negocio puede pausar el bot y responder manualmente. Algunos mensajes de WhatsApp pueden generar cargos de Meta independientes de Colibly.
- La conexión de WhatsApp depende de los requisitos y aprobaciones de Meta. No solicitar contraseñas por correo o chat.
- Las condiciones posteriores a la beta y los textos legales requieren las decisiones y revisiones pendientes documentadas en `docs/OFERTA_BETA_COLIBLY.md` y `docs/PLAN_LANZAMIENTO.md`. No inventar precios finales ni garantías de venta.

## Brand Commitments

El nombre es Colibly. El lema vigente en código es «El CRM de WhatsApp con IA para negocios que venden por chat». La comunicación pública usa español claro y tuteo; explica términos técnicos cuando son necesarios. La paleta «Colibrí» y los componentes existentes forman la identidad visual actual; el símbolo «C» es provisional y el logo «Impulso» sigue pendiente.

## Evidence on Hand

- `docs/OFERTA_BETA_COLIBLY.md`: propuesta de oferta, alcance y proceso de incorporación.
- `AGENTS.md`: reglas de producto, roles, diseño y operación de la aplicación.
- `app/(beta)/beta/` y `cpanel-site/`: dos implementaciones de la oferta beta. Sus demostraciones de interfaz son ilustrativas, no capturas ni resultados de un cliente real.
- No hay testimonios, cifras de conversión ni casos de clientes autorizados en el repositorio para sustentar afirmaciones de resultados.

## Product Principles

1. Mostrar el siguiente paso de cada conversación y quién puede atenderlo.
2. Explicar el producto con situaciones reconocibles para un negocio de servicios que vende por WhatsApp.
3. Enseñar lo que hará el equipo de Colibly durante la incorporación; no sustituirlo por promesas vagas de IA.
4. Mantener visibles límites, costos de terceros y control humano sobre las respuestas.
5. Permitir que un equipo pequeño empiece sin entender la terminología de Meta.

## Accessibility & Inclusion

El panel y los formularios deben poder usarse con teclado, lector de pantalla y en móvil. El sistema tiene temas claro y oscuro; la web pública mantiene tema claro. Los colores semánticos y sus contrastes se comprueban en `lib/design/__tests__/contrast.test.ts`.
