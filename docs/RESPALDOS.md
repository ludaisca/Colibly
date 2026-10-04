# Respaldos de la plataforma

Respaldo diario de **toda la base de datos de Colibly** (todas las organizaciones) a un almacenamiento compatible con S3 (Cloudflare R2, AWS S3, Backblaze B2, MinIO…), configurable solo por el operador desde **`/plataforma` → Respaldos**. Cada respaldo **sobrescribe al anterior**.

Implementación: `lib/backups/` · API `app/api/plataforma/respaldos/route.ts` · UI `app/(dashboard)/plataforma/_respaldos.tsx` · prueba de punta a punta `dev/coexistencia/pruebas/04-respaldos.cjs`.

## Qué se respalda y dónde queda

Con la carpeta (prefijo) `colibly` por defecto, en el bucket quedan **solo estos objetos, siempre con la misma clave**:

| Objeto | Contenido |
|---|---|
| `colibly/colibly-db.dump` | `pg_dump` en formato custom (`-Fc`, ya comprimido): todas las tablas, incluida la extensión pgvector y el índice de RAG. |
| `colibly/manifiesto.json` | Fecha, tamaño y `sha256` del dump, última migración aplicada, y lo mismo de los medios si se incluyeron. |
| `colibly/colibly-media.tar.gz` | Opcional (interruptor "Incluir archivos multimedia"): `MEDIA_ROOT` completo. Si se apaga el interruptor, el tar viejo **no se borra solo**; el manifiesto dice `media: null` para saber que ya no se actualiza. |

**Sobrescribir es seguro frente a fallos**: el dump se sube por partes (multiparte) y S3 solo reemplaza el objeto anterior cuando la subida termina completa. La subida solo se cierra si `pg_dump` terminó con código 0; si muere a medias, se aborta y el respaldo de ayer queda intacto (verificado matando `pg_dump` en plena subida). Tras subir se compara el tamaño en el bucket con los bytes producidos.

## Cómo funciona

- **Sin archivos temporales**: `pg_dump` → flujo → subida multiparte (16 MB por parte, ~160 GB máximo). El uso de memoria es de decenas de MB sin importar el tamaño.
- **Programación**: un tick de BullMQ (cola `platform-backup`, minutos 11/26/41/56) pregunta "¿ya tocó el respaldo de hoy?" (`lib/backups/schedule.ts`, función pura con pruebas). La hora se elige en la UI y es **hora de Ciudad de México**. Al activar la función el primer respaldo sale de inmediato.
- **Reintentos**: si falla, reintenta pasada 1 hora, hasta 3 intentos por horario. Al agotarlos manda un **correo a los `PLATFORM_ADMIN_EMAILS`** (necesita el SMTP configurado en `/plataforma` → Configuración). Un respaldo "en curso" por más de 3 h se da por interrumpido (reinicio del servidor).
- **Historial**: tabla `platform_backup_runs`, 90 días; se ve en la pestaña.
- **Secretos**: Access Key ID y Secret Access Key se guardan **cifrados** (AES-256-GCM, igual que el resto de `PlatformSettings`) y nunca se vuelven a mostrar. Los errores guardados y mostrados se limpian de claves y contraseñas.
- **Acceso**: solo operadores (`requirePlatformAdmin()`; a cualquier otro la API le responde 404).

## Configurar Cloudflare R2 (recomendado: sin costo de salida de datos)

1. Cloudflare → R2 → crear bucket (p. ej. `colibly-respaldos`). Sin acceso público.
2. R2 → *Manage API tokens* → crear token **Object Read & Write** limitado a ese bucket. Copiar *Access Key ID*, *Secret Access Key* y el endpoint `https://<ID-de-cuenta>.r2.cloudflarestorage.com`.
3. `/plataforma` → Respaldos: endpoint = ese URL, región = `auto`, bucket, carpeta (opcional), las dos claves → **Guardar** → **Probar conexión** (escribe, lee y borra un objeto de prueba) → activar el interruptor → Guardar.
4. Para AWS S3: dejar el endpoint vacío y poner la región real del bucket (p. ej. `us-east-1`).

Recomendación de seguridad: R2/S3 cifran en reposo, pero el dump contiene datos personales (contactos, mensajes, hashes de contraseña). Mantén el bucket privado y la clave limitada a ese bucket. Como el respaldo se sobrescribe, un error que pase inadvertido se replica al día siguiente: si el almacenamiento lo permite (S3 sí, R2 no), activa el **versionado** del bucket con una regla de expiración a unos días.

## ⚠️ Lo que el respaldo NO incluye (guárdalo aparte)

Los secretos dentro de la base (tokens de WhatsApp, credenciales de canales, claves de IA/Stripe/SMTP, App Secret de Meta…) están cifrados con **`ENCRYPTION_KEY`**, que vive en las variables de entorno de Coolify, no en la base. Sin esa clave, una base restaurada funciona pero **ninguno de esos secretos se puede descifrar** (habría que reconectar todos los canales). Guarda en un gestor de contraseñas, fuera del servidor:

- `ENCRYPTION_KEY` (la crítica), `AUTH_SECRET`, `DB_PASSWORD`, `PLATFORM_ADMIN_EMAILS`.

## Restaurar (probado en `04-respaldos.cjs`)

Hay que restaurar a un PostgreSQL 16 con **pgvector** (la imagen `pgvector/pgvector:pg16` del compose). Desde cualquier máquina con el cliente `postgresql16-client` o dentro de un contenedor:

```bash
# 1. Bajar el dump (ejemplo con la CLI de AWS; en R2 añade --endpoint-url)
aws s3 cp s3://colibly-respaldos/colibly/colibly-db.dump ./colibly-db.dump \
  --endpoint-url https://<ID-de-cuenta>.r2.cloudflarestorage.com

# 2. (Opcional) comprobar integridad contra el manifiesto
sha256sum colibly-db.dump        # debe igualar database.sha256 de manifiesto.json

# 3. Crear una base vacía y restaurar. NO crees la extensión "vector" antes:
#    el dump ya la trae y pg_restore la crea (necesita un usuario superusuario).
createdb -h <host> -U postgres colibly_db
pg_restore --no-owner --no-privileges -h <host> -U postgres -d colibly_db colibly-db.dump
```

Después:

1. Apunta `DATABASE_URL` de la aplicación a esa base y **conserva el mismo `ENCRYPTION_KEY`** de antes.
2. Arranca la aplicación: `scripts/db-migrate.sh` aplica cualquier migración posterior al respaldo y recrea el índice IVFFlat si hiciera falta.
3. Si se incluyeron medios: `tar -xzf colibly-media.tar.gz -C <volumen media_data>` (`/app/media`).
4. Revisa en `/plataforma` que las organizaciones estén y vuelve a **Probar conexión** en Respaldos.

**Simulacro recomendado**: cada cierto tiempo restaura el dump en una base de prueba (los pasos 1–3 con otro nombre de base) y compara conteos. Un respaldo que nunca se probó restaurar no es un respaldo.

## Operación y límites

- Requiere `pg_dump` 16 en la imagen de la app (`postgresql16-client` en la etapa `base` del `Dockerfile`; misma versión mayor que el servidor). Si algún día se sube PostgreSQL a 17, hay que subir también el cliente.
- Variables de entorno usadas: solo las que la app ya tiene (`DATABASE_URL`, `MEDIA_ROOT`). No hay variables nuevas: toda la configuración vive en `PlatformSettings`.
- Mientras corre, `pg_dump` toma bloqueos de lectura; una migración que esté alterando tablas en ese momento espera hasta 60 s y, si no, el respaldo falla y se reintenta.
- El tar de medios corre durante el día; si el limpiador diario de medios (`media-cleanup`) borra archivos en ese instante, `tar` puede fallar y el respaldo se reintenta. El limpiador corre a las 3:00 (hora del contenedor); elige para el respaldo una hora distinta si notas fallos de `tar` en el historial.
- Los respaldos no son por organización: sirven para recuperar la plataforma entera, no para restaurar a un solo cliente.
