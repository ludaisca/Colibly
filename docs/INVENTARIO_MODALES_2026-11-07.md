# Inventario de modales — 2026-11-07

Antes de sacar `Modal` de HeroUI (`docs/INVENTARIO_UI_2026-11-07.md`), se revisó cada uso con la regla de Impeccable: **un modal solo se justifica cuando la tarea necesita interrumpir o proteger el foco** (`craft-floor.md`: "A modal for a task that needs neither interruption nor protected focus" está en la lista de rechazos). También aplica la regla de Web Design Guidelines de `overscroll-behavior: contain` en modales y cajones.

Cifras: **53 `<Modal>`** en 42 archivos y **33 `<ConfirmDialog>`** (encima de `Modal`). Todo el uso se midió con el parser de TypeScript (título, tamaño y número de campos de cada uno).

## Resumen

| Destino | Cuántos | Por qué |
|---|---|---|
| **Se queda como modal** | 19 + 33 confirmaciones | Interrumpe con razón: secretos que se ven una sola vez, seguridad, acciones irreversibles, bloquear una acción hasta completar datos, visor de medios |
| **Cajón lateral** (formulario largo) | 15 | Formularios de 6 o más campos: tapan la lista para nada y en el celular quedan apretados. Un cajón deja ver el contexto en escritorio y es pantalla completa en el teléfono |
| **Cajón lateral** (consulta) | 2 | Son listas para leer, no tareas: un cajón deja la página detrás |
| **Modal corto** (se queda; en el celular, hoja inferior) | 12 | Crear o editar algo de 1 a 5 campos desde una lista: el patrón actual del proyecto funciona |
| **En línea o panel anclado** | 5 revisados → 1 en línea, 1 cajón, 3 siguen como modal corto | Ver sección 5 |

## 1. Se queda como modal (19)

| Archivo | Modal | Razón |
|---|---|---|
| `configuracion/api/_api-key-form.tsx:84` | API key creada | Secreto que se ve una sola vez (`persistent`) |
| `configuracion/api/_api-keys.tsx:213` | Tu nueva API key | Secreto de una sola vez |
| `configuracion/api/_webhook-form.tsx:99` | Webhook creado | Secreto de una sola vez |
| `configuracion/api/_webhooks.tsx:247` | Nuevo secreto de firma | Secreto de una sola vez |
| `configuracion/_seguridad.tsx:214` | Escanea el código con tu app | Alta de 2FA (`persistent`) |
| `configuracion/_seguridad.tsx:245` | Guarda tus códigos de respaldo | Secreto de una sola vez |
| `configuracion/_seguridad.tsx:183` | Nuevos códigos / cerrar sesiones | Seguridad, pide contraseña |
| `configuracion/_seguridad.tsx:279` | Desactivar verificación en dos pasos | Seguridad |
| `plataforma/_soporte.tsx:195` | Quitar la verificación en dos pasos | Seguridad (operador) |
| `configuracion/plan/_datos.tsx:125` | Eliminar la organización | Irreversible |
| `configuracion/api/_api-keys.tsx:191` | ¿Rotar la API key? | Irreversible y con tres opciones (cancelar, rotar ya, rotar con gracia): `ConfirmDialog` solo admite una, así que queda como `Modal kind="alert"` (hecho 2026-11-07) |
| `configuracion/api/_webhooks.tsx:225` | ¿Rotar el secreto? | Igual: `Modal kind="alert"` |
| `whatsapp/cuentas/_form.tsx:106` | Cuenta conectada | Muestra URL del webhook y verify token para copiar una vez |
| `meta-ads/_form.tsx:159` | Cuenta de Meta Ads conectada | Igual |
| `components/meta-messaging/account-form-modal.tsx:137` | Cuenta conectada (Messenger/Instagram) | Igual |
| `whatsapp/cuentas/_conectar-whatsapp.tsx:170` | Conectar WhatsApp | Flujo externo (Embedded Signup de Meta) |
| `components/whatsapp/required-fields-modal.tsx:77` | Completa antes de resolver | Bloquea resolver hasta llenar los campos obligatorios |
| `components/whatsapp/chat-thread-panel.tsx:441` | Imagen / video | Visor de medios |
| `components/whatsapp/shortcuts-modal.tsx:10` | Atajos de teclado | Ayuda superpuesta (se abre con `?`) |

Las **33 confirmaciones** (`ConfirmDialog`: eliminar, desconectar, revocar, suspender, desactivar…) también se quedan: son acciones destructivas y Web Design Guidelines pide confirmación o deshacer.

## 2. Cajón lateral — formularios largos (15)

| Archivo | Formulario | Campos |
|---|---|---|
| `meta-ads/_form.tsx:218` | Conectar / editar cuenta de Meta Ads | 20 |
| `components/whatsapp/appointment-form-modal.tsx:255` | Agendar / editar cita | 18 |
| `whatsapp/bots/_form.tsx:160` | Crear / editar bot (`xl`) | 17 |
| `whatsapp/secuencias/_form.tsx:198` | Nueva / editar secuencia | 14 |
| `whatsapp/cuentas/_form.tsx:163` | Agregar número | 12 |
| `usuarios/_form.tsx:97` | Nuevo usuario | 11 |
| `whatsapp/calificadores/_form.tsx:151` | Crear / editar calificador (`xl`) | 10 |
| `components/meta-messaging/account-form-modal.tsx:194` | Conectar Messenger / Instagram | 10 |
| `configuracion/_atributos-conversacion-form.tsx:111` | Atributo de conversación | 9 |
| `configuracion/_campos-personalizados-form.tsx:114` | Campo personalizado | 9 |
| `plataforma/_operacion.tsx:284` | Crear token de operación | 7 |
| `usuarios/_teams.tsx:222` | Nuevo / editar equipo | 6 |
| `configuracion/api/_webhook-form.tsx:120` | Nuevo / editar webhook | 6 |
| `plataforma/_view.tsx:284` | Detalle de organización (`xl`) | 6 |
| `configuracion/api/_api-key-form.tsx:104` | Nueva API key | 5 (con permisos por alcance) |

## 3. Cajón lateral — consulta (2)

| Archivo | Contenido |
|---|---|
| `estadisticas/reportes/_view.tsx:320` | Chats de un agente |
| `whatsapp/calificadores/page.tsx:546` | Detalle de una calificación |

## 4. Modal corto, se queda (12)

`configuracion/_respuestas-rapidas-form.tsx` (4 campos), `configuracion/macros/_view.tsx` (3), `whatsapp/monitores/_form.tsx` (4), `telegram/cuentas/_form.tsx` (4), `webchat/cuentas/_form.tsx` (4 + snippet), `usuarios/_invite.tsx` (5), `usuarios/_license.tsx` (2), `components/channel-accounts/owner-modal.tsx` (2), `components/channel-accounts/share-modal.tsx` (1, lista de personas), `components/whatsapp/template-picker-modal.tsx` (elige y llena una plantilla desde el chat), `whatsapp/automatizaciones/_new-modal.tsx` (galería de plantillas), `components/whatsapp/contact-import-modal.tsx` (asistente por pasos).

En el celular conviene que se abran como **hoja inferior** (pegados abajo, a todo lo ancho), no como caja centrada.

## 5. En línea o panel anclado — revisado al implementar (5)

La primera clasificación salió del conteo automático; al abrir cada caso:

| Archivo | Decisión | Por qué |
|---|---|---|
| `components/whatsapp/chat-views-menu.tsx` | **En línea** (hecho) | "Guardar vista" es un solo campo: ahora se escribe dentro del mismo panel de Vistas |
| `whatsapp/automatizaciones/[id]/_builder.tsx:174` | **Cajón** (hecho) | "Agregar paso" deja visible el flujo que se arma |
| `whatsapp/calificadores/page.tsx:658` | Modal corto | No era un campo: alcance (radio) + cuadrícula de columnas; en un panel anclado no cabe en el celular |
| `components/whatsapp/macro-picker-modal.tsx` | Modal corto | Se abre desde un ítem del menú "⋯", que se cierra: no hay botón al que anclar un panel |
| `components/whatsapp/sticker-picker.tsx` | Modal corto | Igual: se abre desde "Más herramientas" del compositor |

## Cómo se haría

1. **`Modal` sobre Base UI `Dialog`** sin cambiar su API (53 usos + `ConfirmDialog`), con `overscroll-behavior: contain` y, en el celular, hoja inferior.
2. **Un prop `layout="drawer"`** en el mismo `Modal`: los 17 de las secciones 2 y 3 se mueven cambiando un prop, sin reescribir formularios. Pantalla completa en el teléfono, panel derecho en escritorio.
3. Rotar API key y secreto → `Modal kind="alert"` (no `ConfirmDialog`: tienen tres opciones).
4. Los 5 de la sección 5, revisados uno por uno (sección 5).

**Estado (2026-11-07): hecho.** `Modal` y `ConfirmDialog` corren sobre Base UI `Dialog`/`AlertDialog`; 18 usan `layout="drawer"` (los 17 + "Agregar paso"). HeroUI sigue instalado solo por `hero-tabs` y `hero-date-range`.

**Choca con una regla del proyecto:** `AGENTS.md` dice "CRUD is a `_form.tsx` modal next to the list". La sección 2 la cambiaría a "modal si es corto, cajón si tiene 6 o más campos". Se actualiza en el mismo cambio si se aprueba.
