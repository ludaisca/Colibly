-- DropIndex
DROP INDEX "contacts_pipeline_stage_id_idx";

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "contacts_pipeline_stage_id_updated_at_idx" ON "contacts"("pipeline_stage_id", "updated_at");

-- CreateIndex
CREATE INDEX "contacts_pipeline_stage_id_stage_entered_at_idx" ON "contacts"("pipeline_stage_id", "stage_entered_at");


-- Datos existentes: el mejor dato de "desde cuándo" es la creación. Para los
-- que siguen en la primera etapa es exacto (nunca se movieron); para los demás
-- solo importa a partir de su próximo cambio, que el trigger registra.
UPDATE "contacts" SET "stage_entered_at" = "created_at";

-- Cualquier cambio de etapa o de estado del lead, venga de donde venga (UI,
-- API, bots, automatizaciones, calificador), reinicia el reloj. Que un
-- contacto sin etapa reciba la que ya le correspondía por su estado (null ->
-- etapa, mismo leadStatus) no es moverse: no lo cuenta.
CREATE OR REPLACE FUNCTION contacts_stage_entered_at() RETURNS trigger AS $$
BEGIN
  IF NEW."leadStatus" IS DISTINCT FROM OLD."leadStatus"
     OR (OLD."pipeline_stage_id" IS NOT NULL AND NEW."pipeline_stage_id" IS DISTINCT FROM OLD."pipeline_stage_id") THEN
    -- La columna es timestamp sin zona en UTC (como todas las de Prisma).
    NEW."stage_entered_at" := now() AT TIME ZONE 'UTC';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_stage_entered_at
  BEFORE UPDATE OF "leadStatus", "pipeline_stage_id" ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION contacts_stage_entered_at();
