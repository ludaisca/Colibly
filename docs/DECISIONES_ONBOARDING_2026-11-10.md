# Onboarding y prueba sin canal: decisiones (2026-11-10)

Lo que se implementó por defecto y lo que le toca decidir a Luis.

| # | Tema | Lo que quedó |
|---|---|---|
| D1 | Tope de prueba sin canal | 10 mensajes de IA por ORGANIZACIÓN (`TRIAL_AI_TEST_CREDITS` en `lib/billing/plans.ts`). Se puede bajar a 5. |
| D2 | Créditos normales de prueba | Sin cambios: 500 por persona (`TRIAL_AI_CREDITS_PER_USER`, `lib/billing/licenses.ts`). Opción a evaluar: 200. |
| D3 | ¿La bolsa de 10 se suma a los 500? | Independientes: la bolsa solo vale mientras no hay canal; al conectar aplican los 500. |
| D4 | Embeddings de la base de conocimiento | Sin cambios (no cuentan como crédito). Sin canal se podrían subir documentos grandes; opcional limitar el tamaño en esa fase. |
| D5 | Contactos sin canal en API v1 y webhooks | No se exponen hasta vincularse a una cuenta. Tampoco se emite `contact.created` al crear a mano (cambiaría el contrato); si se quiere, hay que ampliar el union de `lib/events/types.ts` y el enum de `lib/api/openapi.ts` y subir `API_SCHEMA_VERSION`. |
| D6 | Fusión al conectar WhatsApp | Si el teléfono ya existe en la cuenta (52… o 521…), se fusiona en el contacto de la cuenta (etiquetas, notas, citas, tareas, actividad y etapa) y se borra el duplicado. |
| D7 | Datos de ejemplo | Botón "Cargar datos de ejemplo" (no automático) en Panel, Contactos, Embudo y Citas; solo admin. Las conversaciones son un fixture estático. Alternativa no implementada: sembrar al crear la organización. |
| D8 | Horario por día | Sin cambios: un solo rango de horas para todos los días hábiles (`businessHourStart/End` + `businessDays`). La tarjeta de Configuración lo resume y lleva a `/configuracion/ia#horario`. |
| D9 | Respuestas rápidas, campos y atributos por organización | Siguen por cuenta; sin canal muestran un estado vacío con "Conectar WhatsApp". El alcance por organización queda como trabajo futuro (cambio grande de modelo). |
| D10 | `SUPPORT_WHATSAPP` | Variable nueva y opcional (solo dígitos con lada, p. ej. `5215512345678`). **Configurarla en Coolify**; sin ella `/ayuda` no muestra el botón de WhatsApp. |

Otras decisiones menores:
- Los contactos sin canal solo los ve y crea un admin (un `user` o `ejecutivo` no tiene cuentas a las que colgarlos).
- Estadísticas es una vista de la organización (no global de plataforma), así que se renombró su descripción para todas.
- El teléfono de las tarjetas del embudo se muestra como `+52 55 6862 3317` con el número completo en el título.
