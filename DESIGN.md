# Dirección de interfaz de Colibly

Esta dirección sirve para la beta dirigida a negocios de servicios que venden por WhatsApp. El diferencial comprobable es la configuración acompañada. El símbolo final «Impulso» aún está pendiente; estas reglas no lo sustituyen.

## Idea central

La interfaz debe sentirse como una mesa de trabajo para conversaciones reales. Primero muestra a quién responder, qué pidió y cuál es el siguiente paso. La tecnología aparece cuando ayuda a hacer ese trabajo; no ocupa el titular por defecto.

## Jerarquía

- En páginas públicas: situación reconocible → forma de trabajar → acompañamiento concreto → condiciones de la beta → solicitud.
- En el panel: acción pendiente y conversaciones → controles de trabajo → métricas secundarias → configuración.
- En incorporaciones: mostrar solo pasos pendientes y explicar quién ayuda a completarlos.
- Usar una composición editorial con espacio y divisores. Reservar tarjetas para objetos o acciones que necesitan un límite claro; evitar cuadrículas de tarjetas idénticas para contar una historia.

## Lenguaje

- Español directo y tuteo. Preferir «consulta», «cita», «cotización», «tu equipo» y «WhatsApp» cuando corresponda.
- Explicar «Meta», «IA» o «beta» junto a una consecuencia o acción concreta cuando aparezcan por primera vez.
- Decir exactamente cómo se configura y prueba el asistente, qué controla el negocio y qué costos externos pueden existir.
- No usar testimonios, resultados comerciales ni plazos de respuesta que no estén respaldados.

## Sistema visual vigente

- Los tokens semánticos de `app/globals.css` son la fuente para el panel y la beta en Next.js. `lib/brand-colors.ts` duplica solo los valores que no pueden leer CSS. El sitio PHP conserva su CSS independiente y debe seguir la misma dirección visual y de contenido.
- Violeta «Colibrí» para acciones y foco; rubí como apoyo. Los colores de estado se reservan para estados reales, no para decorar.
- La tipografía de títulos en el panel usa Bricolage Grotesque; el cuerpo, Hanken Grotesk. Mantener titulares cortos y párrafos con ancho legible.
- Mostrar foco visible y texto legible en ambos temas. Usar tokens semánticos; las clases `dark:` no siguen el selector de tema de este proyecto.
- La demostración de la beta es ilustrativa. Debe identificarse como ejemplo y nunca parecer una captura de un cliente.

## Revisión antes de publicar

Comprobar la beta de Next.js y la de PHP juntas, en móvil y escritorio, con teclado y sin datos precargados. En el panel, revisar con una organización que tenga conversaciones y otra que todavía no haya conectado WhatsApp. Mantener la misma promesa y las mismas condiciones en metadatos, preguntas frecuentes, formulario y mensajes de éxito.
