-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "opencode_api_key" TEXT,
    "google_api_key" TEXT,
    "stripe_secret_key" TEXT,
    "stripe_webhook_secret" TEXT,
    "stripe_price_basic" TEXT,
    "stripe_price_pro" TEXT,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" TEXT,
    "smtp_pass" TEXT,
    "email_from" TEXT,
    "turnstile_site_key" TEXT,
    "turnstile_secret_key" TEXT,
    "meta_pixel_id" TEXT,
    "meta_capi_access_token" TEXT,
    "ga_measurement_id" TEXT,
    "google_ads_id" TEXT,
    "google_ads_signup_label" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_email" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

