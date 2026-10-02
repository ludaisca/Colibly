# Punto 4: rendimiento visual — 30 de septiembre de 2026

Entorno: DEV en Podman. Se generó un build optimizado **solo para una vista previa local** en `localhost:15101`; no hubo despliegue. La medición se hizo con Playwright/Chromium, datos de demostración de Estudio Aurora y ventanas de 1440 × 900 y 390 × 844. El servidor DEV habitual permaneció en `localhost:15100`.

## Hallazgo y corrección

La Bandeja de Chats empezaba sin conocer las cuentas. Al terminar cinco peticiones cliente, aparecían el rail lateral en escritorio o los chips de cuentas en móvil. Esto desplazaba la conversación y la lista aunque los datos ya estuvieran disponibles en el servidor. Ahora las páginas de chat cargan las cuentas autorizadas durante el render inicial, con los mismos helpers de alcance por organización que las API. Se eliminó la segunda carga de esas cinco listas. El chat con URL de detalle también recibe la cuenta correcta desde el primer render.

| Vista | CLS local antes | CLS local después |
|---|---:|---:|
| Chat, 1440 px | 0,0346 | 0,0009 |
| Chat, 390 px | 0,0487 | 0 |

El pequeño ajuste restante en escritorio ocurre cuando se activa el panel redimensionable al hidratar React. No desplaza contenido funcional de forma apreciable. En el build final, el chat no pidió ninguna de las cinco API de cuentas al abrirse.

## Recorrido y respuesta visual

Se midieron landing, Panel, Estadísticas, Chat, Contactos, Pipeline, automatización con mapa de flujo y Configuración en ambos tamaños: 16 combinaciones, todas con HTTP 200 y sin desbordamiento horizontal. En este laboratorio local, las observaciones de LCP fueron de 0,12 a 0,58 s y el CLS fue 0 salvo el 0,0009 del chat de escritorio. Estas cifras **no son Core Web Vitals de usuarios reales**: la conexión es local, el equipo de prueba es rápido y hubo una carga por combinación, no percentil 75.

Con CPU del navegador ralentizada 4× se probaron interacciones sin modificar datos: abrir una FAQ, elegir un chat, abrir el mapa de flujo y seleccionar un nodo. Los eventos de clic observados duraron 32–48 ms en la FAQ, 144–160 ms al abrir un chat y 24 ms al seleccionar un nodo. El primer cambio a «Mapa de flujo» tardó 168 ms en móvil y 208 ms en escritorio, por el montaje inicial de React Flow; conviene vigilarlo con flujos más grandes. Estas duraciones son diagnósticas de laboratorio, **no una medición de INP de campo**.

Con `prefers-reduced-motion: reduce`, las transiciones calculadas de los controles inspeccionados fueron de 0,01 ms. No hubo errores de JavaScript en los recorridos de interacción.

## Validación y límites

El build optimizado pasó con TypeScript. Quedan seis advertencias de Turbopack sobre rutas dinámicas de archivos en `lib/whatsapp/media-store.ts`; no son errores de esta corrección. Pasaron ESLint de los archivos modificados, `git diff --check` y la suite de pruebas. La vista previa local se apagó al terminar; el entorno DEV normal y los datos de muestra se conservaron.

Para afirmar cumplimiento de Core Web Vitals en un sitio público harán falta mediciones de usuarios reales al percentil 75: LCP ≤ 2,5 s, INP ≤ 200 ms y CLS ≤ 0,1. El laboratorio identifica problemas y regresiones, pero no sustituye ese seguimiento. Referencias: [métricas Core Web Vitals](https://web.dev/articles/vitals), [INP](https://web.dev/articles/inp) y [CLS](https://web.dev/articles/cls).
