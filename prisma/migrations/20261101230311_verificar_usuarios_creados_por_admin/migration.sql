-- Datos: los usuarios que un admin dio de alta con contraseña (POST /api/usuarios)
-- se crearon sin email_verified_at y el login los rechazaba siempre
-- (email_not_verified), sin correo para confirmarlo. Desde ahora ese alta los
-- marca verificados, como al aceptar una invitación; aquí se corrigen los que
-- ya existían.
--
-- Un usuario sin verificar que NO es dueño de una organización solo puede venir
-- de ese alta: el registro público siempre crea una organización propia (y ese
-- correo sí debe confirmarse), y la invitación ya los marca verificados.
UPDATE "users" u
SET "email_verified_at" = u."created_at"
WHERE u."email_verified_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "organizations" o WHERE o."owner_id" = u."id");
