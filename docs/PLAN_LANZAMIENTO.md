# Plan de lanzamiento — de proyecto a negocio

**Creado:** 2026-09-27. Documento para retomar la preparación del producto como negocio: qué está hecho, qué se decidió y en qué orden sigue. Se actualiza conforme avanza (marcar `[x]` solo lo terminado y verificado). Infraestructura y DNS verificados el 2026-10-02 en [INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md](INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md).

## Estado al 2026-10-02

Desde entonces: revisiones y cierres de interfaz (accesibilidad, consistencia, rendimiento, recorrido visual, modales, React Flow del 09-29 al 09-30), landing beta con separación de hosts, copia PHP para cPanel y plan de infraestructura/oferta beta. Índice en [README.md](README.md); punto de retoma en [CONTINUIDAD_LANDING_CPANEL_2026-10-01.md](CONTINUIDAD_LANDING_CPANEL_2026-10-01.md).

El repositorio está en preparación previa al lanzamiento. Los cambios de plataforma, proveedor de IA y habilitación de canales del 2026-09-28 están en el árbol de trabajo y requieren las comprobaciones descritas en README antes de integrarlos.

**Ya construido y verificado:**
- SaaS multi-organización (S1–S5): tenencia, correo y verificación, planes con candados de facturación, IA de la plataforma con créditos, marca y landing.
- Landing con medición con consentimiento, chat propio y animaciones (grupos 1–3 de la auditoría UI/UX).
- Exportar datos y eliminar la organización (dueño), y purga automática: canceladas y pruebas vencidas sin pago, a los 60 días.
- Panel del operador `/plataforma` (`PLATFORM_ADMIN_EMAILS`): resumen, extender pruebas, dar créditos, suspender/reactivar.
- Captcha opcional del registro (Cloudflare Turnstile) y CSP corregida (antes bloqueaba el Pixel de Meta y Google).
- CI: tsc, lint, tests y build de producción.
- Configuración de negocio de plataforma desde `/plataforma` (`PlatformSettings`): claves de IA (OpenCode Go/Google), Stripe, SMTP, Turnstile y medición; los secretos se cifran en base de datos.
- Habilitación por organización de Telegram, Messenger, Instagram y webchat desde el panel del operador. Las organizaciones que ya tenían cuentas conservan esos canales.
- Proveedor/modelos de IA curados y asignados por la plataforma; los clientes ya no eligen proveedor ni modelo.

Detalle técnico de todo lo anterior: `AGENTS.md`.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién vende | **Persona física: Luis Islas.** La verificación de Meta y los textos legales van a su nombre; la marca es solo el nombre visible. |
| Nombre | **Colibly** (`colibly.com`); el dominio ya se compró. El registro de la marca sigue pendiente. |
| Dominio y correo | Dominio registrado en Hostinger; DNS y buzones en Neubox/cPanel. El propietario confirma que el correo funciona. |
| Infraestructura beta | **Producción activa:** landing PHP en Neubox/cPanel y app aislada en Coolify sobre ludaisca. Contabo queda como migración futura opcional. |
| Purga de datos | Canceladas y pruebas vencidas sin pago: se borran a los 60 días. Hecho. |
| Stripe | **Al final.** Las pruebas contra Stripe real se hacen en el último paso. |
| Canales de Meta | **WhatsApp primero**; Messenger/Instagram en una revisión aparte, después. |

## Orden de trabajo

### 1. Nombre nuevo

**Elegido (2026-09-27): Colibly** (colibrí + "-ly": rápido, va de conversación en conversación), con **Kolibly** como variante a proteger. Salió de ~300 candidatos revisados contra el registro de `.com`; casi todos los nombres cortos estaban tomados.

Revisión del 2026-09-27:
- `colibly.com` y `kolibly.com`: **libres** (RDAP de Verisign). También sin DNS: `.mx`, `.com.mx`, `.io`, `.app`, `.co`, `.ai`, `.net`.
- En internet: sin empresa ni producto llamado Colibly o Kolibly (solo una cuenta de X con ese nombre visible, usuario `@teshirsanatt`).
- GitHub y npm: `colibly` y `kolibly` libres.
- **Riesgo a revisar en el IMPI:** "Colibly" se parece en sonido a "Colibrí", palabra común con marcas probables en México, y existe **Colibri.ai** (software de inteligencia de conversaciones para ventas, mismo sector). La ortografía distinta ayuda, pero el IMPI evalúa el parecido fonético.

**Logo elegido (2026-09-27): concepto D "Impulso"**: colibrí original en picada diagonal (velocidad), degradado violeta (`#5B34E6` → `#8E6BFF`), pico rubí (`#FF4F7B`), con versión plana de un color para tamaños chicos. Dibujado desde cero en el lienzo de identidad (https://claude.ai/artifact/4fnEnuHXBTvPTaa4fSZGHF), inspirado en el estilo de una referencia de Magnific pero sin calcar pose ni formas. Paleta: violeta colibrí `#5B34E6` (principal, admite texto blanco 6.8:1), rubí `#FF4F7B` (acento, solo rellenos), tinta `#17132B`, suelo `#F8F6FC`, noche `#100D1F`; tipografía Bricolage Grotesque (títulos) + Hanken Grotesk (texto), la que usa la beta y la app (decisión 2026-10-01; antes se planeó Sora + Figtree). Contrastes AA verificados en el lienzo.
- Los `.eps` de referencia de Magnific están fuera del repo (contenido con licencia), en `/data/Proyectos/colibly-marca/referencias-magnific/` del servidor.
- Luis obtuvo del autor de la referencia la cesión de derechos: conseguirla **por escrito y firmada** (cesión total y exclusiva de derechos patrimoniales, con permiso para registro de marca). Impulso no depende de ella por ser original.
- [ ] Pulir el trazo final con un diseñador antes del registro (curvas, proporciones, grosor óptico); Claude prepara el brief.

Siguientes pasos del nombre:
- [x] Registrar `colibly.com` (Hostinger). `kolibly.com`, `colibly.mx` y `colibly.com.mx` siguen siendo opciones futuras, no prerequisitos de la beta.
- [ ] Reservar usuarios `colibly` en Instagram, Facebook, X, TikTok, LinkedIn y YouTube (los videos del App Review y los tutoriales van ahí). Esto se revisa a mano: esas redes piden sesión.
- [ ] Búsqueda en el IMPI (MARCia) de "Colibly" y parecidos ("Colibrí", "Colibri") en las clases 9 (software), 35 (gestión comercial/publicidad) y 42 (SaaS). Si está limpio, solicitar el registro de la marca (idealmente con un agente de marcas).
- [x] Renombrar en el código (2026-09-27, rama `feat/rebrand-colibly`): textos con `BRAND_NAME`, dominio y correo de contacto en `lib/brand.ts` (`BRAND_DOMAIN`, `BRAND_CONTACT_EMAIL`), encabezados `X-Colibly-*`, User-Agent, clave de consentimiento, formato de exportación y remitentes. Logo provisional: una "C" (`BrandMark`, `lib/brand-mark.ts`, favicon, ícono de iOS, imagen para compartir).
- [x] Paleta "Colibrí" aplicada (2026-09-27): violeta `#5B34E6`, rubí, neutros con tinte violeta, tema oscuro "noche"; hex para correos e imágenes en `lib/brand-colors.ts`.
- [ ] Logo final "Impulso" pulido (hoy es una "C" provisional): reemplazar `BrandMark`, `lib/brand-mark.ts` y `app/icon.svg`.
- [x] Crear el buzón `contacto@colibly.com` en Neubox y probar recepción y SMTP transaccional de producción (confirmado por el propietario el 2026-10-02).

Criterios usados para elegir:
- Dominio `.com` disponible (el anterior falló aquí: sundaycrm.com era de otro).
- Sin conflicto de marca: búsqueda en el IMPI (Marcanet) en la clase de software/servicios en línea.
- Usuario libre en Instagram, Facebook, X y LinkedIn.
- Fácil de decir y escribir en español; sin letras ambiguas al dictarlo.
- **Sin "WhatsApp", "Whats" ni "WA"** en el nombre: las guías de marca de Meta no permiten usar su marca en nombres de producto, y eso se revisa en el App Review.
- Identidad visual: la paleta "Colibrí" ya está aplicada y el logo actual es provisional; el logo final "Impulso" sigue pendiente.

Qué implicaba el cambio en el código (hecho el 2026-09-27, salvo la identidad visual):
- `lib/brand.ts` (`BRAND_NAME`, `BRAND_TAGLINE`) y ~48 menciones literales de "SunflowCRM" en ~40 archivos (correos, landing, textos legales, documentación de la API, panel): pasarlas a `BRAND_NAME` donde se pueda.
- Encabezados de webhooks salientes `X-Sunflow-Signature` / `-Event` / `-Delivery` / `-Automation` y el User-Agent `SunflowCRM-Webhooks`. **Hacerlo antes de tener clientes reales**: después rompe las integraciones de quien ya valida esas cabeceras.
- Claves internas: `sunflow_consent` (localStorage del aviso de cookies), `sunflowAnalytics`, formato de exportación `sunflowcrm-export-v1` y nombre del archivo exportado.
- Identidad visual: `SunflowerMark` (`app/components/ui/logo.tsx`), `app/icon.svg`, `app/apple-icon.tsx`, imágenes para compartir (`_share-image.tsx`) y primitivos `--sunflower-*` de `app/globals.css` (si el nombre nuevo no encaja con el girasol).
- Identificadores internos: también renombrados el 2026-09-27 (repo `ludaisca/Colibly`, carpeta `/data/Proyectos/Colibly`, contenedores `colibly-*`, base `colibly_db`, paquete npm).

### 2. Dominio, producción y correo

**Desplegado el 2026-10-02 en ludaisca (Coolify), https://app.colibly.com.** Aplicación `colibly` (`narrmk3x6fht3fgbz3gsqw33`) en el proyecto "Luis Islas", Docker Compose desde `ludaisca/Colibly`, rama `feat/rebrand-colibly`, dominio solo en el servicio `app` (puerto 5000). Base de datos, Redis y medios van dentro del compose con volúmenes propios (`narrmk3x…_pgdata`, `_media-data`); no se tocaron Factzi, N8N, Gowa, Beszel, Searxng ni el PostgreSQL/Redis independientes. Verificado: `/api/health` con `db` y `redis` en ok, 19 migraciones aplicadas en base nueva, certificado de Let's Encrypt, `/terminos`, `/beta`, `/producto` y `/sitemap.xml` redirigen a colibly.com, `/api/v1/*` pide API key.
- Variables cargadas por la API de Coolify: `DB_PASSWORD`, `AUTH_SECRET`, `ENCRYPTION_KEY` (generadas, **respaldar `ENCRYPTION_KEY` aparte**), `APP_URL`, `SITE_URL`, `PLATFORM_ADMIN_EMAILS`, `MEDIA_RETENTION_DAYS`.
- **Lecciones del despliegue:** (1) no montar archivos del repo con bind mount en el compose: Coolify clona dentro de un contenedor auxiliar y Docker crea un directorio (por eso se quitó `docker/init.sql`); (2) con el despliegue automático activo, un push lanza un despliegue por webhook que compite con uno manual y los dos fallan: se desactivó el automático (`is_auto_deploy_enabled=false`, no se pudo confirmar por la API), y los despliegues se lanzan a mano.
- **Pendiente:** respaldos (la base del compose no entra en los respaldos nativos de Coolify), claves de IA desde `/plataforma`, `/producto` no existe en la landing de cPanel, mezclar el PR a `main` y decidir si se reactiva el despliegue automático. `DB_PASSWORD` fue rotada, el token temporal de Coolify fue revocado, SMTP y el formulario público fueron probados.

- [x] Registrar `colibly.com` y documentar la arquitectura y su alternativa de migración. Véase [plan de infraestructura](INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md).
- [x] Publicar la copia PHP de `cpanel-site/` en Neubox y una instancia de producción separada en ludaisca para `app.colibly.com`.
- [x] Verificar externamente HTTPS, redirección de la app, salud de base/Redis y DNS de correo (SPF, DKIM y DMARC publicados).
- [ ] Si se mueve el A raíz a otro proveedor, separar primero `mail.colibly.com` y el MX. No hace falta en la arquitectura activa.
- [x] Correo transaccional de la aplicación configurado y probado desde `/plataforma`; los buzones y el formulario público también funcionan.
- [ ] Migrar a Contabo u otro VPS estático si el riesgo operativo de la conexión residencial deja de ser aceptable; no bloquea la beta inicial.
- [ ] Respaldos de producción: base de datos y volumen `media_data`, con copia fuera del servidor.
- [ ] Monitoreo: aviso si el sitio se cae (`/api/health`) y rastreo de errores.
- [ ] Variables de infraestructura en producción: `PLATFORM_ADMIN_EMAILS` (tu correo), `APP_URL`, credenciales OAuth de Google Sheets si se usan y `LANDING_WEBCHAT_ACCOUNT_ID` si se activa el chat de la landing. SMTP, claves de IA, Stripe, Turnstile y medición se configuran desde `/plataforma` → **Configuración**.

### 3. Textos legales

- [x] Publicar términos y privacidad con texto genérico funcional para la etapa beta (confirmado por el propietario el 2026-10-02).
- [x] Textos legales **genéricos por decisión (2026-10-04)**: razón social «Colibly», domicilio para notificaciones y contacto por correo (`contacto@colibly.com`), jurisdicción México; sin huecos `<Blank>`. El aviso de privacidad ya cubre la importación de la app WhatsApp Business (coexistencia) y las copias de seguridad en almacenamiento externo. La copia de `cpanel-site/` se mantiene a mano con los mismos textos.
- [ ] **Antes del lanzamiento general** (la beta puede seguir así): nombrar en el aviso al responsable como persona física o moral y su domicilio —la ley de protección de datos mexicana exige identidad y domicilio del responsable en el aviso de privacidad—, y decidir si los precios incluyen impuestos y cómo se factura.
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
