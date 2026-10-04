# Cierre del punto 2: accesibilidad — 30 de septiembre de 2026

Entorno: desarrollo local en Podman, con datos de demostración existentes. No se desplegó en producción ni se modificaron datos de otros proyectos.

## Alcance y resultado

- Axe con reglas WCAG 2.0, 2.1 y 2.2 A/AA: 45 rutas a 320 px en tema claro. Las 11 rutas con hallazgos iniciales se corrigieron y volvieron a ejecutar sin infracciones detectadas. Se probaron además 25 rutas en tema oscuro a 1440 px; los 3 casos iniciales de contraste se corrigieron y volvieron a ejecutar sin infracciones.
- Teclado: el enlace «Saltar al contenido principal» funciona en la landing y el panel; la paleta de comandos abre con Ctrl+K y cierra con Escape; el foco permanece dentro del modal y vuelve al botón que abrió el menú móvil después de cerrarlo. Los nodos de React Flow se pueden seleccionar con Enter. Se comprobó el foco visible de los controles del panel a 320 px.
- Reflow y espaciado: 10 rutas representativas a 320 px con los valores de espaciado de texto de WCAG no tienen desbordamiento horizontal global. Las tablas anchas conservan desplazamiento propio y una región accesible por teclado. Los textos abreviados de tarjetas y listas mantienen acceso al detalle desde su enlace.
- Formularios: los controles de cuentas, campañas, fuentes de Sheets y calendario ahora tienen nombres accesibles; los enlaces en páginas de autenticación y legales se distinguen sin depender solo del color. En el registro inválido, cada campo anuncia su error y el foco pasa al primero. El calendario abierto se comprobó a 390 px sin desbordamiento y sin infracciones de axe tras concluir la animación.
- Tamaño de controles: se ampliaron los botones de borrar fecha y cerrar aviso a 32 × 32 px. El calendario ajusta su posición cerca del borde derecho de la pantalla.

## Correcciones principales

Se añadió un enlace para saltar al contenido en los layouts del panel y del sitio público; se nombraron controles sin etiqueta y se separó el botón de reintentar del elemento `<summary>` de entregas de webhook. Se reforzó el contraste en estadísticas, pipeline y avatares oscuros. Se ajustaron encabezados y tarjetas para que se reorganicen a 320 px y con mayor espaciado de texto. La lista de métricas de plantilla conserva su título y calendario dentro del ancho móvil.

## Verificación y límites

Pasaron `tsc --noEmit`, ESLint de los archivos modificados y `git diff --check`. Las pruebas de navegador se hicieron en un contenedor Playwright temporal; no se instalaron dependencias en el host. Axe y las pruebas de teclado/reflow detectan problemas concretos, pero no demuestran conformidad WCAG completa: queda una revisión con lector de pantalla y usuarios de tecnologías de apoyo antes de afirmar esa conformidad. No se probaron servicios externos ni se publicó la aplicación.

Referencias: [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/), [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
