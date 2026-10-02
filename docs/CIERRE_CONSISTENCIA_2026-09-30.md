# Cierre del punto 3: consistencia de interfaz — 30 de septiembre de 2026

Entorno: DEV en Podman. Se revisaron los patrones compartidos de tablas, listas, filtros, formularios, carga, vacío, error y confirmación, junto con sus usos en los módulos. Las pruebas de fallos HTTP se hicieron con interceptación local en Playwright: no se ejecutó ningún borrado real ni se desplegó en producción.

## Cambios

- `Table` y `EntityList` ahora priorizan el estado de carga durante un reintento y distinguen error de vacío. El aviso de error solo ofrece «Reintentar» cuando existe una acción de reintento; ya no muestra un botón que no hace nada. Las cabeceras ordenables anuncian el sentido de ordenación y la columna de acciones tiene nombre accesible.
- El panel compartido de filtros se mantiene dentro del ancho móvil, anuncia si está abierto, nombra sus selectores y presenta una opción inicial explícita si un campo no trae valor vacío.
- Los errores de validación se muestran una sola vez por campo. Se revisaron con el AST de TypeScript las 48 instancias que pasan `error` a un control (`Input`, `PasswordInput`, `Select`, `Textarea`, `SearchableSelect` o `DatePicker`): todas están dentro de `FormField`, que ya dibuja el mensaje. El control conserva borde y `aria-invalid`; su mensaje propio queda disponible solo como opción explícita para usos independientes.
- Contactos y Chat distinguen «Sin resultados» de una lista realmente vacía y ofrecen limpiar búsqueda y filtros. Las dos pestañas de Campañas usan el mismo estado de error y reintento que las otras listas, sin mostrar datos vacíos o antiguos como si fueran el resultado de una carga fallida.
- `ConfirmDialog` bloquea nuevas confirmaciones mientras la acción asíncrona está pendiente y muestra los errores no gestionados dentro del diálogo. En Campañas, un DELETE fallido ya no muestra éxito; el diálogo permanece abierto. Tras un borrado correcto desde el detalle, la navegación vuelve a la lista. Las eliminaciones de campañas y fuentes de Sheets muestran el progreso y conservan el diálogo si fallan.
- Los detalles de campaña, fuente de Sheets, cuenta WhatsApp y bot muestran un error de carga con reintento, en vez de atribuir un fallo temporal a un recurso inexistente. La configuración de Plataforma también ofrece reintento si falla la lectura inicial.

## Comprobación

Playwright verificó a 320 px el panel de filtros de Contactos y Chat sin desbordamiento; una búsqueda sin coincidencias con acción para limpiar; fallo y recuperación de la lista de Campañas; fallo y reintento de su detalle; y un DELETE simulado con HTTP 500, una sola petición, botón deshabilitado durante la espera, diálogo abierto y ningún aviso falso de éxito. También se simularon fallos HTTP 500 en detalles de cuenta y bot y se comprobó que muestran error y reintento. En los formularios de usuario y bot se enviaron campos vacíos: cada error apareció una sola vez y no se creó ningún registro.

Pasaron `tsc --noEmit`, ESLint de los archivos modificados, `git diff --check` y `npm test` (208 pruebas en 9 archivos), todo dentro de contenedores de desarrollo. Los patrones compartidos cubren 30 usos de `Table`/`EntityList`; además se inventariaron los formularios y confirmaciones para detectar diferencias. Esta pasada no prueba servicios externos ni cada combinación posible de datos. El siguiente punto del plan es rendimiento visual y Core Web Vitals.
