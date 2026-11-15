-- DropForeignKey
ALTER TABLE "lead_outcome_events" DROP CONSTRAINT "lead_outcome_events_contact_id_fkey";

-- AlterTable
ALTER TABLE "lead_outcome_events" ADD COLUMN     "contact_account_id" TEXT,
ADD COLUMN     "contact_channel_account_id" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ALTER COLUMN "contact_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "lead_outcome_events" ADD CONSTRAINT "lead_outcome_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Datos: foto del contacto en los eventos que ya existen, para que sigan
-- mostrándose y contando por cuenta si el contacto se borra después. Solo
-- llena las columnas nuevas (nulas); no toca ni borra ninguna otra.
-- El número es el remoteJid sin sufijo, solo en contactos que no son de un
-- canal genérico (ahí remoteJid es un id externo, no un teléfono).
UPDATE "lead_outcome_events" AS e
SET "contact_name" = c."name",
    "contact_phone" = CASE WHEN c."channelAccountId" IS NULL THEN split_part(c."remoteJid", '@', 1) END,
    "contact_account_id" = c."accountId",
    "contact_channel_account_id" = c."channelAccountId"
FROM "contacts" AS c
WHERE c."id" = e."contact_id";
