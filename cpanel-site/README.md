# Landing beta para cPanel

Versión independiente en PHP, HTML, CSS y JavaScript de la landing `/beta` de Next.js. Se publica en `colibly.com`; la aplicación queda en `app.colibly.com` sobre ludaisca. **Preparada en el repositorio; no se ha subido a Neubox.**

Estado completo para retomar en otra sesión: [docs/CONTINUIDAD_LANDING_CPANEL_2026-10-01.md](../docs/CONTINUIDAD_LANDING_CPANEL_2026-10-01.md).

## Archivos para `public_html`

Subir el **contenido** de este directorio a la raíz web de `colibly.com`: `index.php`, `solicitud.php`, `config.php`, `legal-layout.php`, `terminos.php`, `privacidad.php`, `.htaccess`, `robots.txt`, `sitemap.xml` y `assets/`. No subir `README.md` ni `preview-router.php`; este último solo sirve para la vista previa local. Activar PHP 8.1+ con `mbstring` y `mail()` configurado por el hosting. Confirmar que Apache permite `.htaccess` y `mod_rewrite`; si no, los enlaces legales deben usar `.php` explícitamente.

El `index.php` inicia una sesión para generar un token CSRF. El formulario envía por POST al mismo dominio (`solicitud.php`), valida datos, usa un campo trampa y limita a tres solicitudes por IP y hora mediante archivos en el directorio temporal de PHP. El mensaje se envía con `mail()` desde `contacto@colibly.com` hacia ese mismo buzón, con `Reply-To` del solicitante. **No guarda solicitudes en una base de datos.** El resultado de `mail()` indica que el servidor aceptó el mensaje, no garantiza su entrega: probar recepción real, carpeta spam y autenticación SPF/DKIM. Si Neubox deshabilita `mail()` o exige SMTP autenticado, adaptar el endpoint a ese mecanismo antes de publicarlo; no introducir credenciales en `public_html` ni en Git.

`assets/` contiene los estilos y un ícono local. El aspecto y el texto reproducen la landing beta del proyecto; se reemplazaron componentes React/Lucide por HTML y CSS. No requiere Node, Next.js ni la base de datos. No incluye el widget de chat ni medición/consentimiento; si se activan posteriormente, actualizar también la política de privacidad. La fuente visual se descarga de Google Fonts; si se desea independencia completa, alojar esas fuentes localmente.

## Antes de publicar

1. Dejar el DNS raíz y el MX actuales en Neubox. `app.colibly.com` mantiene su CNAME a `ludaisca.ddns.net`; comprobar HTTPS y `APP_URL=https://app.colibly.com` en el despliegue de la app.
2. Configurar SSL de `colibly.com` en cPanel y comprobar que la raíz sirve `index.php` por HTTPS. El servidor cPanel debe seguir siendo el destino del A raíz.
3. Probar una solicitud real desde la landing y verificar recepción en `contacto@colibly.com`. Probar también campos inválidos, reenvío excesivo y la página de confirmación.
4. Revisar los borradores de `/terminos` y `/privacidad` con asesoría legal. Tienen marcadores pendientes, `noindex` y no se incluyen en el sitemap hasta que estén listos. La prueba es de 30 días en la landing, el registro y los términos (`TRIAL_DAYS`); si cambia, actualizar `terminos.php` a mano.
5. Si cambia la oferta, marca o precios, actualizar tanto esta copia como la landing Next.js. Son dos publicaciones distintas; la versión de cPanel no se sincroniza sola.

## Prueba local con PHP

```sh
php -S 127.0.0.1:18080 -t cpanel-site cpanel-site/preview-router.php
```

Abrir `http://127.0.0.1:18080`. `preview-router.php` simula las dos rutas legales limpias porque el servidor integrado de PHP no aplica `.htaccess`. **No enviar el formulario local con datos reales**; `mail()` puede estar deshabilitado o enviarlo mediante el host de prueba.
