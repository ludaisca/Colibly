# Revisión pantalla por pantalla — 2026-11-07

Rama `feat/nueva-interfaz`, después de cerrar la auditoría (`AUDITORIA_UI_2026-11-07.md`).

## Cómo se hizo

- **36 rutas del panel × 4 combinaciones**: escritorio 1440 px y teléfono 390 px, de día y de noche (144 capturas). En el teléfono, además, captura por tramos de pantalla con la barra inferior en su lugar.
- **22 cajones, modales y menús** abiertos en el teléfono: menú, «Más», cajón de contacto, filtros, nueva cita, bot, monitor, calificador, automatización, secuencia, invitar, notificaciones, menú de usuario, búsqueda, vistas, menú de la conversación, IA del compositor y detalle por agente.
- **Medición automática por pantalla**:
  - desplazamiento horizontal;
  - texto por debajo de 11 px;
  - objetivos táctiles de menos de 24 px;
  - botones sin nombre;
  - errores de consola;
  - peticiones en reposo.
- **Cada texto que parecía mal escrito se comprobó en el código.** En las capturas, la «í» de Barlow en tamaño chico parece una «i». Ninguno de esos casos era un error real.
- **Datos:** organización de prueba (2 chats, 1 bot, 1 automatización, 1 plantilla, sin campañas). Las pantallas que necesitan datos (campañas, webhooks, Meta Ads) se vieron solo vacías.

## Lo que está bien

- Ninguna pantalla se desborda a lo ancho y no hay errores de consola en ninguna ruta.
- El modo noche es coherente en todas las pantallas revisadas; ningún bloque quedó con colores de día.
- La barra inferior se oculta dentro de la conversación. Los formularios cortos abren como hoja inferior en el teléfono y los largos como cajón a pantalla completa.
- Los estados vacíos son consistentes: icono, título, explicación y acción.

## Hallazgos

Formato: **qué pasa** — dónde → propuesta.

### Alta: errores o bloqueos

1. **«Hoy» se calcula en UTC** — en las métricas de plantilla y en Calificadores, `isoDaysAgo()` usa `toISOString()`. Después de las 18:00 en México, «hoy» ya es mañana: la captura de las 18:05 muestra «hasta 8 nov». → Usar la fecha local (`toISO` de `lib/format/calendar.ts`).
2. **Fechas nativas en formato de EE. UU. (`mm/dd/aaaa`)**:
   - Reportes (Desde y Hasta).
   - Cajón de contacto (Cierre estimado).
   - Agendar cita: fecha y hora, con `datetime-local`.

   Además, cada navegador las dibuja distinto. → `DateRangePicker` en Reportes y `DatePicker` en el contacto. La cita necesita un selector de hora que todavía no existe.
3. **Doble anillo de foco en todos los campos** — `Input`, `Textarea` y `Select` dibujan su propio anillo, y la regla global `:focus-visible` añade otro a 2 px (visible en «Nueva automatización»). → Un solo anillo: el del componente, con `outline: none` en el campo, o el global sin el del componente.
4. **La conversación en el teléfono deja poco espacio a los mensajes** — barra de la app + cabecera del chat + ruta de la venta + dos avisos de Meta (≈ 300 px) dejan ≈ 1/3 de la pantalla para el hilo. → Ocultar la barra de la app dentro de la conversación (como ya se hace con la barra inferior) y reducir los avisos a una línea que se pueda abrir.
5. **Botones sin nombre accesible**:
   - el botón de eliminar del detalle de bot (solo icono);
   - el interruptor «Cabecera (opcional)» de Nueva plantilla.
6. **Botón de menú (☰) de 22 × 22 px en el teléfono**, en todas las pantallas. → 40 px como mínimo (`Button size="icon"`).

### Media: contradice Andén o la consistencia

7. **Estados y etapas con colores de lámpara** — la regla de la lámpara dice que el ámbar y el rojo solo se encienden por espera o SLA. Hoy:
   - «Contactado» va en ámbar y «Perdido» en rojo: insignias de Contactos y columnas y puntos del Pipeline (`lib/pipeline/stages.ts`).
   - La insignia «Admin» de Usuarios va en ámbar.
   - El disparador de automatizaciones lleva icono naranja.
   - Las columnas del Pipeline usan fondos azul, ámbar, teal y verde con opacidad.

   DESIGN.md pide la ruta de la venta en el color de la cuenta. → Estados en neutro o tinta; color solo para «Cliente» (éxito).
8. **Colores fuera del sistema**:
   - Panel → «Acceso rápido»: iconos en coral/rosa.
   - Estadísticas → «Chats por cuenta»: barras carmesí, cuando deberían usar el color de cada cuenta (`hueClassFor`).
   - Métricas de plantilla: cuatro hex escritos a mano, entre ellos ámbar para «Clics».
9. **Selección marcada en teal en lugar de tinta**:
   - fila de chat seleccionada (`bg-accent-subtle`);
   - plantilla elegida en «Nueva automatización»;
   - ítem activo de la búsqueda (⌘K).

   Además, el filtro «Todas / Sin leer» de Notificaciones marca la opción en blanco, cuando lo que corresponde es `Segmented`.
10. **Dos cuentas con casi el mismo color** — «Test» y «Colibly Web» salen olivo y café en la bandeja. Con 8 tonos asignados por hash, los choques son probables. → Asignar el tono por orden dentro de la organización, o comprobar los choques.
11. **Tablas sin encabezados en el teléfono** — Reportes → «Por agente» y «Volumen» muestran números sueltos («1», «0») sin decir qué son. → La tarjeta móvil de `Table` debe mostrar la etiqueta de cada columna.
12. **Gráficas**:
    - «Mensajes diarios» usa una curva suavizada que inventa picos y valles entre días. → Línea recta o barras.
    - Los ejes de la gráfica de plantilla van a 10 px, por debajo del piso de 11 px.
13. **Llamadas: una petición cada 2 s con la pestaña visible** — `call-dock.tsx` consulta `/api/whatsapp/calls` aunque no haya llamada (30 por minuto por pestaña), fuera de `usePoll` y de `/api/inbox/sync`. Por eso el hilo nunca llega a «red en reposo». → Integrarlo al sondeo de la bandeja o espaciarlo cuando no hay llamada.
14. **«…» de acciones siempre visible junto a cada burbuja en el teléfono** — mucho ruido visual. → En táctil, pulsación larga (el `ContextMenu` ya existe) y sin botón permanente.
15. **Detalle de cuenta de WhatsApp en el teléfono**:
    - «Abrir chats», «Gestionar plantillas» y «Eliminar» quedan al final de 3 pantallas.
    - «Última actividad: 05 de noviembre de 2026 a las 07:…» sale cortada.
16. **Configuración en el teléfono**:
    - Son 6 pantallas seguidas, sin índice.
    - «Respuestas rápidas» y «Campos personalizados» piden elegir una cuenta, pero «Atributos» la trae ya elegida.
    - La tarjeta de Google Sheets dice «todavía no está disponible». → Índice o secciones plegables, el mismo criterio de cuenta en las tres, y ocultar lo que no está disponible.
17. **Cabeceras que no caben en el teléfono**:
    - Cuentas WhatsApp: «Conexión manual» y «Conectar WhatsApp» se parten en dos líneas.
    - Macros: «Volver a configuración» es un botón grande, cuando el resto de las pantallas usa el enlace «← Volver a…».
18. **El interruptor apagado casi no se ve** — la pista gris clara sobre papel no llega al 3:1 que se pide a los elementos que no son texto. → Borde o pista más oscura en el estado apagado.
19. **Pipeline**:
    - La tarjeta es angosta: el canal se corta («Telegram · 8…») y «hace 4 h» se parte en dos líneas.
    - En la fila del embudo, «Crear» mide 32 px y el campo 38 px.
    - Las herramientas del embudo (nuevo, editar etapas) ocupan la parte de arriba en el teléfono.
20. **Métricas de plantilla en el teléfono**:
    - «Detalle por día» son 30 filas de ceros (5 pantallas). → Ocultar los días en cero o plegar la lista.
    - Las dos fechas van en botones separados, cuando lo que corresponde es `DateRangePicker`.
21. **Constructor de automatizaciones en el teléfono**:
    - Las ramas quedan fuera de la pantalla y nada indica que se puede desplazar.
    - Las tarjetas de paso suben de sombra al pasar el cursor; DESIGN.md pide que no haya saltos.
22. **El cajón de contacto no ocupa toda la pantalla en el teléfono** — deja 32 px a la izquierda, y la regla para cajones es pantalla completa en el teléfono. Su cuarta pestaña sale cortada («C…»).
23. **Citas**: los dos filtros miden la mitad del ancho, uno sobre otro.
24. **Reportes**:
    - «Sin asignar» aparece dos veces (Ahora y Periodo).
    - La tarjeta «Perdido» queda sola en su fila.

### Baja: textos

25. **Plurales a medias**:
    - «1 abiertos», «1 nuevos · 0 resueltos», «1 altas en 7 días»;
    - «dueña de 3 canal(es)», «2 organización(es)»;
    - unos 20 más con «(s)»: importar contactos, campañas, avisos.

    → Un helper `plural()` con `Intl.PluralRules`.
26. **«Dueña» para todas las personas propietarias** — insignia y texto de Usuarios y del cambio de dueño. Le asigna género a cada persona. → «Titular», en lenguaje neutro.
27. **Términos crudos de API o de sistema a la vista**:
    - `en_US · UTILITY` en Plantillas → «Inglés (EE. UU.) · Utilidad»;
    - `America/Mexico City` → «Ciudad de México»;
    - notificación con «UNFLAGGED — límite de envío: TIER_250» e icono de teléfono;
    - insignia `admin` en minúsculas;
    - «Email»;
    - Meta Ads: «feedback loop», «Instant Forms»;
    - Bots: «Max tokens», «RAG», «msgs», y «score» en Calificadores.
28. **Nombres repetidos**: «Telegram · Telegram», «Telegram (Telegram)» cuando la cuenta se llama como el canal. → No repetir el canal si coincide con el nombre.
29. **Menú de usuario**: muestra el correo dos veces cuando no hay nombre; en Configuración aparece «Miembro desde —».
30. **Comillas rectas** en dos estados vacíos ('Motivo de contacto', 'Fecha de nacimiento') → «…».
31. **Nombre de sección distinto**: el menú dice «Monitores IA» y el título, «Monitores de temas».
32. **Búsqueda (⌘K) en el teléfono**: muestra los atajos «↑ ↓ / Enter / Esc», que en táctil no aplican. Además, «Abrir automatizaciones» y «Ver plan» usan el mismo icono de engrane.

## Siguiente paso

Arreglarlos en orden (alta → media → baja), uno por uno, decidiendo cada uno contigo como hasta ahora. Los 7, 9 y 13 son decisiones de diseño o de arquitectura antes que arreglos mecánicos.
