# Revisión visual integral — 29 de septiembre de 2026

La revisión se hizo en el entorno de desarrollo local con Podman y datos ficticios de la organización **Estudio Aurora · Demo visual**. Los datos permanecen en la base de desarrollo para permitir inspeccionar las pantallas llenas. No se conectaron cuentas reales ni se enviaron mensajes.

## Cobertura

- 23 rutas principales a 1440 y 390 px; 7 rutas de detalle a ambas resoluciones.
- Navegación representativa de los roles `admin`, `user` y `ejecutivo`; tema oscuro en Panel, chat, Pipeline, Contactos y Configuración.
- Chat y controles revisados además a 320, 768, 1024 y 1280 px.
- Plataforma: listado, configuración y modal de organización a 1440 y 390 px. El acceso temporal de la cuenta de prueba como operadora se retiró al terminar.
- Auditoría WCAG automatizada con axe en landing, Panel, Usuarios, conversación y Citas, más las dos pestañas y el modal de Plataforma. Estas vistas terminaron sin infracciones detectadas por axe.

En las rutas recorridas no hubo errores JavaScript ni desbordamiento horizontal global tras los ajustes. Las comprobaciones `tsc --noEmit` y ESLint de los archivos modificados pasaron.

## Ajustes aplicados

- Listas de Citas y Usuarios: el contenido y las acciones se distribuyen verticalmente en móvil, de modo que los nombres, horas y controles siguen visibles. La persona dueña ya no recibe controles que la API rechazaría.
- Chat: el compositor conserva espacio útil a ancho de tableta, el botón de envío tiene nombre accesible y el panel cambia a la vista compacta por debajo de 1024 px.
- Modales y controles: campos de fecha/hora se apilan en móvil; el menú desplegable evita controles interactivos anidados; progreso, filtros e interruptores tienen nombres accesibles.
- Contraste: se oscureció el texto secundario pequeño y los tonos de iniciales en el tema claro.
- Configuración: el campo del nombre del perfil se actualiza cuando llega la sesión. En Plan, “Canales registrados” describe correctamente la cuota, que incluye cuentas aún pendientes de conexión.
- Plataforma: la tabla se integró en una tarjeta con espaciado para evitar el desbordamiento móvil; los interruptores del modal identifican el canal que modifican.

## Datos de demostración

Estudio Aurora conserva tres integrantes con roles distintos; una cuenta WhatsApp pendiente y un chat web conectado; 18 contactos y conversaciones WhatsApp con mensajes; cinco conversaciones web con 15 mensajes; etiquetas, notas, citas, respuestas rápidas, plantilla, campaña, bot, calificador, secuencia y automatización. Los procesos de envío y automatización quedan inactivos para que la muestra no genere tráfico externo.

Las conexiones de Meta/Telegram, los envíos reales, Stripe y la actividad con proveedores de IA requieren credenciales y servicios externos; esta revisión valida su presentación y estados de interfaz, no esas integraciones. Las comprobaciones automatizadas de accesibilidad son una muestra de vistas y estados, no sustituyen una evaluación manual completa con teclado y lector de pantalla.
