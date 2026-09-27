# Plan de lanzamiento — de proyecto a negocio

**Creado:** 2026-09-27. Documento para retomar la preparación del producto como negocio: qué está hecho, qué se decidió y en qué orden sigue. Se actualiza conforme avanza (marcar `[x]` solo lo terminado y verificado).

## Estado al 2026-09-27

Rama `feat/api-webhooks-automatizaciones` subida a GitHub (aún sin PR a `main`; el CI corre al abrirlo).

**Ya construido y verificado:**
- SaaS multi-organización (S1–S5): tenencia, correo y verificación, planes con candados de facturación, IA de la plataforma con créditos, marca y landing.
- Landing con medición con consentimiento, chat propio y animaciones (grupos 1–3 de la auditoría UI/UX).
- Exportar datos y eliminar la organización (dueño), y purga automática: canceladas y pruebas vencidas sin pago, a los 60 días.
- Panel del operador `/plataforma` (`PLATFORM_ADMIN_EMAILS`): resumen, extender pruebas, dar créditos, suspender/reactivar.
- Captcha opcional del registro (Cloudflare Turnstile) y CSP corregida (antes bloqueaba el Pixel de Meta y Google).
- CI: tsc, lint, tests y build de producción.

Detalle técnico de todo lo anterior: `AGENTS.md`.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién vende | **Persona física: Luis Islas.** La verificación de Meta y los textos legales van a su nombre; la marca es solo el nombre visible. |
| Nombre | **Se cambiará** (SunflowCRM es provisional). Es el primer paso: dominio, verificación y App Review dependen de él. |
| Dominio | Aún no hay. **No estará en Cloudflare** (Turnstile funciona igual: solo requiere cuenta de Cloudflare y dar de alta el dominio en Turnstile). |
| Purga de datos | Canceladas y pruebas vencidas sin pago: se borran a los 60 días. Hecho. |
| Stripe | **Al final.** Las pruebas contra Stripe real se hacen en el último paso. |
| Canales de Meta | **WhatsApp primero**; Messenger/Instagram en una revisión aparte, después. |

## Orden de trabajo

### 1. Nombre nuevo  ← siguiente paso

**Elegido (2026-09-27): Colibly** (colibrí + "-ly": rápido, va de conversación en conversación), con **Kolibly** como variante a proteger. Salió de ~300 candidatos revisados contra el registro de `.com`; casi todos los nombres cortos estaban tomados.

Revisión del 2026-09-27:
- `colibly.com` y `kolibly.com`: **libres** (RDAP de Verisign). También sin DNS: `.mx`, `.com.mx`, `.io`, `.app`, `.co`, `.ai`, `.net`.
- En internet: sin empresa ni producto llamado Colibly o Kolibly (solo una cuenta de X con ese nombre visible, usuario `@teshirsanatt`).
- GitHub y npm: `colibly` y `kolibly` libres.
- **Riesgo a revisar en el IMPI:** "Colibly" se parece en sonido a "Colibrí", palabra común con marcas probables en México, y existe **Colibri.ai** (software de inteligencia de conversaciones para ventas, mismo sector). La ortografía distinta ayuda, pero el IMPI evalúa el parecido fonético.

**Logo elegido (2026-09-27): concepto D "Impulso"**: colibrí original en picada diagonal (velocidad), degradado violeta (`#5B34E6` → `#8E6BFF`), pico rubí (`#FF4F7B`), con versión plana de un color para tamaños chicos. Dibujado desde cero en el lienzo de identidad (https://claude.ai/artifact/4fnEnuHXBTvPTaa4fSZGHF), inspirado en el estilo de una referencia de Magnific pero sin calcar pose ni formas. Paleta: violeta colibrí `#5B34E6` (principal, admite texto blanco 6.8:1), rubí `#FF4F7B` (acento, solo rellenos), tinta `#17132B`, suelo `#F8F6FC`, noche `#100D1F`; tipografía Sora (títulos) + Figtree (texto). Contrastes AA verificados en el lienzo.
- Los `.eps` de referencia de Magnific están fuera del repo (contenido con licencia), en `/data/Proyectos/colibly-marca/referencias-magnific/` del servidor.
- Luis obtuvo del autor de la referencia la cesión de derechos: conseguirla **por escrito y firmada** (cesión total y exclusiva de derechos patrimoniales, con permiso para registro de marca). Impulso no depende de ella por ser original.
- [ ] Pulir el trazo final con un diseñador antes del registro (curvas, proporciones, grosor óptico); Claude prepara el brief.

Siguientes pasos del nombre:
- [ ] Registrar `colibly.com` y `kolibly.com` (este redirige al primero) el mismo día, en un registrador serio. Opcional: `colibly.mx` / `colibly.com.mx`.
- [ ] Reservar usuarios `colibly` en Instagram, Facebook, X, TikTok, LinkedIn y YouTube (los videos del App Review y los tutoriales van ahí). Esto se revisa a mano: esas redes piden sesión.
- [ ] Búsqueda en el IMPI (MARCia) de "Colibly" y parecidos ("Colibrí", "Colibri") en las clases 9 (software), 35 (gestión comercial/publicidad) y 42 (SaaS). Si está limpio, solicitar el registro de la marca (idealmente con un agente de marcas).
- [ ] Renombrar en el código y nueva identidad visual (logo de colibrí, paleta nueva): ver lista abajo.

Criterios usados para elegir:
- Dominio `.com` disponible (el anterior falló aquí: sundaycrm.com era de otro).
- Sin conflicto de marca: búsqueda en el IMPI (Marcanet) en la clase de software/servicios en línea.
- Usuario libre en Instagram, Facebook, X y LinkedIn.
- Fácil de decir y escribir en español; sin letras ambiguas al dictarlo.
- **Sin "WhatsApp", "Whats" ni "WA"** en el nombre: las guías de marca de Meta no permiten usar su marca en nombres de producto, y eso se revisa en el App Review.
- Identidad visual nueva: el girasol se descarta (decisión del 2026-09-27), así que logo y paleta se rediseñan junto con el nombre.

Qué implica el cambio en el código (lo hace Claude en cuanto los dominios estén registrados):
- `lib/brand.ts` (`BRAND_NAME`, `BRAND_TAGLINE`) y ~48 menciones literales de "SunflowCRM" en ~40 archivos (correos, landing, textos legales, documentación de la API, panel): pasarlas a `BRAND_NAME` donde se pueda.
- Encabezados de webhooks salientes `X-Sunflow-Signature` / `-Event` / `-Delivery` / `-Automation` y el User-Agent `SunflowCRM-Webhooks`. **Hacerlo antes de tener clientes reales**: después rompe las integraciones de quien ya valida esas cabeceras.
- Claves internas: `sunflow_consent` (localStorage del aviso de cookies), `sunflowAnalytics`, formato de exportación `sunflowcrm-export-v1` y nombre del archivo exportado.
- Identidad visual: `SunflowerMark` (`app/components/ui/logo.tsx`), `app/icon.svg`, `app/apple-icon.tsx`, imágenes para compartir (`_share-image.tsx`) y primitivos `--sunflower-*` de `app/globals.css` (si el nombre nuevo no encaja con el girasol).
- Los identificadores internos (carpeta del repo, contenedores, paquete npm) pueden quedarse como están, igual que se hizo con SundayCRM → SunflowCRM.

### 2. Dominio, producción y correo

- [ ] Registrar el dominio del nombre nuevo.
- [ ] Definir dónde corre producción (no se encontró el proyecto en Coolify al 2026-09-27) y desplegar con `APP_URL` del dominio.
- [ ] Correo transaccional con el dominio (SMTP + SPF/DKIM/DMARC), para que la verificación y las invitaciones no caigan en spam. Un buzón del dominio también sirve para la verificación de Meta.
- [ ] Respaldos de producción: base de datos y volumen `media_data`, con copia fuera del servidor.
- [ ] Monitoreo: aviso si el sitio se cae (`/api/health`) y rastreo de errores.
- [ ] Variables en producción: `PLATFORM_ADMIN_EMAILS` (tu correo) y, opcional, `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`.

### 3. Textos legales

- [ ] Llenar `LEGAL` en `app/(marketing)/_legal.tsx` (razón social = tu nombre como persona física, domicilio fiscal, correo, jurisdicción) y los 13 huecos `<Blank>` de términos y privacidad (p. ej. si los precios incluyen impuestos y cómo se factura).
- [ ] Revisión con abogado antes del lanzamiento.
- [ ] Con el contador: alta en el SAT con actividad empresarial (también se necesita para cobrar y facturar) y si hay que emitir CFDI a clientes mexicanos (Stripe no lo hace).

### 4. Meta: Tech Provider y Embedded Signup (WhatsApp)

Contexto (verificado en la documentación de Meta el 2026-09-27):
- Desde abril de 2026 el registro como **Tech Provider** es obligatorio para un software que ofrece WhatsApp, y **Embedded Signup** es el camino estándar para conectar clientes. El flujo actual (el cliente pega App Secret y token de su propia app) no es viable para un SaaS de pequeños negocios.
- Límite de clientes nuevos: **10 por semana** sin trámites; **200 por semana** tras verificación del negocio + App Review + verificación de acceso. Más de 200: solicitar ser Meta Business Partner.
- App Review de WhatsApp: **dos videos** (enviar un mensaje y crear una plantilla) para los permisos avanzados `whatsapp_business_messaging` y `whatsapp_business_management`.
- Después del Embedded Signup, el servidor hace: `GET /oauth/access_token` (código → token de negocio), `POST /<WABA_ID>/subscribed_apps` (webhooks), `POST /<PHONE_NUMBER_ID>/register` (con PIN de 6 dígitos). El cliente agrega su método de pago en WhatsApp Manager.

**Frente técnico (se puede empezar antes del nombre; la app en modo desarrollo funciona sin revisión para admins y testers):**

Luis:
- [ ] Registrarse como desarrollador en developers.facebook.com con su cuenta.
- [ ] Crear la app (tipo negocio, caso de uso WhatsApp) vinculada a su portafolio, con nombre provisional (se puede cambiar después).
- [ ] Pasar para el `.env`: **App ID**, **App Secret** y el **ID de configuración** de Facebook Login for Business (plantilla "WhatsApp Embedded Signup").
- [ ] Tener un número para probar que no esté en la app normal de WhatsApp.

Claude:
- [ ] Botón "Conectar WhatsApp" con la ventana de Meta (SDK de JS + `config_id`); recibir WABA ID, phone number ID y código.
- [ ] Servidor: intercambio de código por token (cifrado en `WAAccount.accessToken`), suscripción de webhooks, registro del número.
- [ ] Webhooks con un solo secreto de la plataforma (`META_APP_SECRET`), manteniendo las cuentas conectadas a mano.
- [ ] URLs obligatorias para la revisión: eliminación de datos (callback firmado de Meta, apoyado en `lib/org-data/delete.ts`) y desautorización.
- [ ] Variables nuevas en `docker-compose.yml` y `.env.example`; CSP (`frame-src` de facebook.com para la ventana).
- [ ] Prueba de punta a punta con túnel (ngrok, ya permitido en `allowedDevOrigins`) y número real.

**Frente de trámites (después del nombre y el dominio):**
- [ ] Agregar un **segundo administrador** al portafolio de Meta (si la cuenta personal se bloquea y es el único admin, se pierde todo).
- [ ] Verificación del negocio como persona física: documentos oficiales con nombre legal y domicilio idénticos a los del portafolio (típicamente Constancia de Situación Fiscal y comprobante de domicilio; confirmar con contador), sitio web en el dominio.
- [ ] Registro como Tech Provider.
- [ ] App Review de WhatsApp: Claude prepara guiones de los dos videos, textos de justificación de cada permiso e instrucciones para el revisor; Luis graba y envía.
- [ ] Verificación de acceso (para subir el límite a 200 clientes por semana).

### 5. Messenger e Instagram (después de WhatsApp)

- [ ] Mismo cambio de modelo: la app de la plataforma con Facebook Login for Business en lugar de que el cliente pegue credenciales.
- [ ] App Review **separado** del de WhatsApp: `pages_messaging`, `pages_show_list`, `business_management` (dependencia de las demás) y el permiso de mensajes de Instagram. Pedir permisos de Instagram en un flujo solo de Messenger suele frenar o rechazar la revisión.

### 6. Stripe (al final)

Con llaves de modo prueba y `stripe listen --forward-to <url>/api/billing/webhook`:
- [ ] Checkout durante la prueba (cobro diferido) y fuera de ella.
- [ ] Renovación (`invoice.paid` reinicia créditos de IA).
- [ ] Pago fallido → gracia de 7 días → solo lectura.
- [ ] Cancelación desde el portal → activa hasta fin de periodo → cancelada → purga a los 60 días.
- [ ] Eliminar la organización con suscripción activa (cancela en Stripe antes de borrar).
- [ ] Reactivar desde `/plataforma` una organización suspendida que tiene suscripción.
- [ ] Cuenta de Stripe México como persona física; precios en USD.

## Fuentes (Meta, consultadas el 2026-09-27)

- [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)
- [Onboarding business customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)
- [Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Tech Provider Program integration guide (Twilio)](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide)
- [Tech Provider Program setup (Infobip)](https://www.infobip.com/docs/whatsapp/tech-provider-program/setup-and-integration)
