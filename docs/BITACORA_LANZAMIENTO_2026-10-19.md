# Bitácora del lanzamiento (18–19 de octubre de 2026)

Registro del frente de trabajo de pulido para el lanzamiento en la rama `feat/lanzamiento-pulido`. **Este documento no contiene secretos**: contraseñas, llaves de API, App Secret, verify tokens, secretos de webhook (`whsec_…`) y credenciales FTP viven en **/plataforma → Configuración** (producción), en las **variables de entorno de Coolify** o en los paneles de cada proveedor (Meta, Stripe, cPanel).

Documentos relacionados: [AUDITORIA_API_WEBHOOKS_2026-10-19.md](AUDITORIA_API_WEBHOOKS_2026-10-19.md) · [LIMITES_API_2026-10-19.md](LIMITES_API_2026-10-19.md) · [PRECIOS_POR_EJECUTIVO_2026-10-19.md](PRECIOS_POR_EJECUTIVO_2026-10-19.md) · [ROADMAP_PARIDAD_CHATWOOT.md](ROADMAP_PARIDAD_CHATWOOT.md) · [../AGENTS.md](../AGENTS.md)

## 1. Decisiones de producto
- **Coexistencia activada por defecto** en organizaciones nuevas.
- **1 conexión por canal por ejecutivo** (WhatsApp Coexistencia/API, Telegram, Messenger, Instagram), también durante la prueba.
- **Máximo 100 ejecutivos** por organización. **El dueño cuenta como ejecutivo.**
- **Contactos solo con chat**: la agenda (libreta de WhatsApp Business) solo pone nombres, ya no crea contactos.
- **Límite de contactos**: avisos al 80 % y al 100 %, tope de gracia al 120 % y contador "X de Y contactos" en Contactos.
- **Al lanzar, solo conversaciones iniciadas por el cliente**: sin plantillas, porque el WABA tiene error de método de pago (141006).

## 2. Planes (MXN por ejecutivo al mes)
| Plan | Precio | Canales | Contactos/ejecutivo | Créditos IA | Automatizaciones | Notas |
|---|---|---|---|---|---|---|
| Esencial | $99 | Solo WhatsApp | 500 | Sin IA | 1 | Máximo 3 ejecutivos |
| Negocio | $199 | Todos | 2,000 | 300 | 5 | Antes "Básico" |
| Pro | $349 | Todos | 5,000 | 1,000 | Ilimitadas | API y webhooks · "Más popular" |

- **Prueba de 14 días** en Pro, hasta 3 ejecutivos, con bolsa fija de 5,000 contactos y 1,000 créditos, **sin gracia**.
- **Gracia de 7 días** solo para quien ya pagó.
- Solo cobro **mensual**. **IVA pendiente** de definir con el contador.

## 3. API pública y webhooks
- Auditoría y correcciones (ver [AUDITORIA_API_WEBHOOKS_2026-10-19.md](AUDITORIA_API_WEBHOOKS_2026-10-19.md)): IP confiable, `Idempotency-Key`, headers de límite, pausa de webhooks por pérdida de admin, fanout por organización, `contact.created` en coexistencia.
- **Límites en capas** (ver [LIMITES_API_2026-10-19.md](LIMITES_API_2026-10-19.md)):

| Capa | Límite |
|---|---|
| Por IP | 3,000/min |
| Por llave | 120/min |
| Por organización | 600/min |
| `POST /messages` | 60/min por org y 10,000/día |
| `GET /conversations` | 60/min por llave |
| Cuerpo de la petición | 1 MB |

- Caché de autenticación de 60 s en Redis; **fail-closed** si Redis no está disponible.
- Webhooks: 20 entregas en paralelo y 2 por endpoint; headers Event-Id/Attempt.
- Documentación pública en **app.colibly.com/docs/api**.
- La promesa de versionado de la API se deja como está.

## 4. n8n (instancia WaOne)
- `2B0CmpuGepFDTblE`: prueba de webhook firmado + etiqueta.
- `QBPUhbKryy9OcCTW`: listar conversaciones y mensajes.
- Están separados porque n8n en modo cola falla con dos disparadores (manual + webhook) en el mismo workflow.
- Requieren la credencial Header Auth **"Colibly dev API"** (configurada en n8n, no aquí).

## 5. Correo
- `contacto@colibly.com` para contacto; `noreply@colibly.com` como remitente.
- SMTP de producción configurado en /plataforma → Configuración, pero **la prueba falló con 535** (credenciales por revisar).

## 6. Landing colibly.com (cPanel, carpeta `colibly.com`)
- Subida con los precios nuevos, enlaces arreglados, `.htaccess` con URLs limpias y `no-cache`, iconos versionados con `?v=`.
- Respaldos previos en `~/colibly-cpanel-backup-20261019/` en ludaisca.
- **Pendiente**: limpiar la caché NGINX en cPanel (sigue sirviendo copias viejas con la C morada).

## 7. Producción
- Desplegada en **app.colibly.com** vía Coolify desde la rama `feat/rebrand-colibly` (deploys `4aae232` y luego `974b5f7`).
- Luis puso `DB_CONNECTION_LIMIT=20` y `DB_POOL_TIMEOUT=10` en el entorno de Coolify.

## 8. Meta
- App `3423949611118312` publicada.
- Webhook movido a `https://app.colibly.com/api/whatsapp/webhook` con verify token nuevo de producción (guardado en Configuración, no aquí).
- Dominio del funnel quitado del SDK JS; funnel de Tailscale 443 apagado; `.env` de dev de vuelta a `http://ludaisca:15100`.
- Se mantiene el mismo App Secret por ahora; **rotarlo antes del lanzamiento real**.

## 9. Stripe (modo prueba)
- La llave guardada en producción es de la cuenta `acct_1USQ9WATJjW6BUX2`: ahí están los 3 productos (tax code `txcd_10103001`), precios con lookup keys `colibly_esencial_monthly`, `colibly_negocio_monthly`, `colibly_pro_monthly`, webhook a `/api/billing/webhook` y portal de clientes.
- Hay un set duplicado sin usar en `acct_1USQ9PPHITinnbKm` (la cuenta del conector). **Decidir cuál cuenta queda.**
- Mejoras: Checkout en español con dirección y RFC, idempotencia, cobro inmediato al subir asientos, búsqueda de precios por lookup key, `automatic_tax` apagado tras un interruptor.
- Prueba E2E en producción: pasó y se limpió.
- /plataforma → Configuración ahora tiene bloques plegables con estado por bloque.

## 10. Cuentas de prueba (dev)
- Dueño de la org "Colibly": `luis.islas@colibly.com` (con acceso a /plataforma).
- Cliente "Vamex": `admin.vamex@colibly.test` (sin /plataforma).
- Las contraseñas no se documentan aquí.

## 11. Commits en `feat/lanzamiento-pulido` (18–19 oct.)
- `40f8254` (2026-10-18) feat(app): páginas 404 y de error en español con la marca de Colibly
- `b732573` (2026-10-18) feat(correo): bienvenida al confirmar el correo de una cuenta nueva
- `f7861c5` (2026-10-18) feat(sitio): páginas públicas de contacto, eliminación de datos y precios, enlazadas desde pies y legales
- `b4a8b9d` (2026-10-18) feat(oferta): registro abierto con prueba de 30 días en la landing, cPanel, términos y formulario de contacto
- `cc0618e` (2026-10-18) docs: sitio público con registro abierto, páginas nuevas y archivos de cPanel
- `366313e` (2026-10-18) feat(sitio): menú de hamburguesa accesible en el encabezado público (beta y sitio)
- `ad713bc` (2026-10-18) fix(sitio): contraste AA en microtextos con el token --muted-strong y textos mínimos de 12 px
- `1360215` (2026-10-18) fix(login): entrada de 250 ms (antes 600 ms) y sin animación con prefers-reduced-motion
- `1a33ce9` (2026-10-18) feat(sitio): páginas informativas (precios, contacto) en dos columnas desde lg
- `6884cec` (2026-10-18) feat(landing): sección de WhatsApp Coexistence y secciones a dos columnas en escritorio
- `4b3fe4f` (2026-10-18) feat(cpanel): mismo menú móvil, contraste, dos columnas y sección de coexistencia en la copia estática
- `ad43f24` (2026-10-18) docs: menú móvil compartido del sitio público
- `2692dfc` (2026-10-18) cpanel-site: APP_URL configurable por COLIBLY_APP_URL, 404 en router de vista previa, proteger legal-layout.php
- `2e3c61a` (2026-10-18) docs(diseño): tres direcciones de landing
- `1cacec5` (2026-10-18) feat(diseño): paleta Menta y grafito en tokens, tema oscuro, brand-colors y favicon
- `074cfcc` (2026-10-18) feat(diseño): quitar degradados y halos del hero y auth; fondo plano con textura de puntos
- `0cccfa2` (2026-10-18) feat(pwa): theme-color y manifiesto con la paleta nueva
- `52f30ed` (2026-10-18) feat(cpanel): paleta Menta y grafito en site.css, iconos y share.png (registro abierto · 30 días gratis)
- `d5b7f77` (2026-10-18) test(contraste): pares fijos de brand-colors y site.css de cpanel
- `5246f32` (2026-10-19) feat(billing): precio por ejecutivo en MXN, seatQuantity y límites en bolsa por asiento
- `d5261d1` (2026-10-19) feat(billing): Stripe por cantidad: checkout con asientos, cambio con prorrateo y sync de quantity
- `06a7333` (2026-10-19) feat(plan): Plan y facturación con asientos usados/pagados, precio por ejecutivo, total y bloqueos
- `cc79e25` (2026-10-19) feat(precios): copia pública en MXN por ejecutivo, Coexistencia y cargos de Meta aparte
- `e528d40` (2026-10-19) feat(cpanel): precios generados desde plans.ts (pricing.generated.php + bloque de llms.txt)
- `3766f2c` (2026-10-19) docs: precio por ejecutivo (PRECIOS_POR_EJECUTIVO_2026-10-19) y oferta anterior superada
- `126d678` (2026-10-19) feat(whatsapp): coexistencia activa por defecto
- `2c5872a` (2026-10-19) feat(billing): prueba con bolsa plana, Telegram/Messenger/Instagram 1 por ejecutivo, máximo 100 asientos
- `a85d676` (2026-10-19) fix(email): en desarrollo usar el SMTP de Mailpit del entorno si /plataforma no tiene SMTP
- `7eeb20e` (2026-10-19) fix(whatsapp): la bandeja respeta la ventana de 24 h y se registra el motivo de los envíos fallidos
- `944773c` (2026-10-19) feat(bandeja): enviar plantilla aprobada desde el chat de WhatsApp
- `05c182a` (2026-10-19) fix(billing): 1 conexion por ejecutivo activo (WhatsApp Coexistencia/API, Telegram, Messenger, Instagram), tambien en prueba
- `e4316ce` (2026-10-19) feat(coexistencia): la libreta de WhatsApp Business ya no crea contactos
- `e8d62f1` (2026-10-19) feat(billing): avisos de contactos 80/100/120 %, gracia al 120 % y contador en Contactos
- `2406d0f` (2026-10-19) docs: auditoría API pública y webhooks (Pro)
- `bb2faf7` (2026-10-19) API/webhooks: IP confiable, Idempotency-Key, headers de límite, pausa de webhooks por pérdida de admin, topes, fanout por organización, contact.created en coexistencia, docs públicas /docs/api y texto de marketing
- `1cad459` (2026-10-19) API v1: límites en capas (key/org/IP/endpoint, cupo diario de envíos), fail-closed sin Redis, caché de auth en Redis, tope de cuerpo 1 MB, pool de Prisma configurable, webhooks 20 en paralelo con 2 por endpoint y headers Event-Id/Attempt; docs y tests
- `fb7cc69` (2026-10-19) Planes: Esencial $99 / Negocio $199 (antes Básico) / Pro $349 por ejecutivo; prueba de 14 días sin gracia; correos contacto@ y noreply@; precios cPanel regenerados
- `0b2a86f` (2026-10-19) cPanel: cache-busting ?v=filemtime en CSS/JS, Cache-Control no-cache en PHP, sitemap
- `4aae232` (2026-10-19) cPanel: favicon.ico verde y ?v=filemtime en icono, apple-touch-icon y share.png; README paleta Menta y grafito
- `974b5f7` (2026-10-19) Stripe: idempotencia en checkout y cambios, checkout en español con dirección y RFC, cobro inmediato al subir asientos/plan, precios por lookup_key, interruptor de Stripe Tax; /plataforma: bloques plegables con estado

## 12. Pendientes
- [x] Limpiar caché NGINX en cPanel (2026-10-20; la landing coincide con `cpanel-site/`).
- [x] Corregir SMTP de producción (error 535): el usuario debía ser `noreply@colibly.com` (2026-10-20).
- [ ] Stripe revenue recovery: Smart Retries (~7 días), correos de pago fallido, actualizador de tarjetas, "marcar como impaga". **Del lado de Colibly hecho (2026-11-05)**: aviso al fallar + recordatorios a 3 y 1 día de solo lectura que mandan a "Administrar facturación". Falta activar en el dashboard de Stripe (live) Smart Retries, el actualizador automático de tarjetas y, si se quiere, sus correos de pago fallido.
- [ ] Decidir cuenta de Stripe y pasar a live (llave live, recrear precios y webhook).
- [ ] Rotar App Secret de Meta.
- [ ] WABA: método de pago, verificación del negocio y nombre visible.
- [x] Responsable en el aviso de privacidad: Colibly Inc. (2026-11-05).
- [ ] Cambiar contraseña del FTP.
- [ ] IVA con el contador (no se emite CFDI: decidido 2026-11-05).
- [ ] Rotar token de Coolify.
- [ ] Respaldos a R2 y monitoreo.
- [ ] Logo final.
- [x] Rotación de llaves API en un clic (2026-11-05: "Rotar" en Configuración → API, con 24 h de gracia opcional).
- [ ] Evaluar flexible billing mode de Stripe.
- [ ] Probar en vivo la concurrencia de webhooks por endpoint.

## 13. Seguimiento del 2026-10-20
Resumen en [PLAN_LANZAMIENTO.md](PLAN_LANZAMIENTO.md) → "Estado al 2026-10-20": revisión completa, arreglos de Stripe probados contra el sandbox, fechas con zona horaria, JSON mal formado → 400, SMTP corregido, pagos apagados en producción, solo queda `main` (ramas sin fusionar archivadas como tags `archivo/*`), `llms.txt` de la landing en 14 días y widget de Turnstile creado.
