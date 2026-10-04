-- Etiquetas por cuenta (auditoría 2026-09-16, A3). El catálogo `tags` era
-- global con `name` único: todos los clientes veían las etiquetas de todos (y
-- los nombres de sus campañas vía "Campaña: X"). Cada etiqueta pasa a
-- pertenecer a una sola cuenta (WhatsApp o canal).
--
-- Datos existentes: cada etiqueta se reparte entre las cuentas que la usan
-- (contactos, chats, conversaciones, disparadores de secuencias y reglas de
-- enrutamiento). La primera cuenta conserva el id original; las demás reciben
-- una copia (mismo nombre y color) y sus referencias se reapuntan a ella.
-- Las etiquetas que ninguna cuenta usa no tienen dueño posible y se eliminan.

-- DropIndex
DROP INDEX "tags_name_key";

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "channelAccountId" TEXT,
ADD COLUMN     "waAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tags_waAccountId_name_key" ON "tags"("waAccountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_channelAccountId_name_key" ON "tags"("channelAccountId", "name");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "wa_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Datos: repartir cada etiqueta entre las cuentas que la usan
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tag_scopes AS
SELECT DISTINCT u.tag_id, u.wa_account_id, u.channel_account_id
FROM (
  SELECT ct."tagId" AS tag_id, c."accountId" AS wa_account_id, c."channelAccountId" AS channel_account_id
  FROM contact_tags ct JOIN contacts c ON c.id = ct."contactId"
  UNION ALL
  SELECT cht."tagId", ch."accountId", NULL
  FROM chat_tags cht JOIN wa_chats ch ON ch.id = cht."chatId"
  UNION ALL
  SELECT cht."tagId", NULL, cv."channelAccountId"
  FROM chat_tags cht JOIN conversations cv ON cv.id = cht."conversationId"
  UNION ALL
  SELECT s."triggerValue", s."waAccountId", s."channelAccountId"
  FROM wa_sequences s WHERE s."triggerType" = 'TAG_ADDED' AND s."triggerValue" IS NOT NULL
  UNION ALL
  SELECT r."conditionValue", r."waAccountId", NULL
  FROM wa_account_routing_rules r WHERE r."conditionType" = 'TAG'
) u
WHERE u.tag_id IN (SELECT id FROM tags)
  AND (u.wa_account_id IS NOT NULL) <> (u.channel_account_id IS NOT NULL);

-- La primera cuenta (orden determinista) conserva el id original.
CREATE TEMP TABLE tag_scope_map AS
SELECT
  tag_id,
  wa_account_id,
  channel_account_id,
  CASE
    WHEN row_number() OVER (PARTITION BY tag_id ORDER BY wa_account_id NULLS LAST, channel_account_id NULLS LAST) = 1 THEN tag_id
    ELSE 'tag' || substr(md5(tag_id || coalesce(wa_account_id, '') || coalesce(channel_account_id, '') || clock_timestamp()::text), 1, 22)
  END AS new_tag_id
FROM tag_scopes;

INSERT INTO tags (id, name, color, created_at, "waAccountId", "channelAccountId")
SELECT m.new_tag_id, t.name, t.color, t.created_at, m.wa_account_id, m.channel_account_id
FROM tag_scope_map m JOIN tags t ON t.id = m.tag_id
WHERE m.new_tag_id <> m.tag_id;

UPDATE tags t
SET "waAccountId" = m.wa_account_id, "channelAccountId" = m.channel_account_id
FROM tag_scope_map m
WHERE m.tag_id = t.id AND m.new_tag_id = t.id;

UPDATE contact_tags ct
SET "tagId" = m.new_tag_id
FROM contacts c, tag_scope_map m
WHERE c.id = ct."contactId"
  AND m.tag_id = ct."tagId" AND m.new_tag_id <> m.tag_id
  AND m.wa_account_id IS NOT DISTINCT FROM c."accountId"
  AND m.channel_account_id IS NOT DISTINCT FROM c."channelAccountId";

UPDATE chat_tags cht
SET "tagId" = m.new_tag_id
FROM wa_chats ch, tag_scope_map m
WHERE ch.id = cht."chatId"
  AND m.tag_id = cht."tagId" AND m.new_tag_id <> m.tag_id
  AND m.wa_account_id = ch."accountId" AND m.channel_account_id IS NULL;

UPDATE chat_tags cht
SET "tagId" = m.new_tag_id
FROM conversations cv, tag_scope_map m
WHERE cv.id = cht."conversationId"
  AND m.tag_id = cht."tagId" AND m.new_tag_id <> m.tag_id
  AND m.channel_account_id = cv."channelAccountId" AND m.wa_account_id IS NULL;

UPDATE wa_sequences s
SET "triggerValue" = m.new_tag_id
FROM tag_scope_map m
WHERE s."triggerType" = 'TAG_ADDED'
  AND m.tag_id = s."triggerValue" AND m.new_tag_id <> m.tag_id
  AND m.wa_account_id IS NOT DISTINCT FROM s."waAccountId"
  AND m.channel_account_id IS NOT DISTINCT FROM s."channelAccountId";

UPDATE wa_account_routing_rules r
SET "conditionValue" = m.new_tag_id
FROM tag_scope_map m
WHERE r."conditionType" = 'TAG'
  AND m.tag_id = r."conditionValue" AND m.new_tag_id <> m.tag_id
  AND m.wa_account_id = r."waAccountId" AND m.channel_account_id IS NULL;

-- Etiquetas sin ninguna cuenta que las use: sin dueño posible.
DELETE FROM tags WHERE "waAccountId" IS NULL AND "channelAccountId" IS NULL;

DROP TABLE tag_scope_map;
DROP TABLE tag_scopes;
