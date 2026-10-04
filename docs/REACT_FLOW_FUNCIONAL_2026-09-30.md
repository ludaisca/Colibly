# React Flow funcional — 30 de septiembre de 2026

Entorno: desarrollo local con Podman. La automatización de prueba «Flujo funcional · QA React Flow» quedó publicada en versión 1 y **PAUSED**, con disparador manual, en Estudio Aurora. No se enviaron mensajes reales ni se ejecutaron proveedores externos. Sus datos se conservan para inspección.

El mapa y el constructor vertical editan el mismo `draftGraph`. El usuario puede seleccionar y editar un nodo; añadir antes, después o dentro de una rama; moverlo con una conexión arrastrada o con el selector «Mover a…» accesible por teclado y móvil; reordenar pasos; y eliminar un paso con confirmación que advierte si contiene ramas. Las conexiones se aplican al árbol de ejecución: se rechazan ciclos, ramas inexistentes y pasos terminales en posiciones inválidas. La posición visual del lienzo no se guarda como lógica de negocio.

Comprobaciones realizadas:

- Pruebas puras de conexión y validación, más suite completa: 208 pruebas aprobadas; TypeScript y ESLint aprobados.
- Playwright: conexión arrastrada → guardar → recargar con el nuevo orden; añadir/eliminar en escritorio y móvil; eliminación confirmada desde el panel de edición móvil; mover con el selector móvil → guardar → recargar → restaurar el orden. Sin errores JavaScript ni desbordamiento horizontal en estos recorridos.
- Simulación del borrador: completó los pasos en el orden modificado sin envíos externos. Publicación: versión 1 creada y luego pausada. La versión publicada permanece inmutable; nuevas ediciones quedan en el borrador.
- Acceso directo por API a esa automatización: administrador de Aurora 200; ejecutivo 403; administrador de otra organización 404; sesión anónima 401, tanto en GET como en PATCH.
- `podman build --target builder -t localhost/colibly-buildcheck:tmp .`: terminó correctamente. El build aislado dejó de consultar PostgreSQL desde los layouts públicos durante el prerender; `COLIBLY_BUILD` impide arrancar workers desde `instrumentation.ts` en esa etapa.

Quedan avisos no bloqueantes en el build: importaciones de colas intentan resolver `redis` al generar páginas y Turbopack advierte que el acceso dinámico a ficheros de medios amplía el trazado del proyecto. No hubo despliegue. Después del build, el LV de Podman conservaba unos 12 GB libres y la raíz unos 1,1 GB.
