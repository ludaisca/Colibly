# Revisión de interfaz con Impeccable — 4 de octubre de 2026

Rama: `chore/probar-impeccable`. Se instaló la integración local de Impeccable para Codex en `.agents/skills/impeccable` y `.codex/hooks.json`. El detector quedó habilitado. `PRODUCT.md` y `DESIGN.md` fijan el público y la dirección de la beta: negocios de servicios que venden por WhatsApp, con configuración acompañada como ventaja demostrable.

## Alcance comprobado

- Auditoría de código de `app/` y `cpanel-site/` con `impeccable detect --json`: cero hallazgos tras configurar una excepción estrecha para el borde que dibuja un chevrón en las preguntas frecuentes del sitio PHP.
- Capturas y navegación autenticada con la organización ficticia `Estudio Aurora · Demo visual` a 1440 × 900 y 390 × 844 en 14 rutas: Panel, Chats, Contactos, Pipeline, Bots IA, Automatizaciones, Campañas, Usuarios, Configuración, Plan, Estadísticas, Citas, Meta Ads y Cuentas WhatsApp. Las 28 respuestas de página fueron 200. No se conectaron proveedores ni se enviaron mensajes.
- Beta Next.js y sitio PHP revisados en móvil y escritorio con el detector de página renderizada. El sitio PHP terminó sin hallazgos; en Next.js persisten ocho avisos de tarjetas anidadas dentro de la maqueta ilustrativa de conversación, donde las burbujas y elementos de chat son el contenido representado.
- El pipeline tiene un carril horizontal propio en escritorio. Su `scrollWidth` supera el ancho visible, pero el desplazamiento horizontal de la página es cero; en móvil se muestra una etapa a la vez.

## Decisiones aplicadas

- La beta explica una consulta, una cita o cotización y el trabajo humano de configurar y probar el asistente. Se retiraron anillos decorativos, etiquetas repetidas y rejillas de tarjetas que no ayudaban a entender la oferta.
- Las preguntas frecuentes responden qué ocurre con el precio después de la beta y si se puede revisar el número actual; el formulario aclara el formato del teléfono y el canal de respuesta. La copia se mantiene alineada entre Next.js y PHP.
- En el Panel, las conversaciones por atender aparecen antes de las métricas. La lista prioriza chats con mensajes sin leer y muestra cuántos hay en cada uno; el estado de mensajes tiene una acción directa. La incorporación muestra solo pasos pendientes.
- Los archivos del motor, caché y capturas de revisión no forman parte del producto ni del contexto de compilación. La integración de Codex y los informes de crítica sí quedan en el proyecto.

## Validación

`tsc --noEmit`, ESLint, las 367 pruebas de Vitest, `php83 -l cpanel-site/index.php`, la comprobación de sintaxis de `site.js` y `git diff --check` pasaron. La compilación de la etapa `builder` de la imagen de producción terminó correctamente. Emitió avisos de Redis no disponible durante la generación estática y de trazado dinámico en respaldos; no impidieron la compilación.

## Decisiones pendientes de lanzamiento

- La marca final «Impulso» sigue pendiente; el símbolo «C» y la paleta «Colibrí» son los vigentes.
- El precio y las condiciones comerciales posteriores a la beta necesitan validación antes de anunciar cifras en la invitación. La FAQ promete informar las condiciones antes de que termine la prueba, sin fijar una tarifa nueva.
- Los textos legales conservan las preguntas y marcadores de revisión de `app/(marketing)/_legal.tsx` y necesitan revisión jurídica antes de una publicación abierta.
- El proceso de conectar WhatsApp todavía depende de requisitos de Meta y de simplificar la incorporación técnica, tal como describe `docs/OFERTA_BETA_COLIBLY.md`.
