#!/bin/sh
# Aplica el schema a la base de datos de forma NO destructiva. Compartido por
# scripts/startup.sh (producción) y docker-compose.override.yml (desarrollo).
#
# Reemplaza al antiguo `prisma db push --accept-data-loss`, que en cada deploy
# sincronizaba el schema aceptando borrar columnas/tablas con datos (un
# renombre de campo en schema.prisma = DROP + ADD en producción).
#
# Tres casos:
#   1. Base ya administrada por prisma migrate (_prisma_migrations existe)
#      → `migrate deploy`.
#   2. Base vacía → `migrate deploy` (0_init crea todo).
#   3. Base creada con `db push` antes de este cambio → se "adopta": se lleva
#      de forma no destructiva al schema de 0_init (prisma/baseline/), se marca
#      0_init como aplicada y se aplican las migraciones posteriores. Si llevarla
#      a ese estado requiriera perder datos, `db push` aborta y el deploy falla
#      en vez de borrar nada.
set -e

STATE=$(node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const [row] = await p.$queryRawUnsafe(
    "SELECT to_regclass($1) IS NOT NULL AS managed, (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = $2 AND table_type = $3) AS tables",
    "public._prisma_migrations", "public", "BASE TABLE"
  );
  process.stdout.write(row.managed ? "managed" : row.tables === 0 ? "empty" : "unmanaged");
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
')

echo "[db-migrate] Estado de la base: $STATE"

if [ "$STATE" = "unmanaged" ]; then
  echo "[db-migrate] Base creada con db push — adoptando migraciones (baseline 0_init)"
  npx prisma db push --skip-generate --schema prisma/baseline/schema.prisma
  npx prisma migrate resolve --applied 0_init
fi

npx prisma migrate deploy

# El índice IVFFlat necesita que wa_bot_knowledge ya exista — ver docker/init.sql.
npx prisma db execute --file prisma/sql/ensure-vector-index.sql --schema prisma/schema.prisma

# Índices trigram de la búsqueda en mensajes. En tablas grandes no se crean
# aquí (solo avisan): runbook en docs/arquitectura/desarrollo.md.
npx prisma db execute --file prisma/sql/ensure-search-indexes.sql --schema prisma/schema.prisma
