# Landing beta y separación de dominios

Desplegado públicamente el 2 de octubre de 2026 con la arquitectura separada: la copia PHP/cPanel sirve `https://colibly.com` y la aplicación de Coolify en ludaisca sirve `https://app.colibly.com`.

La arquitectura activa sirve **una copia independiente** desde cPanel/Neubox en `colibly.com`, dejando `app.colibly.com` en ludaisca. Archivos y operación: [cpanel-site/README.md](../cpanel-site/README.md). La separación descrita abajo corresponde a la alternativa en que ambos hostnames llegan al mismo Next.js; no es la configuración pública actual.

## Opción Next.js con ambos dominios en el mismo servicio

| Dirección pública | Comportamiento |
|---|---|
| `https://colibly.com/` | Landing nueva de la beta. Internamente se sirve desde `/beta` sin cambiar la URL visible. |
| `https://colibly.com/terminos` y `/privacidad` | Páginas legales. Siguen marcadas como borrador hasta su revisión. |
| `https://colibly.com/producto` | Landing anterior para comparación, con `noindex`; no aparece en el sitemap. |
| `https://app.colibly.com/` | Entrada al producto: login si no hay sesión, panel si la hay. |
| `https://app.colibly.com/login`, `/register` y panel | Autenticación y aplicación. |

En esta opción, las páginas de aplicación solicitadas en el dominio público redirigen a `app.colibly.com`; las páginas públicas solicitadas en el subdominio de aplicación redirigen a `colibly.com`. Cada hostname mantiene su propia cookie de sesión. El `robots.txt` del producto bloquea el rastreo y sus metadatos indican `noindex`; el sitemap del sitio público contiene la landing y las páginas legales.

En DEV, sin ambas URL configuradas, `/` conserva la landing anterior y `/beta` muestra la nueva para poder compararlas. También se conserva `/producto`.

## Configuración alternativa con ambos dominios en Next.js

1. DNS: `colibly.com` y `app.colibly.com` deben resolver hacia el servicio público correcto. Comprobar el registro del dominio raíz y la propagación antes de activar el sitio; la consulta del 1 de octubre todavía muestra destinos diferentes.
2. En Coolify o el proxy que publique el contenedor, asociar **ambos FQDN al mismo servicio `app`** con TLS para ambos. El servicio sigue exponiendo el puerto interno 5000; no añadir un puerto fijo al compose de producción.
3. Variables de infraestructura: `SITE_URL=https://colibly.com` y `APP_URL=https://app.colibly.com`. `APP_URL` mantiene los enlaces de verificación, invitación, recuperación, Stripe y API en el producto. `SITE_URL` gobierna enlaces canónicos y sitemap de la web.
4. Configurar el correo saliente SMTP desde `/plataforma` con un remitente autorizado. La landing envía las solicitudes a `contacto@colibly.com`; si falla el envío, devuelve un error al visitante. El formulario no almacena solicitudes en la base de datos. Probar recepción, respuesta y la autenticación SPF/DKIM/DMARC antes de publicar.
5. Si se usa Google Sheets, registrar `https://app.colibly.com/api/integrations/google-sheets/callback` como URL de retorno. Las URL de webhooks de Meta y de otros canales también pertenecen a `app.colibly.com`.
6. Revisar `robots.txt`, sitemap, canonical y la imagen al compartir para ambos hostnames después de configurar HTTPS.

Consulta DNS del 2 de octubre de 2026: `colibly.com` resuelve a `65.99.252.96`; `app.colibly.com` es CNAME de `ludaisca.ddns.net`, que resolvió a `189.171.112.105`. El MX apunta a `colibly.com` y `mail.colibly.com` termina en el dominio raíz. SPF, DKIM y DMARC están publicados. **Mover el A raíz sin separar primero MX y `mail` interrumpiría el correo.** La arquitectura activa mantiene el A raíz en Neubox y no necesita mover el MX. Orden de una migración futura: [INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md](INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md).

## Alcance de la beta

La landing ofrece solicitud de acceso, no registro inmediato: diez negocios, 30 días desde la activación, una cuenta de WhatsApp, hasta tres integrantes, un asistente configurado con el negocio y acompañamiento inicial. El formulario pide únicamente datos de contacto y contexto breve, valida los campos, limita solicitudes por IP y usa un campo trampa contra bots simples. Las mediciones de clic y solicitud solo se envían si el visitante acepta cookies.

El registro público del producto anuncia 30 días (`TRIAL_DAYS`, igual que la beta). Antes de invitar negocios externos hay que simplificar la conexión de WhatsApp y cerrar los textos legales. La landing anterior se conserva solo como referencia visual durante esta etapa. La copia PHP no incluye la medición ni el widget de chat de esta opción; su formulario tiene backend PHP y entrega local en Neubox.
