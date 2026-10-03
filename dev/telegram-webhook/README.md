# Interfaz y webhooks públicos de DEV mediante Cloudflare Tunnel

Esta configuración publica la **interfaz completa de DEV** y los webhooks de Telegram/WhatsApp mediante un túnel HTTPS temporal. La UI también sigue en `http://ludaisca:15100`; la instancia de Coolify en `app.colibly.com` usa otra base de datos. Telegram acepta webhooks por HTTPS en los puertos 443, 80, 88 y 8443, pero no en 15100.

La interfaz está protegida por HTTP Basic Auth en Nginx, además del login normal de Colibly. El archivo local `dev/telegram-webhook/.htpasswd` contiene solo el hash, no se versiona y debe poder leerlo el trabajador de Nginx (`chmod 644`). Las rutas de webhook de Telegram, WhatsApp, Messenger/Instagram y Lead Ads conservan su autenticación propia y no piden Basic Auth, para que Meta y Telegram puedan entregarlas. No abrir la URL en una ventana pública compartida: la contraseña externa es común a los probadores.

## Arranque

Antes del primer arranque, desde la raíz del repositorio crear `dev/telegram-webhook/.htpasswd` con una contraseña nueva (o conservar la existente). Por ejemplo:

```sh
printf 'colibly-dev:%s\n' "$(printf '%s' '<contraseña>' | openssl passwd -apr1 -stdin)" > dev/telegram-webhook/.htpasswd
chmod 644 dev/telegram-webhook/.htpasswd
```

Desde `dev/telegram-webhook/`:

```sh
podman compose -f compose.yml up -d
podman compose -f compose.yml logs tunnel
```

El navegador pedirá primero el usuario `colibly-dev` y esa contraseña; después mostrará el login de Colibly. Las cuentas de distintos probadores se crean y administran dentro de Colibly, no en el túnel. Se pueden conectar varias cuentas de canal si el plan y las habilitaciones de la organización lo permiten. Cada bot de Telegram solo admite un webhook activo y una cuenta de WhatsApp debe tener su Phone Number ID propio; el túnel puede recibirlos todos en el mismo origen.

El log muestra una URL `https://...trycloudflare.com`. Guardarla **solo en el `.env` local** como `APP_URL`, `TELEGRAM_WEBHOOK_BASE_URL` y `WHATSAPP_WEBHOOK_BASE_URL`, sin barra final. `APP_URL` hace que los enlaces de verificación, invitación y otros correos de DEV apunten al túnel en vez de `localhost`; `NEXT_PUBLIC_APP_URL` puede seguir en `http://localhost:15100` porque estos enlaces se generan en el servidor. Desde la raíz del repositorio, recrear el contenedor DEV para que lea las variables nuevas:

```sh
podman compose up -d --no-deps --force-recreate app
```

Conectar el bot desde `/telegram/cuentas` en la interfaz de DEV. El token se introduce allí; no se guarda en estos archivos. La organización debe tener Telegram habilitado desde `/plataforma` y el correo de su administrador debe estar verificado. Cada bot de Telegram admite **un solo webhook activo**: usar uno exclusivo de DEV. La cuenta `Telegram QA DEV` de `@TheCocoBlue_Bot` ya quedó vinculada al espacio **Colibly de DEV** el 2026-10-02; el bot IA «Ventas» se vinculó y activó en esa cuenta para probar respuestas.

## Verificación

- `GET /login` sin Basic Auth debe responder 401; con ella, 200.
- `GET /api/telegram/webhook/<accountId>` debe responder 403 desde Nginx.
- `GET /api/meta/webhook/messaging` y `/api/meta/webhook/leadgen` llegan a la app sin Basic Auth; faltando el token de verificación responden 400.
- El webhook válido de Telegram lleva `X-Telegram-Bot-Api-Secret-Token`; la app lo compara con el secreto cifrado de esa cuenta.
- Enviar `/start` y un mensaje desde Telegram; deben aparecer en el inbox de DEV y el bot IA «Ventas» debería responder. Para probar después la respuesta manual sin duplicados, pausar ese bot desde el panel y responder desde Colibly.
- Revisar `getWebhookInfo` en Telegram si los mensajes no llegan; `last_error_message` indica fallos de entrega. Nunca imprimir el token en la terminal o en una URL compartida.

## WhatsApp Cloud API

La cuenta WhatsApp que ya envía mensajes manuales existe en **Coolify**, no en la base local de DEV. Para probarla contra el contenedor de DEV, crear una cuenta equivalente desde `http://ludaisca:15100/whatsapp/cuentas` dentro de la organización Colibly. Se pueden usar el mismo Phone Number ID y las credenciales válidas, pero hay que introducirlas de nuevo porque las bases y claves de cifrado son distintas. El panel de DEV mostrará la URL pública del túnel y un `verify token` nuevo; copiarlo antes de cerrar el modal, ya que solo se muestra una vez.

En la app de Meta que se usará para esta prueba, configurar la URL de callback `https://<subdominio-actual>.trycloudflare.com/api/whatsapp/webhook` y ese `verify token`. Meta lo envía en un GET de verificación; Colibly compara solo su hash. Suscribir el campo `messages` y confirmar que el WABA está suscrito a esa app de Meta. El POST real se valida con `X-Hub-Signature-256` y el App Secret guardado en la cuenta.

Meta mantiene un callback general por app. Si se cambia al túnel de DEV, los mensajes de las WABA sin override llegarán a la base local; una cuenta conectada también a Coolify seguirá pudiendo enviar manualmente, pero dejará de recibir esos eventos allí. Tras la verificación, enviar un mensaje de prueba desde un número distinto al de negocio, comprobar recepción en el inbox de DEV y responder desde allí. Si el bot IA no responde, revisar el estado del bot, su vínculo con la cuenta y los logs del worker.

Si la app de Meta también atiende una WABA de otra instancia, se puede usar el `override_callback_uri` de la suscripción de la **WABA de DEV** para dirigir el campo `messages` al túnel sin cambiar el callback general de la app. Colibly todavía no configura ese override desde el panel; hacerlo requiere la llamada a `/<WABA_ID>/subscribed_apps` y verificar la suscripción efectiva. Referencia de Meta: https://www.postman.com/meta/whatsapp-business-platform/request/un84tul/override-callback-url

El campo `messages` también entrega reacciones y respuestas citadas. Desde 2026-10-03, una reacción del lead se guarda sobre el mensaje original y no dispara al bot ni crea una burbuja nueva; una respuesta citada conserva el `context.id`, se muestra en el chat y el bot recibe el texto citado como contexto. El agente puede citar un mensaje del lead desde el botón de respuesta de la burbuja. La reacción previa del chat «WhatsApp QA DEV» sigue en la base como registro histórico `messageType=reaction`; la API del chat oculta esas burbujas antiguas porque su payload original no guardó el emoji ni el mensaje de destino. No se borró ningún dato.

El encabezado de cada chat muestra el modo real de atención: IA, humano por respuesta manual, automatización, derivación a humano o sin atención automática. Una respuesta manual pausa el bot 30 minutos; el menú del indicador permite **Devolver al bot** antes de que termine la pausa. Esto solo afecta a los próximos mensajes del lead: no reprocesa la imagen u otros mensajes que llegaron mientras estaba pausado. Una automatización activa o su derivación a humano conserva prioridad; el botón no la interrumpe.

La cabecera compacta está en `app/components/whatsapp/chat-conversation-header.tsx`: identidad y canal, asignación y acción Resolver/Reabrir; debajo quedan el estado y el modo de atención. **Detalles** despliega estado (incluido Pendiente), etiquetas, calificación, consumo y automatizaciones. Se reinicia al cambiar de chat, adapta sus columnas al ancho del panel y limita su altura en móvil. Los desplegables se dibujan fuera del contenedor para evitar recortes. El listado de chats ocupa inicialmente 32% del área ajustable. Validación: TypeScript y ESLint en el contenedor DEV; pendiente recorrido visual autenticado.

Si se activan más campos de Meta, los todavía no implementados se registran en el log de `app` como `[webhook] Campo aún sin procesar` con el nombre del campo y las claves superiores del payload, solo después de validar la firma. No se imprimen cuerpos de mensajes ni teléfonos. Consultar con `podman compose logs app` mientras se ejecuta la prueba. Suscribirse en Meta no activa automáticamente una función de Colibly.

Las URL gratuitas de TryCloudflare son temporales: si cambia la URL, actualizar las tres variables en `.env`, recrear `app` y volver a conectar el bot (o registrar de nuevo el webhook) para apuntarlo al túnel nuevo. Los enlaces de correo emitidos con la URL anterior también caducarán al cambiar el túnel. Si el túnel se detiene, Telegram dejará de entregar nuevos mensajes al webhook hasta que se restaure una URL válida.

El servidor Next de DEV acepta `*.trycloudflare.com` en `allowedDevOrigins` para hidratar la UI y HMR. Este túnel rápido no garantiza disponibilidad y Cloudflare indica que no soporta Server-Sent Events; para una beta estable hay que usar un túnel administrado o el despliegue definitivo.
