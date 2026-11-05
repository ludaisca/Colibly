-- Licencias por usuario, Fase 5 (docs/PLAN_LICENCIAS_2026-11-04.md, decisión 4):
-- las organizaciones que ya existen al desplegar conservan el catálogo
-- anterior 60 días (gates y créditos a nivel organización). Salen antes al
-- contratar o actualizar licencias (syncSubscription / applyLicenseChange
-- apagan legacy_until). Las internas no lo necesitan: no tienen topes.
UPDATE "organizations"
SET "legacy_until" = NOW() + INTERVAL '60 days'
WHERE "is_internal" = false
  AND "status" <> 'CANCELED'
  AND "legacy_until" IS NULL;
