-- Canales disponibles por defecto también para organizaciones existentes.
-- El operador conserva los interruptores de /plataforma como excepción.
UPDATE "organizations"
SET
  "channel_telegram_enabled" = true,
  "channel_messenger_enabled" = true,
  "channel_instagram_enabled" = true,
  "channel_webchat_enabled" = true;
