#!/bin/sh
# Crea y aplica una migración a partir de los cambios en prisma/schema.prisma.
# Uso (dentro del contenedor app):  sh scripts/new-migration.sh nombre_del_cambio [--create-only]
#   --create-only  genera el SQL sin aplicarlo — para agregar SQL de datos a mano
#                  (p. ej. repartir filas existentes) y luego aplicar con
#                  `npx prisma migrate deploy && npx prisma generate`.
#
# Por qué no `prisma migrate dev`: el índice IVFFlat de wa_bot_knowledge vive
# fuera de Prisma (prisma/sql/ensure-vector-index.sql), así que migrate dev
# detecta "drift" contra la base de desarrollo y ofrece RESETEARLA. Aquí el SQL
# se genera comparando las migraciones existentes (aplicadas en una base
# sombra desechable) contra el schema, sin mirar la base real, y se aplica con
# `migrate deploy`, que no hace detección de drift.
set -e

NAME="$1"
CREATE_ONLY="$2"
if [ -z "$NAME" ]; then
  echo "Uso: sh scripts/new-migration.sh <nombre_del_cambio> [--create-only]"
  exit 1
fi

SHADOW_URL=$(node -e '
const { PrismaClient } = require("@prisma/client");
const base = new URL(process.env.DATABASE_URL);
const shadowName = base.pathname.slice(1) + "_shadow";
const admin = new URL(base); admin.pathname = "/postgres";
const p = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
(async () => {
  await p.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadowName}"`);
  await p.$executeRawUnsafe(`CREATE DATABASE "${shadowName}"`);
  await p.$disconnect();
  const shadow = new URL(base); shadow.pathname = "/" + shadowName;
  process.stdout.write(shadow.toString());
})().catch((e) => { console.error(e); process.exit(1); });
')

DIR="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_${NAME}"
mkdir -p "$DIR"
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_URL" \
  --script > "$DIR/migration.sql"

# La base sombra solo sirve para calcular el diff.
node -e '
const { PrismaClient } = require("@prisma/client");
const base = new URL(process.env.DATABASE_URL);
const admin = new URL(base); admin.pathname = "/postgres";
const p = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
p.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${base.pathname.slice(1)}_shadow"`).finally(() => p.$disconnect());
'

if ! grep -qvE '^\s*(--.*)?$' "$DIR/migration.sql"; then
  rm -rf "$DIR"
  echo "[new-migration] schema.prisma no tiene cambios respecto a las migraciones — no se creó nada."
  exit 0
fi

echo "[new-migration] Creada $DIR/migration.sql — revísala (y agrega SQL de datos si hace falta) antes de hacer commit."
if [ "$CREATE_ONLY" = "--create-only" ]; then
  echo "[new-migration] --create-only: no se aplicó. Cuando esté lista: npx prisma migrate deploy && npx prisma generate"
  exit 0
fi
npx prisma migrate deploy
npx prisma generate
echo "[new-migration] Aplicada. Reinicia el contenedor app para que el proceso de Next y los workers usen el cliente nuevo."
