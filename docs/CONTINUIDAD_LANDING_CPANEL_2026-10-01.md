# Continuidad: despliegue público de Colibly

**Corte verificado: 2 de octubre de 2026.** Este documento deja el estado operativo para retomar el proyecto sin reconstruir decisiones anteriores. No contiene contraseñas ni tokens.

## Arquitectura activa

| Servicio | Dirección | Alojamiento | Estado |
|---|---|---|---|
| Landing beta | `https://colibly.com` | Neubox/cPanel, PHP 8.2 | Pública y responde 200 por HTTPS. |
| Aplicación | `https://app.colibly.com` | ludaisca, Coolify, stack de producción aislado | Pública; `/` redirige a `/login` y `/api/health` reporta `db: ok`, `redis: ok`. |
| Correo | `contacto@colibly.com` y buzones del dominio | Neubox/cPanel | El propietario confirma envío y recepción. DNS de autenticación publicado. |
| Desarrollo | puerto 15100 y servicios Podman de DEV | ludaisca | Separado de la instancia pública; no exponerlo ni reutilizar sus datos. |

La landing y la aplicación son publicaciones independientes. La primera vive en la carpeta de dominio adicional `colibly.com` de cPanel; `public_html` pertenece a `ludaisca.com` y no debe tocarse. La aplicación pública usa su propia base, Redis, medios, secretos y volúmenes de Coolify. Los demás proyectos alojados en ludaisca no se modificaron.

## Verificación pública del 2026-10-02

- `https://colibly.com/`, `/terminos`, `/privacidad`, `/robots.txt` y `/llms.txt` responden 200 por HTTPS.
- La landing publica canonical, Open Graph, JSON-LD, oferta beta de 30 días y enlaces de acceso hacia `https://app.colibly.com/login`.
- Los textos legales genéricos son funcionales y se aceptan para esta etapa de beta; siguen con `noindex` y queda una revisión profesional antes del lanzamiento general.
- `https://app.colibly.com/` responde 307 hacia `/login`; el destino responde 200.
- `https://app.colibly.com/api/health` devuelve `status: ok`, `db: ok` y `redis: ok`.
- Ambos hosts sirven HSTS y cabeceras de seguridad. La aplicación tiene CSP propia.
- No se envió una solicitud de beta ni un correo durante esta verificación. El propietario confirmó que los correos funcionan.

## DNS observado

| Registro | Valor público observado | Uso |
|---|---|---|
| `colibly.com A` | `65.99.252.96` | Landing y servidor de correo de Neubox. |
| `app.colibly.com CNAME` | `ludaisca.ddns.net` | Aplicación; durante la revisión resolvió a `189.171.112.105`. |
| `colibly.com MX` | `0 colibly.com.` | Entrega de correo actual. |
| `mail.colibly.com` | CNAME hacia `colibly.com`, luego `65.99.252.96` | Nombre de correo actual. |
| SPF | Autoriza `65.99.252.96`, MailChannels y el relay de Neubox | Publicado. |
| DKIM | Clave RSA en `default._domainkey.colibly.com` | Publicada. |
| DMARC | `v=DMARC1; p=none;` | Monitoreo; todavía no aplica cuarentena o rechazo. |

Esta topología conserva el correo porque el A raíz continúa en Neubox. Si algún día se mueve `colibly.com` a otro servidor, primero hay que cambiar `mail.colibly.com` a un A explícito de Neubox y el MX a `mail.colibly.com`; el procedimiento está en [INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md](INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md).

## Código de la landing en cPanel

La fuente publicable está en [`cpanel-site/`](../cpanel-site/README.md):

- `index.php`: landing, SEO, formulario y token CSRF.
- `solicitud.php`: validación del servidor, honeypot, límite de tres solicitudes por IP/hora y entrega mediante `mail()`.
- `config.php`: correo público y URL de la aplicación; no contiene credenciales.
- `terminos.php`, `privacidad.php`, `legal-layout.php`: borradores legales.
- `.htaccess`: HTTPS/sin `www`, rutas limpias, protección de auxiliares y cabeceras. En producción debe conservarse antes el bloque generado por cPanel.
- `assets/`: estilos, JavaScript, íconos e imágenes sociales.
- `robots.txt`, `llms.txt`, `sitemap.xml`: descubrimiento y SEO.
- `preview-router.php`: solo para `php -S`; no se publica.

El formulario de cPanel es independiente de Next.js, Redis y la base de datos. Una solicitud exitosa existe únicamente en el buzón, por lo que también debe incluirse el correo en el plan de respaldo. La copia PHP no incorpora Pixel, GA4, Google Ads ni el widget del chat; si se agregan, antes debe implementarse el consentimiento y actualizarse privacidad.

## Despliegue de la aplicación

La aplicación `colibly` en Coolify usa Docker Compose desde `ludaisca/Colibly`, servicio `app` en el puerto interno 5000 y dominio `app.colibly.com`. PostgreSQL, Redis y `media_data` usan volúmenes propios. `APP_URL` apunta a `https://app.colibly.com` y `SITE_URL` a `https://colibly.com`.

No añadir un `ports:` fijo al compose de producción. No usar bind mounts de archivos del repositorio en Coolify: el origen se clona en un contenedor auxiliar y puede terminar montándose como directorio. Evitar también dos despliegues simultáneos, por ejemplo uno manual y otro disparado por webhook.

## Validado después del despliegue

- [x] Contraseña de la base rotada y token temporal de la API de Coolify revocado (confirmado por el propietario el 2026-10-02).
- [x] SMTP transaccional configurado y probado desde la aplicación.
- [x] Formulario público probado de punta a punta y entrega confirmada.
- [x] Términos y privacidad accesibles con texto genérico funcional para la beta. La revisión profesional queda como mejora previa al lanzamiento general.

## Pendientes prioritarios

1. Configurar respaldos diarios externos de PostgreSQL y `media_data`, guardar `ENCRYPTION_KEY` fuera del servidor y probar una restauración.
2. Configurar las claves de IA de plataforma y ejecutar una prueba controlada de consumo/créditos.
3. Añadir la ruta `/producto` a la copia PHP o retirar cualquier enlace/redirección que dependa de ella.
4. Crear monitoreo externo de la landing y `/api/health`, además de alertas de disco en ludaisca.
5. Integrar la rama desplegada en `main` y decidir si se reactiva el despliegue automático, evitando carreras con despliegues manuales.
6. Probar registro, login, roles, WhatsApp, workers, medios y reinicio completo antes de invitar negocios externos.
7. Antes del lanzamiento general, revisar legalmente términos y privacidad; después decidir si se quita `noindex` y se agregan al sitemap.

Contabo queda como opción futura de migración a una IP estática y mejor aislamiento. Ya no es un requisito para iniciar la beta: la arquitectura cPanel + ludaisca es la producción activa, con el riesgo aceptado de que la aplicación depende de energía, ISP e IP dinámica residencial.

## Estado del repositorio

`cpanel-site/` y estos documentos forman parte de un árbol de trabajo amplio con cambios previos. Antes del próximo despliegue desde Git hay que revisar, integrar y versionar el conjunto correcto. No borrar ni restablecer cambios ajenos, y nunca incluir `.env`, credenciales o secretos en commits.

## Pruebas de canales en DEV (2026-10-02)

Se inició un túnel temporal de Cloudflare hacia un gateway Nginx de Podman. La configuración y los comandos de operación están en [`dev/telegram-webhook/README.md`](../dev/telegram-webhook/README.md). Desde el 2026-10-02 publica también **la interfaz completa de DEV** por HTTPS, protegida con HTTP Basic Auth antes del login normal; el usuario externo es `colibly-dev` y el hash de la contraseña queda solo en `dev/telegram-webhook/.htpasswd` (ignorado por Git). Las rutas de webhook Telegram, WhatsApp, Messenger/Instagram y Lead Ads no requieren Basic Auth y conservan la verificación propia. Se comprobó: `/login` sin clave devuelve 401, con clave 200, GET al webhook Telegram devuelve 403 y GET al de mensajería Meta sin parámetros devuelve 400. `next.config.ts` permite `*.trycloudflare.com` en DEV para la hidratación de la UI. La URL rápida cambia cuando se recrea el túnel.

`APP_URL`, `TELEGRAM_WEBHOOK_BASE_URL` y `WHATSAPP_WEBHOOK_BASE_URL` están en el `.env` local de DEV y apuntan a la URL temporal del túnel. Los valores no se publican en Git. `APP_URL` permite que correos de verificación e invitación usen un enlace externo; el código de Telegram registra su webhook con el otro origen, y la pantalla WhatsApp muestra la URL pública adecuada. En producción, sin override, WhatsApp sigue usando `APP_URL`.

En la organización **Colibly de DEV** (administrador `luis.islas@ludaisca.com`) quedó conectada la cuenta `Telegram QA DEV`, bot `@TheCocoBlue_Bot`. Telegram reportó webhook configurado y cero actualizaciones pendientes, sin error de entrega. El bot IA «Ventas» se vinculó y activó en esa cuenta. La captura aportada el 2026-10-02 ya muestra un chat entrante y respuestas automáticas en la bandeja, por lo que la ingestión y la respuesta básica funcionan. Queda validar un intercambio largo y la respuesta manual después de pausar el bot.

El apartado **Bots IA → Probar** ahora conserva una conversación durante la visita a esa página (el botón «Nueva conversación» la reinicia), respeta la memoria `NONE`/`RECENT`/`SUMMARY` y recupera conocimiento cuando RAG está habilitado. No guarda esa conversación en el inbox ni prueba el webhook; cada respuesta usa un crédito. El historial se valida y limita en la API. El selector de etiquetas de la bandeja ahora usa un portal para que no quede recortado detrás del panel de chats.

La cuenta WhatsApp real que envía manualmente está en **`app.colibly.com` (Coolify)**, una base distinta de la DEV local. El túnel ya acepta su handshake y POST, pero para probar desde DEV hay que crear una cuenta equivalente en la organización Colibly local y después apuntar la app de Meta de prueba a la URL del túnel. Al cambiar ese callback, la instancia Coolify dejará de recibir los eventos entrantes de esa app mientras dure la prueba.
