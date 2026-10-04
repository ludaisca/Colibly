-- Normaliza los emails de usuario a minúsculas y sin espacios (auditoría
-- 2026-09-16, A2): lib/auth.ts busca al usuario con el email en minúsculas,
-- así que cualquier email guardado con mayúsculas dejaba a esa persona sin
-- poder iniciar sesión. Desde ese cambio las altas ya normalizan; esto
-- corrige los registros previos.
--
-- Solo se actualizan filas cuyo email normalizado NO coincide con el de otro
-- usuario: si "Luis@x.com" y "luis@x.com" coexisten, ambos se dejan intactos
-- (fusionarlos requiere decidir cuál conservar) — revisarlos a mano con:
--   SELECT lower(trim(email)), array_agg(email) FROM users
--   GROUP BY 1 HAVING count(*) > 1;
UPDATE "users" AS u
SET "email" = lower(trim(u."email"))
WHERE u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS o
    WHERE o."id" <> u."id"
      AND lower(trim(o."email")) = lower(trim(u."email"))
  );
