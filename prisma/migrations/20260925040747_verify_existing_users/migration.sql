-- Los usuarios anteriores a la verificación por correo se dan por verificados:
-- se crearon a mano por un admin o en la instalación, no por registro público.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
