#!/bin/sh
set -e

echo "=== Colibly Production Startup ==="

# El cliente de Prisma ya viene generado en la imagen (stage builder →
# node_modules). Generarlo de nuevo aquí sumaba ~4 s de caída en cada deploy
# (QA-007): Coolify recrea el contenedor y nadie atiende mientras arranca.

# El servicio worker arranca cuando app ya migró (depends_on healthy): no
# migra de nuevo, para no correr dos `migrate deploy` a la vez.
if [ "${COLIBLY_SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "1. Migrations skipped (COLIBLY_SKIP_MIGRATIONS=1)"
else
  echo "1. Applying database migrations..."
  # prisma migrate (no destructivo) — ver scripts/db-migrate.sh. Reemplaza al
  # antiguo `db push --accept-data-loss`, que podía borrar columnas con datos
  # en cualquier deploy.
  sh ./scripts/db-migrate.sh
fi

echo "2. Starting application..."
exec npm start
