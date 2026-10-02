# Continuidad: landing beta de cPanel y arquitectura de dominios

**Corte de información: 1 de octubre de 2026.** Este documento permite retomar el trabajo en otra sesión sin asumir que la vista previa o los DNS siguen iguales. No contiene contraseñas ni tokens.

## Decisión y estado real

El usuario quiere conservar el dominio y el correo en Neubox/cPanel y usar `app.colibly.com` para la aplicación en **ludaisca** como plan B. Sigue existiendo un plan A con VPS de Contabo para producción, documentado en [INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md](INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md). **Actualización 2026-10-02: la landing PHP ya está publicada en https://colibly.com** (carpeta `colibly.com` del cPanel `ludaisca`, que es un dominio adicional en hosting compartido; `public_html` pertenece a ludaisca.com y no se toca). Verificado: HTTPS, PHP 8.2, rutas limpias, CSRF, redirección a HTTPS y sin www (excluye `/.well-known/`), JSON-LD, `robots.txt` con rastreadores de IA permitidos y `llms.txt`. **Pendiente: envío real del formulario y textos legales.** El `.htaccess` del servidor es el del repo precedido por el bloque que genera cPanel (no borrarlo). El texto original de abajo describe el estado antes de publicar. Antes: no se había subido a Neubox; no se ha publicado `app.colibly.com` como una instancia de producción independiente; no se han modificado DNS, correo ni Coolify por este trabajo.

| Versión | Código | Vista previa actual | Propósito |
|---|---|---|---|
| Landing original | `app/(marketing)/page.tsx` | `http://ludaisca:15100/` | Referencia anterior en DEV. |
| Landing beta Next.js | `app/(beta)/beta/` | `http://ludaisca:15100/beta` | Fuente visual y de contenido; la opción de servir ambos hostnames desde un Next.js también está implementada en `proxy.ts`. |
| Landing beta PHP/cPanel | [`cpanel-site/`](../cpanel-site/README.md) | `http://ludaisca:18080/` mientras exista el contenedor de vista previa | Copia independiente para `colibly.com`; no requiere Next.js ni la BD. |

Las tres URLs son de desarrollo. El puerto `18080` se publica desde un contenedor temporal llamado `colibly-beta-php-preview`; al tener `--rm` y no tener política de reinicio, **desaparecerá al detenerlo o reiniciar ludaisca**. `15100` corresponde al contenedor DEV `colibly-app-1`, no a una producción.

## Inventario de `cpanel-site/`

| Archivo | Función |
|---|---|
| `index.php` | HTML completo de la beta: hero, ejemplo de chat, beneficios, tres pasos, oferta, preguntas, formulario, header/footer, SEO/canonical/Open Graph. Crea token CSRF de sesión. |
| `assets/site.css` | Diseño adaptable para escritorio/móvil, tokens de color Colibly y controles de 12 px. Descarga Bricolage Grotesque/Hanken Grotesk de Google Fonts (las mismas de la beta Next.js); el sitio no es 100 % autosuficiente en fuentes. |
| `assets/site.js` | Validación nativa, POST AJAX al PHP del mismo dominio, estado de envío/error/éxito y foco tras el resultado. |
| `assets/icon.svg`, `assets/share.svg` | Ícono provisional «C» y tarjeta para compartir. |
| `solicitud.php` | Backend del formulario; validación del lado servidor, CSRF, campo trampa, límite de 3 solicitudes por IP y hora en archivos temporales, `mail()` a `contacto@colibly.com` con `Reply-To` del solicitante. No escribe a DB. |
| `config.php` | Correo público y `APP_URL=https://app.colibly.com`; no contiene credenciales. |
| `terminos.php`, `privacidad.php`, `legal-layout.php` | Copias HTML de los borradores legales. Se añadió a privacidad el tratamiento de datos de la solicitud beta. Siguen con marcadores legales; llevan `noindex`. |
| `.htaccess` | Índice, rutas limpias `/terminos` y `/privacidad`, protección de archivos auxiliares y cabeceras básicas. Requiere Apache/mod_rewrite habilitado en cPanel. |
| `robots.txt`, `sitemap.xml` | Solo indexar la landing; los borradores legales no están en sitemap. |
| `preview-router.php` | Simula las rutas limpias con `php -S`; **no subirlo a `public_html`**. |
| `README.md` | Lista de archivos a subir, requisitos de PHP y comprobaciones para cPanel. |

La copia conserva el texto y composición de la beta Next.js, pero no es un render idéntico píxel por píxel: los íconos React/Lucide se reemplazaron por caracteres/CSS y la fuente externa puede afectar el resultado si no carga. No se ha ejecutado una comparación visual automatizada en tres tamaños; hacerlo antes de dar por cerrada la paridad visual.

### Flujo del formulario

`index.php` emite una cookie de sesión técnica y un token CSRF. El navegador envía el formulario a `solicitud.php` **en `colibly.com`**, de modo que una caída de ludaisca no impide solicitar la beta. El endpoint rechaza método diferente de POST, cuerpo >8 KiB, token incorrecto, valores inválidos y más de 3 envíos/hora por IP. El campo oculto `website` actúa como trampa para bots. `mail()` intenta entregar al correo de Neubox; una respuesta 201 significa que PHP aceptó el mensaje, **no confirma llegada al buzón**. El límite usa `sys_get_temp_dir()`: comprobar que cPanel permite escribir allí y que la retención de temporales no cambia de forma inesperada. Las solicitudes exitosas solo quedan en el buzón, por lo que las copias de correo también importan.

La versión Next.js original del formulario usa `/api/beta/solicitudes`, Redis para límites y SMTP desde `/plataforma`; **la versión PHP no usa ninguno de esos servicios**. La versión PHP tampoco incluye widget web, Meta Pixel, GA4 ni Google Ads. En sus textos de privacidad solo se declara la cookie técnica; actualizar consentimiento y aviso antes de añadir medición. Los enlaces «Entrar» van a `https://app.colibly.com/login` y las páginas legales quedan en `colibly.com`.

## DNS y servicios vistos al cierre

Dominio comprado en Hostinger. DNS autoritativo en `ns143`, `ns144` y `ns245.neubox.net`. Consultas del 2026-10-01:

| Nombre/tipo | Valor observado | Acción para el plan B elegido |
|---|---|---|
| `colibly.com A` | `65.99.252.96` | **Conservar**: web/cPanel de Neubox. |
| `colibly.com MX` | `0 colibly.com.` | **Conservar** mientras el A raíz siga en Neubox. |
| `mail.colibly.com CNAME` | `colibly.com.` | **Conservar** bajo esta misma condición. |
| `app.colibly.com CNAME` | `ludaisca.ddns.net.` | Conservar; verificar que el proxy publique la app con TLS. |
| `ludaisca.ddns.net A` | `189.171.112.105` en la consulta | IP residencial dinámica; revisar antes de cada prueba externa. |

Neubox solo ofrece crear A, AAAA, CAA, CNAME, DMARC, MX, TXT y SRV en el editor; no muestra ALIAS/ANAME. El plan B elegido **no los necesita** porque la landing queda en cPanel. Si algún día se mueve **también `colibly.com`** a Contabo/ludaisca, entonces se debe independizar primero `mail` y MX del A raíz; el procedimiento está en el documento de infraestructura. No aplicar esos cambios al plan B elegido.

Ludaisca: 31 GiB RAM observados; raíz de 15 GB con ~6 GB libres; `/data` RAID ~3.6 TB libres. La raíz ya se llenó anteriormente con builds, así que mantener artefactos y volúmenes en el LV de Podman y no borrar otros proyectos. Coolify responde localmente en `:8000`; proxy escucha en `:80` y `:443`. No se confirmó desde fuera que el router y firewall permitan llegar a ambos hostnames de producción. DEV de Colibly está saludable en Podman: `colibly-app-1` (`15100:5000`), `colibly-db-1`, `colibly-redis-1`, `colibly-mailpit-1` (`18025:8025`). Hay otros proyectos en el host; no tocarlos.

## Pruebas efectuadas

- Sintaxis PHP: `php -l` en todos los `.php` mediante `docker.io/library/php:8.2-cli`; todos sin errores.
- `node --check cpanel-site/assets/site.js`: sin errores.
- PHP integrado en contenedor: `GET /` 200, CSS 200, `/terminos` y `/privacidad` 200 mediante el router de vista previa, `GET /config.php` 404 y `GET /solicitud.php` 405.
- `http://127.0.0.1:15100/` y `/beta` respondieron 200.
- `git diff --check`: sin errores de formato.

**No verificado:** entrega real con `mail()` en Neubox; recepción y respuesta desde el buzón; Apache `.htaccess` en cPanel; HTTPS real; POST exitoso del formulario en cPanel; acceso externo al puerto de vista previa; revisión visual en navegador/móvil; accesibilidad automatizada de la copia; soporte de PHP `mbstring`; legal final. Las pruebas anteriores no equivalen a publicar el sitio.

## Retomar en la próxima sesión

1. Confirmar qué arquitectura se ejecutará primero: plan A Contabo o plan B cPanel+ludaisca. La copia PHP es utilizable para el plan B; si se decide usarla también junto con Contabo, el A raíz puede seguir en Neubox y solo `app.colibly.com` necesitaría apuntar al VPS.
2. Comparar visualmente las tres URLs en escritorio y móvil. Ajustar la copia PHP donde difiera de la beta de Next.js; revisar foco, contraste y errores del formulario. Si el contenedor temporal ya no existe, recrearlo con:

   ```sh
   podman run -d --rm --name colibly-beta-php-preview -p 18080:8080 -v /data/Proyectos/Colibly/cpanel-site:/site:ro,z docker.io/library/php:8.2-cli php -S 0.0.0.0:8080 -t /site /site/preview-router.php
   ```

3. En el cPanel de Neubox, comprobar versión PHP ≥8.1, extensión `mbstring`, `mail()`, HTTPS y mod_rewrite. **Subir únicamente los archivos indicados en `cpanel-site/README.md`** cuando se vaya a probar allí. Si `mail()` no entrega, adaptar a SMTP autenticado de Neubox con secretos fuera de `public_html` y del repositorio.
4. Probar un envío real desde `colibly.com` y revisar entrada, spam y autenticación SPF/DKIM. Probar validación, límite, CSRF, URL legales, favicon, share image y móvil. Asegurar que el sitio de cPanel no anteponga una plantilla vieja o redirección propia.
5. Configurar una instancia **de producción separada** para la app en ludaisca o Contabo; no exponer el DEV `15100` como producción. Usar secretos/BD/volúmenes distintos, `APP_URL=https://app.colibly.com`, HTTPS, backups externos y webhooks/callbacks correctos. La separación de hosts ya está programada en `proxy.ts`, pero verificar sus redirecciones con la arquitectura elegida.
6. Cerrar textos legales con asesoría, (la prueba ya es de **30 días** en beta, registro, plan y términos desde 2026-10-01). Probar la incorporación de WhatsApp y el correo transaccional antes de invitar negocios.
7. Cuando se apruebe el contenido, quitar `noindex` de las páginas legales y agregarlas al sitemap. Mantener sincronizadas la landing Next.js y la PHP si cambia el texto/branding.

## Estado del repositorio

Los archivos `cpanel-site/` y varios documentos de esta etapa están **sin seguimiento o modificados en un árbol de trabajo amplio**, junto con muchos cambios anteriores del proyecto. No se hizo commit, push ni despliegue. No asumir que un deploy desde GitHub incluirá la landing PHP hasta revisar, integrar y publicar esos archivos por el mecanismo elegido. No imprimir ni subir `.env` ni credenciales de correo.
