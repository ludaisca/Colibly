# Auditoría de código y evaluación de una migración a Rust (2026-11-19)

Cierre de la sesión de MCP, grupos de WhatsApp y comentarios de Meta. Dos preguntas: qué optimizar del código actual y si conviene migrar todo a Rust.

## Resumen

- **El código está sano.** 135 mil líneas de TypeScript, 1 `any` explícito, 0 `@ts-ignore`, 26 `eslint-disable` (casi todos justificados), 1 TODO real (IVA en `lib/billing/plans.ts`, pendiente del contador), 1502 pruebas pasando. La deuda está concentrada en unos pocos archivos grandes, no repartida.
- **Producción va muy holgada.** Último mes del servidor completo (Coolify, app, Postgres, Redis, GoWA): ~12 % de CPU promedio, 3,1 de 12,5 GB de RAM, red de ~1 KB/s. Los picos (25-40 %) coinciden con los despliegues, que construyen la imagen en el mismo servidor.
- **El riesgo real eran las dependencias**: 13 vulnerabilidades (5 altas). Corregido en este cambio: quedan 0 altas y 5 moderadas indirectas.
- **Migrar todo a Rust no conviene.** El trabajo de Colibly es esperar a Meta, a los proveedores de IA y a Postgres, no calcular. Reescribir 135 mil líneas costaría más de un año sin ganancia que el cliente note. Las alternativas útiles están al final.

## Inventario

| | Archivos | Líneas |
|---|---:|---:|
| `app/` (páginas, componentes, 306 rutas de API) | 710 | 74 139 |
| `lib/` (lógica, workers, 176 archivos de prueba) | 572 | 58 978 |
| `integrations/` (SDK Node/Python, n8n) | 13 | 2 215 |

84 modelos de Prisma, 25 colas de BullMQ, 82 páginas. 35 dependencias de producción.

## Lo que se corrigió en este cambio

| Antes | Después | Cómo |
|---|---|---|
| `nodemailer` 8: lectura de archivos y SSRF por la opción `raw` (alta). No la usamos, pero la dependencia la traía. | 10.6.0 | `npm install nodemailer@^10.6.0`. `next-auth` beta la pide como dependencia par opcional (solo para su proveedor de correo, que no usamos): `overrides` en `package.json` para que `npm ci` no falle. Probado: el correo de recuperar contraseña sale igual. |
| `next` 16.4.3: dos fugas de caché con `use cache` (moderadas; no usamos `use cache`). | 16.4.6 | Parche. |
| `zod` < 4.6.6: agotamiento de memoria con colecciones grandes (alta). La API ya corta cuerpos de más de 1 MB. | parche | `npm audit fix`. |
| `hono` y `@hono/node-server` (los trae el SDK de MCP): ruta con `\` que salta controles por ruta. | parche | `npm audit fix`. |
| `source-map-js` (alta, indirecta). | parche | `npm audit fix`. |

Quedan 5 moderadas en `glob`/`minimatch`, dependencias de herramientas de build, sin camino de entrada de usuarios.

Verificado: `tsc`, lint, 1502 pruebas, arranque en dev, build de producción (`npm ci` + `next build`) y envío de correo a Mailpit.

## Hallazgos y recomendaciones

Ordenados por valor/esfuerzo. Nada de esto es urgente: la carga actual es baja.

### 1. Construir la imagen fuera del servidor de producción (alto valor, poco esfuerzo)

Los únicos picos de CPU y disco del mes son los despliegues: Coolify construye la imagen (npm ci + next build, ~7 min) en la misma máquina que atiende a los clientes. Con más tráfico, cada despliegue degradará la app. Opciones: construir en GitHub Actions (el CI ya corre `next build`), publicar la imagen en un registro y que Coolify solo la descargue. Además, el despliegue se vuelve reproducible y la reversión es instantánea.

### 2. Separar los workers del servidor web (medio esfuerzo, mucho aislamiento)

`instrumentation.ts` arranca las 25 colas dentro del mismo proceso de Next. Un worker pesado (indexar un PDF grande, una campaña de miles de mensajes, el historial de coexistencia) compite por el mismo event loop que las peticiones de la bandeja, y un fallo de memoria tumba las dos cosas. Mismo código, dos contenedores: `app` con `COLIBLY_WORKERS=0` y `worker` con un `node` que solo llama a `startWorkers()`. Permite escalar cada uno por separado.

### 3. Encolar la ingesta del webhook de WhatsApp (medio esfuerzo)

`/api/whatsapp/webhook` ingiere los mensajes dentro de la petición (Prisma, automatizaciones, bot). Meta espera respuesta en pocos segundos y reintenta; con picos (una campaña que genera miles de estados) las respuestas se alargan. Responder 200 al validar la firma y procesar en una cola (como ya se hace con el historial de coexistencia) separa la recepción del trabajo. El dedupe por `wamid` ya hace seguro el reintento.

### 4. Partir los tres archivos más grandes (mantenibilidad)

| Archivo | Líneas | Propuesta |
|---|---:|---|
| `app/components/whatsapp/chat-workspace.tsx` | 1 723 | Extraer el envío (`performSend`, adjuntos, reintentos) a un hook `useChatSend`, y el sync de la bandeja a `useInboxSync`. Hoy cualquier cambio del compositor toca el componente que también maneja la lista. |
| `app/(dashboard)/whatsapp/cuentas/[id]/page.tsx` | 854 | Una sección por archivo (perfil, salud, coexistencia, llamadas). |
| `lib/api/openapi.ts` | 2 690 | Es datos: dividir por recurso (`openapi/contacts.ts`…) y unir en el índice. |

### 5. Dependencias con versión mayor pendiente (planear, no correr)

| Paquete | Hoy | Última | Nota |
|---|---|---|---|
| `prisma` / `@prisma/client` | 5.22 | 7.x (8 en RC) | El salto más valioso: cliente sin motor Rust binario (más liviano), mejores tipos. Requiere revisar el índice IVFFlat y las consultas en crudo. Proyecto aparte. |
| `next-auth` | 5.0.0-beta.32 | sigue en beta | Vigilar; es la dependencia más riesgosa por estar en beta. |
| `bullmq` | 5.79 | 6.x | Revisar cambios de API de workers. |
| `motion` | 12 | 14 | Solo un archivo lo usa. |
| `googleapis` | 173 | 190 | Pesa 203 MB en `node_modules` y solo se usa para Sheets y OAuth de Google: cambiar a `@googleapis/sheets` + `google-auth-library` reduce la imagen ~200 MB. |

### 6. Menores

- 42 `console.log` en código de producción: pasar a un logger con niveles (`pino`) para poder filtrar en Coolify y no registrar datos de más.
- Las 5 consultas dentro de bucles encontradas (`lead-recovery-worker`, `macros/execute`, `template-sync`, `coexistence`) procesan lotes acotados; no son urgentes, pero `lead-recovery-worker` podría traer el último entrante de todos los chats del lote en una consulta.
- El índice `(accountId, lastMessageAt DESC NULLS LAST)` quedó pendiente en `RENDIMIENTO_2026-11-04.md` (R6): hacerlo antes de las 100 000 conversaciones por cuenta.

## ¿Migrar todo a Rust?

### Qué habría que reescribir

| Pieza | Hoy | En Rust | Comentario |
|---|---|---|---|
| Interfaz (82 páginas, ~60 mil líneas de React) | Next.js + React | Leptos/Dioxus (WASM), o mantener React | Rust no reemplaza React de forma práctica: el panel se reescribiría desde cero o se quedaría en React. |
| API (306 rutas) y lógica (59 mil líneas) | Next route handlers + TS | Axum + SQLx/SeaORM | Reescritura completa, regla por regla (alcance por organización, facturación, licencias, roles). |
| Colas (25) | BullMQ | apalis / sidekiq-rs / propia sobre Redis | Sin equivalente maduro de BullMQ; habría que migrar los jobs en vuelo. |
| Autenticación | NextAuth (JWT, 2FA, sesiones) | propia | Lo más delicado de reescribir. |
| SDKs | Stripe, OpenAI, Google, MCP, web-push, AWS S3 | parciales, varios comunitarios | El SDK oficial de MCP para Rust existe (`rmcp`); Stripe y Google no tienen SDK oficial en Rust. |

### Costo y beneficio

- **Costo:** 135 mil líneas y todo el comportamiento acumulado (cada trampa de `gotchas.md` es una regla que hay que volver a codificar). Con un equipo pequeño, 12-18 meses con el producto congelado o en dos versiones paralelas, y el riesgo de reintroducir fugas entre organizaciones que hoy cubren las pruebas.
- **Beneficio:** menos memoria por proceso (Node ronda 300-500 MB; un servicio Rust equivalente, 50-100 MB) y menos CPU por petición. Pero hoy el servidor usa el 12 % de CPU y el 25 % de RAM con todo incluido, y el tiempo de cada petición lo ponen Meta, los proveedores de IA y Postgres, no el cómputo. El cliente no notaría la diferencia.
- **Conclusión:** no migrar. Si la pregunta es «¿qué nos dará margen cuando crezcamos?», las respuestas son las recomendaciones 1-3 (build fuera, workers aparte, ingesta encolada), que se hacen en días.

### Dónde sí tendría sentido Rust (si aparece la necesidad)

Solo con una medición que lo justifique, y como pieza aislada:

1. **Un servicio de recepción de webhooks** de alto volumen (WhatsApp, Meta, GoWA): valida la firma, deduplica y encola en Redis. Es pequeño, sin lógica de negocio, y es lo primero que sufre con picos. Axum lo resuelve en pocos cientos de líneas.
2. **Procesamiento de medios o documentos** si se vuelve pesado (transcodificar audio/video, extraer texto de PDF grandes para la base de conocimiento): un módulo nativo con `napi-rs` llamado desde el worker, o un sidecar.
3. **Importaciones masivas** (CSV de contactos de cientos de miles de filas), si llegan a bloquear un worker.

Antes que Rust, dos pasos más baratos: Node 24 (hoy `node:22-alpine`) y medir con `--cpu-prof` el worker que se queje.

## Estado (2026-11-19, tarde)

| # | Recomendación | Estado |
|---|---|---|
| 1 | Imagen fuera del servidor | **Preparado.** Job `image` en CI publica `ghcr.io/ludaisca/colibly`. Falta, del lado del operador: acceso de Coolify a GHCR y cambiar `build:` por `image:` (pasos en `desarrollo.md`). |
| 2 | Workers aparte | **Hecho.** Servicio `worker` en `docker-compose.yml` (`COLIBLY_WORKERS`, `COLIBLY_SKIP_MIGRATIONS`). Probado con la imagen de producción. |
| 3 | Ingesta del webhook encolada | **Hecho.** Cola `whatsapp-inbound`; la ruta pasó de 767 a 395 líneas y la lógica a `lib/whatsapp/webhook-messages.ts`. Si Redis falla, procesa en línea. Respuesta a Meta en dev: 80-140 ms. |
| 4 | `googleapis` → paquetes sueltos | **Hecho.** `@googleapis/sheets` + `google-auth-library` (~3 MB contra 203 MB). El email de la cuenta de Google sale de `getTokenInfo()` del token. No probado contra Google real (dev no tiene credenciales de Google). |
| 5 | Archivos grandes y Prisma 7 | **Planeado, sin tocar.** Partir `chat-workspace.tsx` necesita una prueba manual completa de la bandeja; `openapi.ts` es datos (sin ganancia de rendimiento). Prisma 7: proyecto aparte — cambia el generador (`prisma-client`, sin motor binario), requiere revisar el índice IVFFlat (`prisma/sql/ensure-vector-index.sql`), las consultas `$queryRaw` y `scripts/new-migration.sh`. |

## Próximos pasos sugeridos

1. Construir la imagen en CI y desplegar la imagen (recomendación 1).
2. Separar el contenedor de workers (recomendación 2).
3. Cambiar `googleapis` por los paquetes sueltos (imagen ~200 MB más chica).
4. Planear Prisma 7 como proyecto propio.
