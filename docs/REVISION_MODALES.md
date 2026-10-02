# Revisión de modales y paneles (dev, 2026-09-29)

## Criterio

- **Confirmación o acción breve:** diálogo. Las acciones destructivas usan `ConfirmDialog` con `AlertDialog`, foco inicial en «Cancelar» y cierre explícito.
- **Formulario de un paso:** modal con cuerpo desplazable y acciones siempre visibles. En móvil ocupa el ancho disponible; desde 640 px queda centrado. No se fuerza una cuadrícula de varias columnas dentro de un modal estrecho.
- **Consulta contextual:** drawer si se necesita conservar el contexto de la pantalla (ficha de contacto, ejecución y navegación móvil).
- **Exploración o autoría extensa:** página con URL propia, espacio para filtros, gráficas, tablas o vista previa.

## Decisiones por grupo

| Grupo | Componentes revisados | Decisión |
| --- | --- | --- |
| Confirmaciones | Eliminación, suspensión, revocación, rotación y desconexión en todos los módulos | Mantener diálogos; `ConfirmDialog` usa HeroUI `AlertDialog` y bloquea el cierre mientras se procesa. |
| Formularios breves | Usuarios, invitaciones, cuentas de canales, API keys, webhooks, Meta Ads, respuestas rápidas, campos personalizados, citas y automatización inicial | Mantener modales. El contenedor compartido corrige foco, cierre, desplazamiento, 12 px de radio y distribución del pie en móvil. |
| Configuración especializada | Bots, calificadores y secuencias | Mantener: son cambios de una entidad dentro de la lista o su detalle; los controles avanzados permanecen agrupados. Se redujeron cuadrículas estrechas. |
| Secretos de una sola visualización | Claves API, secreto de webhook y token de verificación de Meta | Mantener diálogos persistentes para que no se pierdan por un clic fuera o Escape. |
| Detalle contextual | Organización en Plataforma y análisis de lead | Mantener diálogo conectado a la lista; el de organización usa más ancho y dos columnas para canales. |
| Métricas de plantillas | Filtros, indicadores, gráfica y tabla diaria | Pasar a `/whatsapp/plantillas/[id]`: necesita ancho y una URL propia. |
| Creación de plantillas | Archivo de cabecera, variables, botones y vista previa | Pasar a `/whatsapp/plantillas/nueva`: formulario y vista previa adaptables; acciones después de la vista previa en móvil. |
| Entregas de webhooks | Hasta 50 registros y cuerpos JSON expandibles | Pasar a `/configuracion/api/webhooks/[id]/entregas`: la lectura y el diagnóstico necesitan una página. |
| Paneles laterales | Navegación móvil, ejecuciones de automatización y ficha de contacto | Conservar como drawers. El componente compartido usa Base UI, igual que la ficha de contacto. |

## Verificación

Playwright en contenedor, sin instalación en el host: anchuras de 375, 768 y 1440 px. Se comprobaron límites del viewport, desplazamiento del cuerpo, foco de «Cancelar» en confirmaciones, Escape, apertura y cierre de drawers, y ausencia de errores de JavaScript. TypeScript, ESLint y `git diff --check` pasaron en el contenedor de desarrollo.
