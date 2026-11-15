---
version: 1
slug: "app-marketing-page-tsx"
primary_target: "app/(marketing)/page.tsx"
related_targets: ["app/(marketing)"]
---

# Landing pública (`app/(marketing)`)

**Modo:** Persuade. **Visitante principal:** el dueño que lo hace todo (negocio de 1-3 personas que atiende desde el celular); los equipos con agentes se cubren más abajo (asignación, equipos, SLA). **Acción:** crear cuenta con la prueba de 14 días de Pro sin tarjeta (`/register`). **Prueba:** demo viva del panel Andén con datos de ejemplo marcados como tales; no hay testimonios, logos ni cifras de clientes (PRODUCT.md). **Restricciones:** precios y prueba solo desde `_landing-offer-data.ts` / `lib/billing`; todo en español de México con tuteo; mundo Andén (DESIGN.md), con la regla de la lámpara y la de la tinta. Los textos pueden reescribirse sin inventar cifras ni promesas.

## Direction contract

THESIS: la página es una conversación. Colibly se presenta haciendo su trabajo: un chat de WhatsApp que llega de noche y se contesta al instante. Rechaza el arreglo de la categoría (titular centrado, subtítulo, dos botones y una captura del producto en un marco de navegador con fila de logos).

OWN-WORLD: concreto `#F3F4F2` y papel blanco, tinta `#15171A`, Laguna solo para actuar, ámbar solo como lámpara de espera. Barlow Condensed 700 en titulares grandes y cifras; Barlow en texto. Burbujas del panel (entrante papel, saliente Laguna tenue, hora y palomitas), lienzo del hilo en concreto alto, respuestas rápidas como botones a lo ancho, separador de día en píldora con mayúsculas espaciadas.

STORY: el dueño se reconoce en la clienta que escribe a las 23:40 y no recibe respuesta; ve que el bot contesta con los precios de su negocio, agenda y pasa la plática a una persona cuando hace falta; entiende canales, ruta de venta y precio en mensajes cortos; toca «Prueba 14 días de Pro».

FIRST VIEWPORT: teléfono 390 px. Barra con logo, «Probar 14 días» y menú. Titular de 2-3 líneas en Barlow Condensed ~44 px a la izquierda; una línea de apoyo. Debajo, el hilo ocupa el resto de la pantalla: separador «HOY · 23:40», pregunta, respuesta del bot, respuesta de la clienta, indicador de escritura; al pie del hilo, dentro de él, la respuesta rápida principal en Laguna («Prueba 14 días de Pro, sin tarjeta») y la secundaria «Ver precios». En escritorio el titular queda a la izquierda y el hilo a la derecha a altura de teléfono, sin marco de dispositivo.

FORM: composición 5 de 7 de la lista propia (la conversación como página), dealt lead. Interacción firma: los mensajes llegan como eventos en orden (escritura → burbuja → hora → palomitas); las secciones de abajo son tramos del mismo hilo, y las preguntas frecuentes son respuestas rápidas que abren su respuesta. Movimiento: solo la llegada de mensajes; con «reducir movimiento» todo aparece ya escrito.

