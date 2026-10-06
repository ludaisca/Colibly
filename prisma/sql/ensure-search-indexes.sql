-- Idempotente. Corre después de `migrate deploy` (las tablas deben existir), igual
-- que ensure-vector-index.sql: son índices que Prisma no puede declarar, y si
-- estuvieran en una migración, `scripts/new-migration.sh` los vería como
-- diferencia contra schema.prisma y propondría borrarlos.
--
-- Búsqueda de contactos y empresas (`contains … mode: insensitive` = ILIKE
-- '%texto%'): un índice GIN de trigramas la acelera sin importar el prefijo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_people_name_trgm ON people USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_people_email_trgm ON people USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_people_phone_digits_trgm ON people USING gin (phone_digits gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
