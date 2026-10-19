"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { Card } from "@/app/components/ui/card";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { useToast } from "@/app/components/ui/toast";

interface ConfigResponse {
  hasOpencodeApiKey: boolean;
  hasGoogleApiKey: boolean;
  hasStripeSecretKey: boolean;
  hasStripeWebhookSecret: boolean;
  stripePriceBasic: string | null;
  stripePricePro: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasSmtpPass: boolean;
  emailFrom: string | null;
  turnstileSiteKey: string | null;
  hasTurnstileSecretKey: boolean;
  metaAppId: string | null;
  hasMetaAppSecret: boolean;
  metaEmbeddedSignupConfigId: string | null;
  hasMetaWebhookVerifyToken: boolean;
  metaPixelId: string | null;
  hasMetaCapiAccessToken: boolean;
  gaMeasurementId: string | null;
  googleAdsId: string | null;
  googleAdsSignupLabel: string | null;
}

const SECRET_FIELDS = ["opencodeApiKey", "googleApiKey", "stripeSecretKey", "stripeWebhookSecret", "smtpPass", "turnstileSecretKey", "metaCapiAccessToken", "metaAppSecret", "metaWebhookVerifyToken"] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

// Campo cifrado: nunca se prefila con el valor real. Vacío + no "Quitar" = no
// se toca; "Quitar" fuerza a null; escribir algo lo reemplaza.
export function SecretField({
  label,
  hint,
  hasValue,
  value,
  onChange,
  cleared,
  onToggleClear,
}: {
  label: string;
  hint?: string;
  hasValue: boolean;
  value: string;
  onChange: (v: string) => void;
  cleared: boolean;
  onToggleClear: () => void;
}) {
  return (
    <FormField
      label={label}
      hint={hint}
      className="gap-1.5"
    >
      {(id) => (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={cleared ? "Se quitará al guardar" : hasValue ? "•••••••• (configurado)" : "Sin configurar"}
            disabled={cleared}
            className="flex-1"
          />
          {hasValue && (
            <Button type="button" variant={cleared ? "secondary" : "ghost"} size="sm" onClick={onToggleClear}>
              {cleared ? "Deshacer" : "Quitar"}
            </Button>
          )}
        </div>
      )}
    </FormField>
  );
}

export function PlataformaConfiguracion() {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [secrets, setSecrets] = useState<Record<SecretField, string>>(
    Object.fromEntries(SECRET_FIELDS.map((f) => [f, ""])) as Record<SecretField, string>
  );
  const [cleared, setCleared] = useState<Record<SecretField, boolean>>(
    Object.fromEntries(SECRET_FIELDS.map((f) => [f, false])) as Record<SecretField, boolean>
  );
  const [plain, setPlain] = useState({
    stripePriceBasic: "",
    stripePricePro: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    emailFrom: "",
    turnstileSiteKey: "",
    metaAppId: "",
    metaEmbeddedSignupConfigId: "",
    metaPixelId: "",
    gaMeasurementId: "",
    googleAdsId: "",
    googleAdsSignupLabel: "",
  });

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/plataforma/configuracion");
      if (!res.ok) throw new Error();
      const json: ConfigResponse = await res.json();
      setData(json);
      setPlain({
        stripePriceBasic: json.stripePriceBasic ?? "",
        stripePricePro: json.stripePricePro ?? "",
        smtpHost: json.smtpHost ?? "",
        smtpPort: String(json.smtpPort),
        smtpSecure: json.smtpSecure,
        smtpUser: json.smtpUser ?? "",
        emailFrom: json.emailFrom ?? "",
        turnstileSiteKey: json.turnstileSiteKey ?? "",
        metaAppId: json.metaAppId ?? "",
        metaEmbeddedSignupConfigId: json.metaEmbeddedSignupConfigId ?? "",
        metaPixelId: json.metaPixelId ?? "",
        gaMeasurementId: json.gaMeasurementId ?? "",
        googleAdsId: json.googleAdsId ?? "",
        googleAdsSignupLabel: json.googleAdsSignupLabel ?? "",
      });
      setSecrets(Object.fromEntries(SECRET_FIELDS.map((f) => [f, ""])) as Record<SecretField, string>);
      setCleared(Object.fromEntries(SECRET_FIELDS.map((f) => [f, false])) as Record<SecretField, boolean>);
    } catch {
      setLoadError("No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, []);

  function toggleClear(field: SecretField) {
    setCleared((c) => ({ ...c, [field]: !c[field] }));
    setSecrets((s) => ({ ...s, [field]: "" }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of SECRET_FIELDS) {
        if (cleared[f]) payload[f] = null;
        else if (secrets[f].trim()) payload[f] = secrets[f].trim();
      }
      payload.stripePriceBasic = plain.stripePriceBasic.trim() || null;
      payload.stripePricePro = plain.stripePricePro.trim() || null;
      payload.smtpHost = plain.smtpHost.trim() || null;
      payload.smtpPort = plain.smtpPort.trim() ? Number.parseInt(plain.smtpPort, 10) : null;
      payload.smtpSecure = plain.smtpSecure;
      payload.smtpUser = plain.smtpUser.trim() || null;
      payload.emailFrom = plain.emailFrom.trim() || null;
      payload.turnstileSiteKey = plain.turnstileSiteKey.trim() || null;
      payload.metaAppId = plain.metaAppId.trim() || null;
      payload.metaEmbeddedSignupConfigId = plain.metaEmbeddedSignupConfigId.trim() || null;
      payload.metaPixelId = plain.metaPixelId.trim() || null;
      payload.gaMeasurementId = plain.gaMeasurementId.trim() || null;
      payload.googleAdsId = plain.googleAdsId.trim() || null;
      payload.googleAdsSignupLabel = plain.googleAdsSignupLabel.trim() || null;

      const res = await fetch("/api/plataforma/configuracion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Error al guardar");
      success("Configuración guardada");
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-sm text-muted-darker">
        <Spinner /> Cargando configuración…
      </div>
    );
  }
  if (loadError || !data) {
    return <ListErrorState message={loadError ?? "No se pudo cargar la configuración."} onRetry={load} />;
  }

  return (
    <div className="max-w-3xl space-y-10">
      <Banner tone="info">
        Estas credenciales sirven a todas las organizaciones de la plataforma. Un campo cifrado nunca se muestra en texto plano — escribe un valor nuevo
        para reemplazarlo, o usa &ldquo;Quitar&rdquo; para borrarlo.
      </Banner>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Inteligencia artificial" title="OpenCode Go y Google" />
        <SecretField
          label="API key de OpenCode Go"
          hasValue={data.hasOpencodeApiKey}
          value={secrets.opencodeApiKey}
          onChange={(v) => setSecrets((s) => ({ ...s, opencodeApiKey: v }))}
          cleared={cleared.opencodeApiKey}
          onToggleClear={() => toggleClear("opencodeApiKey")}
        />
        <SecretField
          label="API key de Google (Gemini)"
          hint="También se usa para los embeddings de RAG de los bots en OpenCode."
          hasValue={data.hasGoogleApiKey}
          value={secrets.googleApiKey}
          onChange={(v) => setSecrets((s) => ({ ...s, googleApiKey: v }))}
          cleared={cleared.googleApiKey}
          onToggleClear={() => toggleClear("googleApiKey")}
        />
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Facturación" title="Stripe" />
        <SecretField
          label="Secret key"
          hasValue={data.hasStripeSecretKey}
          value={secrets.stripeSecretKey}
          onChange={(v) => setSecrets((s) => ({ ...s, stripeSecretKey: v }))}
          cleared={cleared.stripeSecretKey}
          onToggleClear={() => toggleClear("stripeSecretKey")}
        />
        <SecretField
          label="Webhook secret"
          hasValue={data.hasStripeWebhookSecret}
          value={secrets.stripeWebhookSecret}
          onChange={(v) => setSecrets((s) => ({ ...s, stripeWebhookSecret: v }))}
          cleared={cleared.stripeWebhookSecret}
          onToggleClear={() => toggleClear("stripeWebhookSecret")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Price id Básico (MXN por ejecutivo/mes)" hint="Precio recurrente mensual en MXN, por unidad: la cantidad de la suscripción = ejecutivos.">
            {(id) => <Input id={id} value={plain.stripePriceBasic} onChange={(e) => setPlain((p) => ({ ...p, stripePriceBasic: e.target.value }))} placeholder="price_..." />}
          </FormField>
          <FormField label="Price id Pro (MXN por ejecutivo/mes)" hint="Precio recurrente mensual en MXN, por unidad.">
            {(id) => <Input id={id} value={plain.stripePricePro} onChange={(e) => setPlain((p) => ({ ...p, stripePricePro: e.target.value }))} placeholder="price_..." />}
          </FormField>
        </div>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Correo" title="SMTP" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Host">
            {(id) => <Input id={id} value={plain.smtpHost} onChange={(e) => setPlain((p) => ({ ...p, smtpHost: e.target.value }))} placeholder="smtp.ejemplo.com" />}
          </FormField>
          <FormField label="Puerto">
            {(id) => <Input id={id} type="number" value={plain.smtpPort} onChange={(e) => setPlain((p) => ({ ...p, smtpPort: e.target.value }))} />}
          </FormField>
          <FormField label="Usuario">
            {(id) => <Input id={id} value={plain.smtpUser} onChange={(e) => setPlain((p) => ({ ...p, smtpUser: e.target.value }))} />}
          </FormField>
          <SecretField
            label="Contraseña"
            hasValue={data.hasSmtpPass}
            value={secrets.smtpPass}
            onChange={(v) => setSecrets((s) => ({ ...s, smtpPass: v }))}
            cleared={cleared.smtpPass}
            onToggleClear={() => toggleClear("smtpPass")}
          />
          <FormField label="Remitente (From)">
            {(id) => <Input id={id} value={plain.emailFrom} onChange={(e) => setPlain((p) => ({ ...p, emailFrom: e.target.value }))} placeholder="Colibly <no-reply@colibly.com>" />}
          </FormField>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={plain.smtpSecure} onCheckedChange={(v) => setPlain((p) => ({ ...p, smtpSecure: v }))} label="Conexión segura (TLS)" />
          Conexión segura (TLS)
        </label>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Captcha" title="Cloudflare Turnstile" />
        <FormField label="Site key" hint="Pública — se envía al navegador en /register.">
          {(id) => <Input id={id} value={plain.turnstileSiteKey} onChange={(e) => setPlain((p) => ({ ...p, turnstileSiteKey: e.target.value }))} />}
        </FormField>
        <SecretField
          label="Secret key"
          hasValue={data.hasTurnstileSecretKey}
          value={secrets.turnstileSecretKey}
          onChange={(v) => setSecrets((s) => ({ ...s, turnstileSecretKey: v }))}
          cleared={cleared.turnstileSecretKey}
          onToggleClear={() => toggleClear("turnstileSecretKey")}
        />
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="WhatsApp" title="App de Meta de la plataforma (Embedded Signup)" />
        <Banner tone="info">
          Datos de la app de Meta de Colibly. Con ellos los clientes conectan su WhatsApp con un botón, sin copiar tokens. El App Secret
          firma los webhooks de esas cuentas; nunca se vuelve a mostrar.
        </Banner>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="App ID" hint="Panel de Meta → Configuración de la app → Básica.">
            {(id) => <Input id={id} value={plain.metaAppId} inputMode="numeric" onChange={(e) => setPlain((p) => ({ ...p, metaAppId: e.target.value }))} />}
          </FormField>
          <FormField label="ID de configuración de Embedded Signup" hint="Inicio de sesión para empresas → Configuraciones.">
            {(id) => <Input id={id} value={plain.metaEmbeddedSignupConfigId} inputMode="numeric" onChange={(e) => setPlain((p) => ({ ...p, metaEmbeddedSignupConfigId: e.target.value }))} />}
          </FormField>
        </div>
        <SecretField
          label="App Secret"
          hasValue={data.hasMetaAppSecret}
          value={secrets.metaAppSecret}
          onChange={(v) => setSecrets((s) => ({ ...s, metaAppSecret: v }))}
          cleared={cleared.metaAppSecret}
          onToggleClear={() => toggleClear("metaAppSecret")}
        />
        <SecretField
          label="Token de verificación del webhook"
          hasValue={data.hasMetaWebhookVerifyToken}
          value={secrets.metaWebhookVerifyToken}
          onChange={(v) => setSecrets((s) => ({ ...s, metaWebhookVerifyToken: v }))}
          cleared={cleared.metaWebhookVerifyToken}
          onToggleClear={() => toggleClear("metaWebhookVerifyToken")}
        />
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Medición" title="Meta Pixel, Google Analytics y Ads" />
        <FormField label="Meta Pixel ID">
          {(id) => <Input id={id} value={plain.metaPixelId} onChange={(e) => setPlain((p) => ({ ...p, metaPixelId: e.target.value }))} />}
        </FormField>
        <SecretField
          label="Meta Conversions API access token"
          hasValue={data.hasMetaCapiAccessToken}
          value={secrets.metaCapiAccessToken}
          onChange={(v) => setSecrets((s) => ({ ...s, metaCapiAccessToken: v }))}
          cleared={cleared.metaCapiAccessToken}
          onToggleClear={() => toggleClear("metaCapiAccessToken")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="GA4 Measurement ID">
            {(id) => <Input id={id} value={plain.gaMeasurementId} onChange={(e) => setPlain((p) => ({ ...p, gaMeasurementId: e.target.value }))} placeholder="G-XXXXXXXXXX" />}
          </FormField>
          <FormField label="Google Ads ID">
            {(id) => <Input id={id} value={plain.googleAdsId} onChange={(e) => setPlain((p) => ({ ...p, googleAdsId: e.target.value }))} placeholder="AW-XXXXXXXXX" />}
          </FormField>
        </div>
        <FormField label="Google Ads: etiqueta de conversión de registro">
          {(id) => <Input id={id} value={plain.googleAdsSignupLabel} onChange={(e) => setPlain((p) => ({ ...p, googleAdsSignupLabel: e.target.value }))} />}
        </FormField>
      </Card>

      <div className="flex justify-end border-t border-border pt-6">
        <Button onClick={handleSave} loading={saving}>
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}
