# Infraestructura de la beta: producción en ludaisca y alternativa Contabo

**Decisión del 2026-10-01. Estado actualizado y verificado externamente el 2026-10-02.**

## Objetivo y límites

- Producción pública: `https://colibly.com` sirve la landing PHP desde Neubox/cPanel y `https://app.colibly.com` sirve el producto desde una instancia aislada de Coolify en ludaisca.
- Desarrollo: permanece también en **ludaisca**, con Podman rootless y sus datos de prueba, separado de producción. No desmontar ese entorno ni borrar otros proyectos del servidor.
- Correo: permanece con **Neubox/cPanel**. El VPS no recibirá correo ni reemplazará los buzones. `contacto@colibly.com` es el destino de solicitudes beta.
- Arquitectura activa: `colibly.com` se sirve desde cPanel/Neubox mediante la copia PHP; `app.colibly.com` se sirve desde ludaisca con Coolify/proxy y su IP residencial dinámica. No constituye alta disponibilidad automática. Contabo queda documentado como futura migración a IP estática.

La aplicación ya implementa la separación por hostname; véase [DOMINIOS_Y_LANDING_BETA.md](DOMINIOS_Y_LANDING_BETA.md). El cambio de servidor no requiere cambiar el dominio visible ni las URL canónicas.

## Situación DNS observada antes de los cambios

Consulta del 2026-10-01; **volver a medir antes de tocar registros**:

| Registro | Estado observado | Implicación |
|---|---|---|
| NS del dominio | `ns143`, `ns144`, `ns245.neubox.net` | Los registros se editan en la zona DNS de Neubox, aunque el dominio esté registrado en Hostinger. |
| `colibly.com` A | `65.99.252.96` | Apunta al servidor de correo/cPanel, no a Colibly. |
| `colibly.com` MX | `0 colibly.com.` | El correo depende hoy del A del dominio raíz. |
| `mail.colibly.com` CNAME | `colibly.com.` | El nombre de correo también depende del A del dominio raíz. |
| `app.colibly.com` CNAME | `ludaisca.ddns.net.` | La app apunta hoy a ludaisca. |
| `*.colibly.com` CNAME | `ludaisca.ddns.net.` | Otros subdominios siguen la IP residencial; un registro explícito para `app` prevalece sobre el comodín. |
| SPF, DKIM, DMARC | Configurados en la zona de Neubox; DMARC observado con `p=none` | Conservarlos y verificar los correos de salida después del cambio. |

`ludaisca.ddns.net` resolvía a `189.171.112.105` el 2026-10-01; **no tratar esa IP como permanente**. El TTL observado era 14 400 s (4 h). Reducirlo con antelación si el panel lo permite y volver a comprobar los valores efectivos.

## Plan A: VPS de Contabo

### Compra y preparación

1. Elegir el plan VPS 6 discutido (6 vCPU compartidas, 12 GB RAM, 200 GB SSD) **solo si** el checkout confirma una IPv4 pública dedicada/estática, una región adecuada, Ubuntu LTS compatible y el costo total, renovación y plazo aceptables. Evitar el compromiso de 24 meses si hay una opción corta razonable. El proveedor y el rendimiento real se validan en la instancia asignada.
2. Configurar acceso SSH con clave, firewall (SSH restringido; 80/443 públicos), actualizaciones y monitoreo de CPU, memoria, disco y respuesta HTTPS. No abrir PostgreSQL ni Redis a Internet.
3. Usar el Coolify existente para agregar el VPS como **servidor remoto** por SSH. Mantener el panel de Coolify en ludaisca; si ludaisca cae, la app ya desplegada en Contabo puede seguir funcionando, pero no podremos administrarla con ese panel hasta recuperarlo. No instalar un segundo Coolify por defecto.
4. Preparar una **instancia de producción separada**: `db` (PostgreSQL/pgvector), `redis` y `app` con volúmenes persistentes `pgdata` y `media_data`. No copiar por inercia la base DEV poblada: contiene datos de demostración y conexiones reales de prueba. Si se necesita migrar algo, inventariarlo y aprobarlo caso por caso.
5. Generar secretos propios de producción (`DB_PASSWORD`, `AUTH_SECRET`, `ENCRYPTION_KEY`) y guardarlos fuera del VPS en un gestor de secretos. La pérdida de `ENCRYPTION_KEY` hace inaccesibles los secretos cifrados en la base. Configurar `SITE_URL=https://colibly.com`, `APP_URL=https://app.colibly.com`, `PLATFORM_ADMIN_EMAILS` y, si aplica, OAuth/`LANDING_WEBCHAT_ACCOUNT_ID`. El `docker-compose.yml` de producción pasa estas variables al contenedor y **no** fija un puerto de host.
6. Asociar ambos FQDN al servicio `app` en Coolify y emitir certificados HTTPS. Antes de cambiar DNS público, probar el servicio mediante resolución temporal del lado del cliente (`curl --resolve` o archivo hosts), incluyendo login, landing y `/api/health`. Si se necesita HTTP-01 para obtener los certificados, prever la secuencia de DNS y comprobar el proxy antes de anunciar la beta.

### Correo y DNS: orden obligatorio

El A raíz **no puede cambiarse primero**: con el MX y CNAME actuales, el correo seguiría el nuevo A y dejaría de llegar a Neubox.

1. En Neubox, sustituir `mail.colibly.com CNAME colibly.com.` por **`mail.colibly.com A 65.99.252.96`**, previa confirmación de que esa IP sigue siendo la correcta para el correo. Si hay clientes que usan `smtp.colibly.com` o `imap.colibly.com`, crear también registros explícitos hacia el servidor de correo según indique Neubox; hoy pueden caer bajo el comodín hacia ludaisca.
2. Cambiar el MX de `colibly.com` de `0 colibly.com.` a **`0 mail.colibly.com.`**. Confirmar en cPanel que el dominio está enrutado como **Local Mail Exchanger** y que recibir y enviar por `contacto@colibly.com` funciona. Conservar SPF/DKIM/DMARC; cualquier cambio en el remitente SMTP exige comprobar su autorización en SPF/DKIM.
3. Esperar la propagación del TTL anterior y verificar con consultas contra los autoritativos y resolutores externos que MX y `mail` ya no dependen del A raíz. Repetir una prueba de correo entrante y saliente desde fuera de Neubox.
4. Entonces cambiar `colibly.com A` a la IPv4 de Contabo y reemplazar `app.colibly.com CNAME ludaisca.ddns.net.` por un **A explícito** a esa misma IPv4. Mantener `*.colibly.com CNAME ludaisca.ddns.net.` para los otros servicios existentes. Revisar posibles registros AAAA: no deben apuntar a un servidor distinto si los hostnames van a publicar HTTPS por IPv6.
5. Confirmar HTTPS, rutas y redirecciones en ambos dominios; después, formularios y correo. En `/plataforma` configurar SMTP con remitente autorizado de Neubox; la solicitud beta se entrega a `contacto@colibly.com` y no se guarda en la BD. Comprobar recepción, respuesta y enlaces de verificación/invitación.
6. Actualizar callbacks de Google Sheets, Meta, Stripe y otros servicios que se activen a `https://app.colibly.com/...`. Revisar orígenes permitidos del widget web en `colibly.com`. No cambiar webhooks de Meta hasta comprobar que el endpoint público responde correctamente.

### Operación y aceptación antes de invitar clientes

- Backups **diarios y externos a Contabo** de PostgreSQL y `media_data`, cifrados y con retención definida; guardar también secretos y configuración de despliegue. Un snapshot del VPS no es sustituto. Hacer al menos una restauración real en entorno aislado. Objetivo inicial propuesto: pérdida máxima de datos de 24 h (RPO) y recuperación en 24 h (RTO); revisarlo antes de aceptar clientes que necesiten más.
- Monitoreo externo de `https://colibly.com/`, `https://app.colibly.com/api/health` y espacio de disco; alertar a una dirección atendida. Vigilar latencia de páginas y uso de CPU compartida durante builds y tráfico real.
- Prueba completa de registro, correo, login, chat, recepción y envío de WhatsApp, workers, archivos de medios y recuperación tras reinicio. Mantener canales nuevos habilitados manualmente desde Plataforma según la política acordada.
- Trabajo posterior independiente del hosting: revisión legal profesional antes del lanzamiento general, configuración asistida de WhatsApp y pruebas de pagos si se cobrarán. SMTP y el formulario público ya fueron probados; la oferta beta, el registro y los términos anuncian 30 días. Ver [PLAN_LANZAMIENTO.md](PLAN_LANZAMIENTO.md) y [OFERTA_BETA_COLIBLY.md](OFERTA_BETA_COLIBLY.md).

## Alternativa al plan B elegido: publicar también la landing desde ludaisca

**Solo si se abandona la landing en cPanel.** Esta variante requiere mover el A raíz y resolver su IP dinámica; el plan B preferido se documenta después. Si la app de Contabo necesita recuperarse en ludaisca, la decisión depende de tener un respaldo reciente y un ludaisca sano; cambiar DNS sin restaurar y probar los datos no recupera el servicio.

1. Mantener desarrollo y producción **aislados** en ludaisca: proyecto/stack, base, Redis, volúmenes, secretos y dominios distintos. Comprobar capacidad libre del LV de Podman y memoria antes del build; la raíz ya se llenó antes. No borrar otros proyectos ni reutilizar volúmenes DEV. Si el servidor no tiene margen, reducir carga o ampliar almacenamiento antes de activarlo.
2. Restaurar en la instancia de contingencia el último backup externo de producción de PostgreSQL y `media_data`, con la misma `ENCRYPTION_KEY` y configuración necesaria. Detener escrituras en el origen si sigue accesible, sacar respaldo final y registrar el punto de corte para evitar dos bases activas. Redis/BullMQ puede contener trabajos pendientes: evaluar duplicados antes de reanudar campañas, webhooks y envíos automáticos.
3. Configurar el proxy/Coolify de ludaisca para los dos FQDN, puerto interno 5000 y TLS; comprobar que 80/443 llegan desde Internet a la IP residencial actual y que no hay conflicto con servicios existentes. Usar `--resolve`/hosts para probar rutas, sesión, correo y webhooks antes del cambio público.
4. **Conservar `mail.colibly.com A 65.99.252.96` y `MX 0 mail.colibly.com.`.** Para `app.colibly.com`, restaurar CNAME a `ludaisca.ddns.net.` (sin A/AAAA incompatible). El editor DNS de Neubox solo ofrece A, AAAA, CAA, CNAME, DMARC, MX, TXT y SRV: **no ofrece ALIAS/ANAME**. Un CNAME ordinario en el ápice no sirve junto a MX/otros registros. Para `colibly.com` raíz, la opción dentro de Neubox es actualizar su A cuando cambie la IP residencial. Averiguar si la cuenta permite automatizarlo mediante la API DNS de cPanel; que cPanel tenga API no confirma que Neubox la exponga o autorice. Si no, el cambio manual de A es solo una contingencia frágil: una rotación de IP cortará la web hasta actualizarlo y propagar el DNS. Otra opción, que requiere una migración completa y cuidadosa de la zona de correo, es mover **solo el DNS autoritativo** a un proveedor que admita CNAME flattening en el ápice; el dominio seguiría registrado en Hostinger y los buzones seguirían en Neubox.
5. Comprobar resolución autoritativa y externa, HTTPS, correo, login, chat y callbacks. Monitorear especialmente cambios de IP, cortes eléctricos/ISP y certificados. Registrar el tiempo y los datos perdidos respecto del backup.
6. Al volver a Contabo u otro VPS, repetir corte controlado de escrituras, respaldo/restauración y pruebas; después revertir **solo** los A/CNAME web. El MX y `mail` de Neubox permanecen independientes.

**Limitaciones de esta variante descartada:** conexión residencial con IP dinámica, disponibilidad ligada a energía/ISP local y DNS raíz pendiente de automatización; Coolify, DEV y la contingencia compartirían un servidor físico. No prometer recuperación instantánea ni balanceo automático.

## Arquitectura activa: landing en Neubox, app en ludaisca

Arquitectura publicada el 2026-10-02: `colibly.com` está alojado en el cPanel de Neubox y `app.colibly.com` en ludaisca. Con esta distribución el A raíz sigue en `65.99.252.96` y no necesita seguir la IP residencial; el MX y el correo permanecen en Neubox. El CNAME explícito de `app.colibly.com` apunta a `ludaisca.ddns.net`. La landing PHP independiente está en [cpanel-site/README.md](../cpanel-site/README.md). Esta variante evita la dependencia de ALIAS/API DNS para el ápice.

La landing en Neubox puede permanecer visible si ludaisca deja de responder, pero el producto y sus webhooks no. Producción y DEV comparten el servidor físico, aunque mantienen stacks, datos, secretos y volúmenes separados. Siguen siendo necesarios respaldo/restauración externos y monitoreo de energía, ISP, IP dinámica, almacenamiento y certificados. El formulario PHP no depende de la app y envía solicitudes al buzón de Neubox.

## Estado y pendientes después del despliegue

- [x] Publicar PHP 8.2 y HTTPS en Neubox; verificar landing, legales, `robots.txt` y `llms.txt`.
- [x] Publicar la aplicación en Coolify/ludaisca; verificar TLS y `/api/health` con PostgreSQL y Redis sanos.
- [x] Verificar DNS público de landing, aplicación, MX, SPF, DKIM y DMARC. El propietario confirma el funcionamiento de los buzones.
- [x] Probar el formulario PHP de punta a punta y el SMTP transaccional de la aplicación; ambos fueron confirmados por el propietario el 2026-10-02.
- [x] Rotar la contraseña de la base expuesta durante el despliegue y revocar el token temporal de la API de Coolify.
- [ ] Preparar y restaurar backups; decidir si producción empieza limpia o necesita alguna migración puntual.
- [ ] Vigilar IP dinámica, disponibilidad externa y capacidad del host; configurar alertas.
- [ ] Contratar y validar Contabo solo si se decide migrar a una IP estática; registrar IP, región, sistema y coste real sin publicar secretos.
- [ ] Ejecutar la prueba funcional completa de aceptación antes de invitar clientes.

El despliegue público y el DNS descritos arriba estaban activos y se verificaron externamente el 2026-10-02. El entorno DEV continúa separado y no debe borrarse.
