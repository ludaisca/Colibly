-- Tres planes (2026-10-19): Básico pasa a llamarse Negocio (mismo id en las
-- filas existentes, solo cambia el valor del enum) y se agrega Esencial.
ALTER TYPE "PlanId" RENAME VALUE 'BASIC' TO 'BUSINESS';
ALTER TYPE "PlanId" ADD VALUE IF NOT EXISTS 'ESSENTIAL' BEFORE 'BUSINESS';

-- Precio de Stripe del plan Esencial (los de Negocio y Pro ya existían).
ALTER TABLE "platform_settings" ADD COLUMN "stripe_price_essential" TEXT;
