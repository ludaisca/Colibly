"use client";

import { useState, useCallback, useEffect } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Select } from "@/app/components/ui/select";
import { Banner } from "@/app/components/ui/banner";
import { SecretField } from "@/app/components/integrations/secret-field";

interface WaAccountOption {
  id: string;
  name: string;
}

export interface MetaAdsAccountDetail {
  id: string;
  name: string;
  pageId: string;
  mode: "TEST" | "LIVE";
  testEventCode: string | null;
  datasetId: string | null;
  waAccountId: string | null;
  hasCapiAccessToken: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialData?: MetaAdsAccountDetail | null;
}

const WEBHOOK_PATH = "/api/meta/webhook/leadgen";

export function MetaAdsAccountFormModal({ open, onClose, onSaved, initialData }: Props) {
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [pageId, setPageId] = useState(initialData?.pageId ?? "");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [datasetId, setDatasetId] = useState(initialData?.datasetId ?? "");
  const [capiAccessToken, setCapiAccessToken] = useState("");
  const [clearCapiToken, setClearCapiToken] = useState(false);
  const [waAccountId, setWaAccountId] = useState(initialData?.waAccountId ?? "");
  const [mode, setMode] = useState<"TEST" | "LIVE">(initialData?.mode ?? "TEST");
  const [testEventCode, setTestEventCode] = useState(initialData?.testEventCode ?? "");
  const [waAccounts, setWaAccounts] = useState<WaAccountOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [verifyToken, setVerifyToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/whatsapp/accounts")
      .then((res) => res.json())
      .then((data) => setWaAccounts(Array.isArray(data) ? data : []))
      .catch(() => setWaAccounts([]));
  }, [open]);

  const resetForm = useCallback(() => {
    setName(initialData?.name ?? "");
    setPageId(initialData?.pageId ?? "");
    setPageAccessToken("");
    setAppSecret("");
    setDatasetId(initialData?.datasetId ?? "");
    setCapiAccessToken("");
    setClearCapiToken(false);
    setWaAccountId(initialData?.waAccountId ?? "");
    setMode(initialData?.mode ?? "TEST");
    setTestEventCode(initialData?.testEventCode ?? "");
    setErrors({});
    setApiError("");
    setVerifyToken(null);
  }, [initialData]);

  function getWebhookUrl() {
    return typeof window !== "undefined" ? `${window.location.origin}${WEBHOOK_PATH}` : WEBHOOK_PATH;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");

    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "El nombre es requerido";
    if (!isEdit) {
      if (!pageId.trim()) newErrors.pageId = "El Page ID es requerido";
      else if (!/^\d+$/.test(pageId.trim())) newErrors.pageId = "Debe ser un ID numérico";
      if (!pageAccessToken.trim()) newErrors.pageAccessToken = "El token de la página es requerido";
      if (!appSecret.trim()) newErrors.appSecret = "El App Secret es requerido";
    }
    if (mode === "LIVE" && !datasetId.trim()) {
      newErrors.datasetId = "Configura el Dataset ID antes de pasar a modo LIVE";
    }
    if (mode === "LIVE" && (clearCapiToken || (!capiAccessToken.trim() && !initialData?.hasCapiAccessToken))) {
      newErrors.capiAccessToken = "Configura el token de Conversions API antes de pasar a modo LIVE";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      const url = isEdit ? `/api/meta/accounts/${initialData!.id}` : "/api/meta/accounts";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(!isEdit ? { pageId: pageId.trim(), pageAccessToken: pageAccessToken.trim() } : {}),
          ...(isEdit && pageAccessToken.trim() ? { pageAccessToken: pageAccessToken.trim() } : {}),
          appSecret: appSecret.trim() || undefined,
          datasetId: datasetId.trim(),
          capiAccessToken: clearCapiToken ? "" : capiAccessToken.trim() || undefined,
          waAccountId: waAccountId || null,
          ...(isEdit ? { mode, testEventCode: testEventCode.trim() } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar la cuenta");

      if (!isEdit) {
        // El verify token solo se muestra esta vez (se guarda hasheado) —
        // mismo patrón que CuentaFormModal para WhatsApp.
        setVerifyToken(data.verifyToken);
      }
      onSaved();
      if (isEdit) handleClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al guardar la cuenta");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  if (verifyToken) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Cuenta de Meta Ads conectada"
        description="Copia estos valores en la configuración del webhook leadgen de tu Página en Meta for Developers. El verify token no se puede volver a mostrar."
        size="md"
        footer={<Button onClick={handleClose}>Listo</Button>}
      >
        <div className="space-y-4">
          <SecretField label="URL del webhook" value={getWebhookUrl()} />
          <SecretField label="Verify token" value={verifyToken} />

          <div className="flex items-start gap-3 p-3 rounded-lg bg-info-bg border border-info-border">
            <Info size={18} className="text-info shrink-0 mt-0.5" />
            <p className="text-sm text-muted-darker">
              Suscribe el campo <strong>leadgen</strong> en el webhook de tu Página, y confirma que la Página esté suscrita a tu App
              (<code>POST /{"{page-id}"}/subscribed_apps</code>). La cuenta nace en modo <strong>TEST</strong> — pásala a LIVE desde
              &quot;Detalles&quot; solo después de validar el payload con <code>test_event_code</code> en Events Manager.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? "Editar cuenta de Meta Ads" : "Conectar cuenta de Meta Ads"}
      description="Config de la Página/Business para el feedback loop de calificación de leads."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button type="submit" form="meta-ads-form" loading={saving}>
            {isEdit ? "Guardar cambios" : "Conectar cuenta"}
          </Button>
        </>
      }
    >
      <form id="meta-ads-form" onSubmit={handleSubmit} className="space-y-5">
        {apiError && <Banner tone="danger">{apiError}</Banner>}

        <FormField label="Nombre" required error={errors.name} hint="Un nombre descriptivo para identificar esta Página/Business">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Página principal" error={errors.name} />}
        </FormField>

        {!isEdit && (
          <>
            <FormField label="Page ID" required error={errors.pageId} hint="El ID de la Página de Facebook que recibe leadgen">
              {(id) => <Input id={id} value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="123456789012345" error={errors.pageId} />}
            </FormField>

            <FormField label="Token de la Página" required error={errors.pageAccessToken} hint="Page access token con permiso leads_retrieval">
              {(id) => <Textarea id={id} value={pageAccessToken} onChange={(e) => setPageAccessToken(e.target.value)} placeholder="EAA..." rows={3} error={errors.pageAccessToken} />}
            </FormField>
          </>
        )}

        {isEdit && (
          <FormField label="Token de la Página" hint="Déjalo vacío para no cambiarlo">
            {(id) => <Textarea id={id} value={pageAccessToken} onChange={(e) => setPageAccessToken(e.target.value)} placeholder="EAA..." rows={2} />}
          </FormField>
        )}

        <FormField
          label="App Secret"
          required={!isEdit}
          error={errors.appSecret}
          hint={isEdit
            ? "Déjalo vacío para no cambiarlo. Sin App Secret ningún leadgen se puede ingerir (la firma nunca valida)."
            : "Secreto de la app de Business — sin esto, ningún leadgen se puede ingerir (la firma nunca valida)"}
        >
          {(id) => <Input id={id} type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="abc123..." error={errors.appSecret} />}
        </FormField>

        <FormField label="Número de WhatsApp de seguimiento" hint="Bajo qué WAAccount se crean los contactos de Instant Forms de esta página, antes de que exista conversación">
          {(id) => (
            <Select id={id} value={waAccountId} onChange={(e) => setWaAccountId(e.target.value)} placeholder="Sin vincular">
              <option value="">Sin vincular</option>
              {waAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Dataset ID (Conversions API)" error={errors.datasetId} hint="Requerido antes de pasar la cuenta a modo LIVE">
          {(id) => <Input id={id} value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="123456789012345" error={errors.datasetId} />}
        </FormField>

        <FormField label="Access token de Conversions API" error={errors.capiAccessToken} hint={isEdit ? initialData?.hasCapiAccessToken ? "Configurado. Déjalo vacío para conservarlo." : "Sin configurar." : "Token con permiso sobre el dataset"}>
          {(id) => (
            <div className="space-y-2">
              <Textarea id={id} value={capiAccessToken} onChange={(e) => setCapiAccessToken(e.target.value)} placeholder={clearCapiToken ? "Se quitará al guardar" : "EAA..."} rows={2} disabled={clearCapiToken} error={errors.capiAccessToken} />
              {isEdit && initialData?.hasCapiAccessToken && (
                <Button type="button" size="sm" variant="secondary" onClick={() => { setClearCapiToken((v) => !v); setCapiAccessToken(""); }}>
                  {clearCapiToken ? "Deshacer" : "Quitar token"}
                </Button>
              )}
            </div>
          )}
        </FormField>

        {isEdit && (
          <>
            <FormField label="Modo" hint="TEST solo manda eventos visibles en Test Events de Events Manager, sin afectar la optimización real">
              {(id) => (
                <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as "TEST" | "LIVE")}>
                  <option value="TEST">Prueba (TEST)</option>
                  <option value="LIVE">Producción (LIVE)</option>
                </Select>
              )}
            </FormField>

            {mode === "TEST" && (
              <FormField label="Test Event Code" hint="Copiado de la pestaña Test Events en Events Manager">
                {(id) => <Input id={id} value={testEventCode} onChange={(e) => setTestEventCode(e.target.value)} placeholder="TEST12345" />}
              </FormField>
            )}
          </>
        )}

        <div className="flex items-start gap-3 p-3 rounded-lg bg-info-bg border border-info-border">
          <Info size={18} className="text-info shrink-0 mt-0.5" />
          <p className="text-sm text-muted-darker">
            {isEdit
              ? "El Page ID no se puede editar una vez conectada la cuenta."
              : "El verify token para el webhook se genera automáticamente — lo verás al conectar la cuenta."}
          </p>
        </div>
      </form>
    </Modal>
  );
}
