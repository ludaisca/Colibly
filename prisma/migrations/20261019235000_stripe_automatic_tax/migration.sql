-- Stripe Tax (automatic_tax en Checkout), apagado por defecto.
ALTER TABLE "platform_settings" ADD COLUMN "stripe_automatic_tax" BOOLEAN NOT NULL DEFAULT false;
