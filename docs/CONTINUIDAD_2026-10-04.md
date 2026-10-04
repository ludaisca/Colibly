# Continuidad — 2026-10-04

Punto de retoma tras la sesión del 3–4 de octubre de 2026 (coexistencia de WhatsApp, respaldos, limpieza de ramas). Lee esto primero; el detalle técnico está en `AGENTS.md` y los documentos enlazados.

## Estado en una mirada

| Qué | Estado |
|---|---|
| Repositorio | **Solo existe `main`** (local y GitHub). Sin PR abiertos ni worktrees. Todo el trabajo de esta sesión está mezclado (PR #2 a #5). |
| Producción (`app.colibly.com`) | **No se ha desplegado nada de esto.** Sigue el despliegue del 2026-10-02 (commit `3d609a7`). Coolify tiene el despliegue automático apagado (`is_auto_deploy_enabled=false`). |
| Coolify | La app `colibly` (`narrmk3x6fht3fgbz3gsqw33`) **todavía apunta a la rama `feat/rebrand-colibly`, que ya no existe**. Un redeploy fallaría hasta cambiarla a `main`. |
| Meta App Review | **`PENDING`** desde 2026-10-02 23:53 CST (envío `3423949677784972`, app `3423949611118312`). Sin veredicto ni rechazos. Los pasos `screencast` y `api_precheck` siguen en falso en `whatsapp_business_messaging` y `whatsapp_business_management`. |
| Coexistencia de WhatsApp | Implementada y verificada contra un Meta **simulado**; **no probada con Meta real**. Apagada por defecto por organización. |
| Respaldos | Implementados y **probados con un R2 real de prueba** (respaldo → descarga → `pg_restore` → conteos iguales). En producción aún no configurados. |
| Textos legales | Genéricos por decisión; aviso de privacidad al día con coexistencia y respaldos. Falta lo indicado abajo antes del lanzamiento general. |
| CI de GitHub | En verde (tsc, lint, pruebas y build de producción). |

## Qué se hizo en esta sesión

1. **Embedded Signup v4 y coexistencia** (`docs/PLAN_COEXISTENCIA.md`, `AGENTS.md` → "WhatsApp: Embedded Signup and coexistence"): botón "Conectar WhatsApp", webhook firmado con el App Secret de la plataforma, ecos/historial/contactos en silencio por cola, ciclo de vida, callbacks de desautorización y borrado de datos, interruptor por organización. Migraciones aditivas.
2. **Respaldo diario a S3/R2** (`docs/RESPALDOS.md`): `pg_dump` en streaming, sobrescribe el anterior, configurable solo por el operador en `/plataforma` → Respaldos, reintentos y correo de alerta, endpoint `/api/health/respaldos` para un monitor externo. Una migración aditiva.
3. **Aviso de privacidad** actualizado (coexistencia y copias de seguridad), en la app y en `cpanel-site/`.
4. **CI**: `tsc` necesitaba más memoria en el runner (`NODE_OPTIONS=--max-old-space-size=4096` en `ci.yml`); era la primera vez que el CI corría.
5. **Mensajes de error de R2** en español (credenciales cruzadas, región, bucket, acceso denegado).
6. **Limpieza de ramas y del stack aislado** (`colibly-coex`, ya borrado).
7. **Imagen de desarrollo reconstruida**: ya trae `pg_dump` 16 y el SDK de S3 de forma permanente.

## Pendientes, en orden recomendado

### A. Desplegar lo nuevo a producción (depende de ti)
1. **Coolify → app `colibly` → Configuración → Branch → `main`** (yo no puedo editarlo por la API).
2. **Respaldar la base de producción antes** (`pg_dump` manual): el deploy aplica 3 migraciones aditivas (2 de coexistencia + 1 de respaldos) y `migrate deploy` no revierte una migración a medias.
3. Desplegar (se puede pedir a Claude con la herramienta de Coolify) y comprobar `https://app.colibly.com/api/health`.
4. La coexistencia queda apagada; el respaldo queda apagado hasta configurarlo.

### B. R2 de producción
1. Revocar en Cloudflare el token de **prueba** (aparece en capturas del chat) y sus claves.
2. Crear bucket y token **nuevos** (Object Read & Write, limitado a ese bucket). Pasos en `docs/RESPALDOS.md`.
3. `/plataforma` → Respaldos: configurar → **Probar conexión** → activar. Las claves se escriben **a mano en esa pantalla**, no por el chat.
4. **Guardar `ENCRYPTION_KEY` y `AUTH_SECRET` fuera del servidor** (el respaldo no las incluye; sin ellas una base restaurada no descifra tokens ni credenciales).
5. Simulacro de restauración con el respaldo de producción.

### C. Monitores externos (cuenta propia: UptimeRobot, Better Stack…)
`https://app.colibly.com/api/health` y `https://app.colibly.com/api/health/respaldos` (detalle en `docs/RESPALDOS.md`). Tiene que ser externo: el servidor está en una conexión residencial.

### D. Meta
1. Esperar el veredicto del App Review. Consultar con `devtools_app_review` (`status`, `requirements`, `privileges`, `history`) sobre la app `3423949611118312`. Si piden algo o rechazan, el motivo sale ahí; corregir y reenviar.
2. Si `screencast`/`api_precheck` siguen en falso tras uno o dos días más, hacer más llamadas de prueba con el número de prueba.
3. Con la revisión aprobada y lo anterior desplegado, seguir `docs/PLAN_COEXISTENCIA.md` §13 (App ID, ID de configuración y **App Secret** en `/plataforma`, webhook y campos en Meta, URLs de desautorización y borrado, piloto) y verificar lo de §14 con Meta real.
4. Agregar un **segundo administrador** al portafolio de Meta.

### E. Legal (antes del lanzamiento general; la beta puede seguir así)
- Nombrar al responsable (persona física o moral) y su domicilio en el aviso de privacidad: la ley mexicana de protección de datos pide identidad y domicilio. Revisión con abogado.
- Decidir si los precios incluyen impuestos y cómo se factura; alta en el SAT con el contador.
- Al publicar `cpanel-site/` hay que subir `privacidad.php` y `legal-layout.php` (esa es la URL de privacidad que usa Meta).

### F. Lo demás del plan de lanzamiento
Logo final "Impulso", registro de la marca (IMPI), usuarios en redes, Stripe (al final, con claves de prueba y `stripe listen`), Messenger/Instagram con su propio App Review, claves de IA en `/plataforma`. Ver `docs/PLAN_LANZAMIENTO.md`.

## Cómo retomar en cinco minutos

```bash
cd /data/Proyectos/Colibly                    # rama main
git pull
podman compose up -d                          # dev en http://localhost:15100 (o http://ludaisca:15100)
podman compose exec app npx tsc --noEmit
podman compose exec app npm test
```

- **Dev normal** (`colibly`, puerto 15100): corre sobre `main` con las 25 migraciones aplicadas; su imagen ya tiene `pg_dump`. Si cambia `package.json`, ejecuta `podman compose exec app npm install` o reconstruye con `podman compose build app` (después `podman image prune -f`).
- **Operador en dev**: el correo de `PLATFORM_ADMIN_EMAILS` del `.env` (`/plataforma`).
- **Stack aislado para migraciones o pruebas de punta a punta**: ya no está levantado. Recréalo con `dev/coexistencia/README.md` (copiar `.env.example`, `podman compose -f dev/coexistencia/compose.yml up -d`; incluye un S3 local y las pruebas `dev/coexistencia/pruebas/01…04`). Necesita su propio `.env` con secretos nuevos. Ojo: el compose reutiliza la imagen `colibly-app:latest`.
- **Telegram en dev**: el túnel y el gateway están detenidos; para levantarlos, `dev/telegram-webhook/` (README ahí). La vista previa PHP de `cpanel-site/` se corría como contenedor efímero y ya no existe.
- **Restos locales a tener presentes**: la base de dev tiene configurado el R2 de **prueba** (claves cifradas) con el respaldo diario **activado**; revoca el token y apágalo o cámbialo. Hay un respaldo de la base de dev anterior a `main` en `/home/luis/respaldos-dev/colibly_db-antes-de-main-20261004.dump`.

## Decisiones tomadas (para no re-litigarlas)

- **Un solo `main`**: sin ramas largas; los cambios entran por PR con commits de merge. Se mezcló a `main` y no a `feat/rebrand-colibly` para que ningún merge pudiera disparar un despliegue.
- **Coexistencia**: contactos importados sin bloquear por el límite del plan; ecos aparte de las métricas de agentes; se invita a compartir historial; bandera por organización apagada por defecto.
- **Respaldos**: un único respaldo que se sobrescribe cada día (a petición del usuario), hora en horario de Ciudad de México; si el almacenamiento lo permite, conviene versionado del bucket.
- **Legal**: texto genérico (razón social "Colibly", contacto por correo, jurisdicción México) hasta el lanzamiento general.
- **Credenciales**: nunca se pegan en el chat para configurar producción; se escriben en `/plataforma`. (En esta sesión se usó un R2 de prueba en dev, a petición expresa.)

## Lecciones que ya costaron tiempo

- **CI**: sin la caché incremental, `tsc` supera los ~2 GB del runner (se reproduce con `--incremental false --max-old-space-size=2048`).
- **Coolify**: nunca montar archivos del repo por bind mount; con despliegue automático activo, un push lanza un webhook que compite con un deploy manual (por eso está apagado).
- **R2**: un token limitado a un bucket da 403 también cuando el nombre del bucket no coincide; `ListBuckets` denegado es normal. `Access Key ID` = 32 hex; `Secret` = 64 hex; el token `cfat_…` no se usa en Colibly.
- **PlatformSettings** se guarda 30 s en caché: las pruebas que escriben directo en la base deben esperarlo (los endpoints de respaldos invalidan el caché antes de leer).
- **Workers de BullMQ no recargan en caliente**: tras editar `lib/workers/**` o `lib/backups/**`, reiniciar la app.
- **Limpieza de podman**: tras cada build de verificación, `podman rmi` del tag temporal y `podman image prune -f`; nunca `prune -a` ni `--volumes` (hay otros proyectos en el mismo LV).
