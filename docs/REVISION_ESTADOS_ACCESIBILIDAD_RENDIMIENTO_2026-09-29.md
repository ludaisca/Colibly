# Revisión de estados, accesibilidad y rendimiento visual — 29 de septiembre de 2026

Entorno: desarrollo local en Podman. Se usaron cuentas y datos ficticios; no se conectaron canales reales ni se publicaron automatizaciones. Los datos de prueba permanecen en la base de desarrollo para revisar las pantallas llenas y vacías.

## Estados y consistencia

- Se creó la organización «Lumen · Estados vacíos» con perfiles `admin`, `user` y `ejecutivo`, sin recursos. Se amplió «Estudio Aurora · Demo visual» a 98 chats/contactos WhatsApp, 40 calificaciones y una automatización ramificada en borrador.
- Se recorrieron 58 combinaciones de ruta y ancho para estados vacíos/llenos, 32 visitas de perfiles no administradores, 32 simulaciones de fallo de API y listas densas a 1440 y 390 px. En chat, 103 conversaciones cargaron en lotes de 35, 65, 95 y 103 sin duplicados.
- Se corrigieron errores que mostraban «sin datos» o «sin cuenta» ante fallos de carga en Chat, Plantillas y Citas. Las tablas de calificaciones, detalle de campaña, detalle de automatización y consumo del bot conservan el ancho móvil. React Flow mantiene nodos legibles, selección y edición en móvil; guardar y recargar conserva el borrador.
- Las tablas y listas mantienen el mismo patrón de carga, vacío y error. Los encabezados ordenables son botones navegables con teclado.

## Accesibilidad

- Axe con reglas WCAG 2.0/2.1/2.2 A/AA en 25 rutas a 320 px: sin infracciones detectadas tras las correcciones. Tampoco hubo errores JavaScript ni desbordamiento horizontal global en esas rutas.
- Se añadieron nombres accesibles a paginación, acciones de fila, filtros y casillas de selección. Se ampliaron controles pequeños, se reforzó el contraste del enlace de atribución de React Flow y el enlace al plan ya se distingue sin depender solo del color.
- La prueba de teclado confirmó foco dentro del modal, cierre con Escape y selección del nodo de React Flow con Enter a 1440 y 320 px. La hoja global de estilos respeta `prefers-reduced-motion`.
- La auditoría automática y estas pruebas de teclado no equivalen a una evaluación completa con lector de pantalla.

## Rendimiento visual

- El mayor salto inicial provenía de la navegación y del usuario del encabezado: ambos esperaban a que la sesión llegara al cliente. El layout ahora les pasa la información desde el servidor. En la medición posterior, Panel pasó de CLS aproximado 0.109 a 0; Chat quedó cerca de 0.041, causado por la inicialización de paneles redimensionables y la lista.
- Las animaciones quedaron desactivadas efectivamente con la preferencia de movimiento reducido; no se observó desbordamiento en las vistas medidas a 1440, 390 y 320 px.
- Los tiempos de carga y tareas largas observados en el servidor Next de desarrollo no son una medición válida para prometer Core Web Vitals de producción. No se ejecutó `npm run build` por la restricción de espacio de la raíz y la indicación de detenerlo.

Verificación técnica: `tsc --noEmit`, ESLint de los archivos modificados y `git diff --check` dentro del entorno de desarrollo. Las pruebas de navegador usaron un contenedor Playwright temporal en Podman; no se instalaron dependencias en el host ni se borraron otros proyectos.
