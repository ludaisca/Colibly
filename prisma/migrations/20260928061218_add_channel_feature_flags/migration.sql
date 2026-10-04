-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "channel_instagram_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channel_messenger_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channel_telegram_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channel_webchat_enabled" BOOLEAN NOT NULL DEFAULT false;

-- DataFixup: una organización que en producción ya tenía cuentas de un canal
-- antes de este flag no debe verse "sin acceso" a algo que ya usaba, ni
-- bloquearse al intentar conectar una segunda cuenta del mismo canal.
UPDATE "organizations" o
SET "channel_telegram_enabled" = true
WHERE EXISTS (SELECT 1 FROM "channel_accounts" ca WHERE ca."organization_id" = o.id AND ca."channel" = 'TELEGRAM');

UPDATE "organizations" o
SET "channel_messenger_enabled" = true
WHERE EXISTS (SELECT 1 FROM "channel_accounts" ca WHERE ca."organization_id" = o.id AND ca."channel" = 'MESSENGER');

UPDATE "organizations" o
SET "channel_instagram_enabled" = true
WHERE EXISTS (SELECT 1 FROM "channel_accounts" ca WHERE ca."organization_id" = o.id AND ca."channel" = 'INSTAGRAM');

UPDATE "organizations" o
SET "channel_webchat_enabled" = true
WHERE EXISTS (SELECT 1 FROM "channel_accounts" ca WHERE ca."organization_id" = o.id AND ca."channel" = 'WEBCHAT');

