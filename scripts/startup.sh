#!/bin/sh
set -e

echo "=== SundayCRM Production Startup ==="

echo "1. Generating Prisma client..."
npx prisma generate

echo "2. Applying database migrations..."
# prisma migrate (no destructivo) — ver scripts/db-migrate.sh. Reemplaza al
# antiguo `db push --accept-data-loss`, que podía borrar columnas con datos
# en cualquier deploy.
sh ./scripts/db-migrate.sh

echo "3. Starting application..."
exec npm start
