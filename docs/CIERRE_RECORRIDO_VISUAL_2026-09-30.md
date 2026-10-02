# Cierre del punto 1: recorrido visual con datos — 30 de septiembre de 2026

Entorno: **DEV en Podman**, `http://localhost:15100`. Los datos son ficticios pero persistidos en PostgreSQL; no se conectó ningún canal externo ni se enviaron mensajes. No se modificó producción. Los registros QA permanecen para inspección.

## Cobertura

Se contrastaron las 47 rutas `page.tsx` del repositorio con el inventario de navegación y detalles. En esta pasada:

| Grupo | Comprobación |
| --- | --- |
| 23 rutas principales | 176 visitas a 1440 y 390 px: admin, user y ejecutivo de Aurora (con datos) y Lumen (vacío), solo en rutas a las que cada rol puede entrar. |
| 10 formularios y detalles de trabajo | 46 visitas a ambos anchos con registros persistidos y formularios sin cuenta. Incluye chat, bot, cuenta, plantilla, campaña, Google Sheets y automatización con ejecuciones. |
| 9 rutas públicas y de autenticación | 18 visitas anónimas a ambos anchos. |
| 5 rutas restantes | Demo de componentes, redirección `/whatsapp`, fuente de Sheets, entregas de webhook y `/plataforma`. La última devuelve 404 a quien no sea operador, como corresponde; su vista de operador ya se recorrió a ambos anchos en `REVISION_VISUAL_2026-09-29.md`. |

En total, 256 visitas de navegador en esta pasada, más reintentos dirigidos. Se esperó la carga final en las vistas que inicialmente mostraban `Cargando…`. No quedaron errores JavaScript ni desbordamientos horizontales globales en las rutas accesibles tras las correcciones. Se comprobaron adicionalmente 320 px en la fuente de Sheets. El ejercicio de 32 fallos simulados de API en listas, a 1440 y 390 px, consta en `REVISION_ESTADOS_ACCESIBILIDAD_RENDIMIENTO_2026-09-29.md`.

El estado denso incluye 103 conversaciones, 98 contactos WhatsApp, 40 calificaciones y una fuente QA con 12 filas de varios estados. Las pantallas sin datos usan Lumen. Las pantallas que no tienen listas largas propias se revisaron con sus datos disponibles; los componentes compartidos de listas y tablas se ejercitaron con los conjuntos densos anteriores. Los roles bloqueados se comprobaron por su navegación prevista, sin contarlos como pantallas accesibles.

## Hallazgos corregidos

- Una cuenta WhatsApp compartida mostraba al usuario acciones de edición, autoasignación y eliminación que la API rechaza. Ahora se muestran solo al dueño o a un admin; la lista también oculta `Eliminar` para quien solo tiene acceso compartido. Se verificó el menú y el detalle con ambos roles a 1440 y 390 px. Desapareció la solicitud 404 de reglas de enrutamiento para ese usuario.
- `Crear plantilla` sin WABA ID mostraba únicamente un aviso aislado. Ahora conserva título, enlace de regreso y acceso a cuentas; si falla la carga, ofrece `Reintentar`.
- El detalle de métricas de plantilla mostraba cuatro ceros y un gráfico vacío después de un error de Meta, lo que podía interpretarse como datos medidos. Ahora el error se muestra sin KPIs ni gráfico hasta que la consulta termine correctamente.
- La fuente de Google Sheets con actividad real de prueba desbordaba a 390 y 320 px. Su actividad tiene tarjetas móviles y las acciones del encabezado se envuelven en varias líneas; verificado sin desbordamiento a 1440, 390 y 320 px.

Para abrir los dos detalles que faltaban se añadieron a Estudio Aurora `visual-sheet-source-demo` y `visual-webhook-demo`. Ambos están **desactivados**, usan datos ficticios y no hacen tráfico externo. La fuente contiene 12 filas QA; el webhook, tres entregas QA de estados distintos. No se borró información previa.

## Límites de la conclusión

Este cierre valida la presentación y navegación con datos persistidos de DEV, estados vacíos, densidad representativa y fallos simulados. No valida entregas reales de WhatsApp/Meta/Telegram, sincronización real de Google Sheets, Stripe ni la apariencia con datos de clientes. Tampoco sustituye el punto 2 de accesibilidad manual, el punto 3 de consistencia fina o el punto 4 de Core Web Vitals. Las páginas legales siguen marcadas como borrador.

Verificación técnica: `tsc --noEmit`, ESLint de los archivos tocados y `git diff --check` en el contenedor DEV. Playwright corrió en un contenedor temporal. La imagen de build de comprobación anterior permanece en el LV de Podman; no se hizo un despliegue.
