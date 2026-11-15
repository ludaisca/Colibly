"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Info } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";

// Modal de alta compartido por Messenger e Instagram — mismos campos
// (Page ID + Page Access Token + App Secret), con Instagram Business ID
// extra solo para Instagram. Mismo patrón de 2 pasos que
// whatsapp/cuentas/_form.tsx: paso 1 el formulario, paso 2 (tras crear) una
// pantalla de solo-lectura con la URL del webhook y el verify token — esta
// es la ÚNICA vez que el verify token se ve en claro (se guarda hasheado).

interface Props {
  channel: "MESSENGER" | "INSTAGRAM";
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const WEBHOOK_PATH = "/api/meta/webhook/messaging";

const CHANNEL_COPY = {
  MESSENGER: {
    title: "Conectar Página de Messenger",
    description: "Conecta una Página de Facebook para recibir y responder mensajes de Messenger.",
    successTitle: "Página conectada",
    namePlaceholder: "Ej: Ventas Messenger",
    setupHint: "Obtén estos valores en Meta for Developers → tu App → Messenger → Configuración de la API.",
  },
  INSTAGRAM: {
    title: "Conectar cuenta de Instagram",
    description: "Conecta una cuenta profesional de Instagram vinculada a una Página de Facebook.",
    successTitle: "Cuenta conectada",
    namePlaceholder: "Ej: Ventas Instagram",
    setupHint: "Requiere el modelo clásico: Instagram vinculado a una Página de Facebook (no Instagram Login independiente). Obtén estos valores en Meta for Developers → tu App → Instagram → Configuración de la API.",
  },
} as const;

export function MetaChannelAccountFormModal({ channel, open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [instagramBusinessId, setInstagramBusinessId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<"webhook" | "token" | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setPageId("");
    setPageAccessToken("");
    setAppSecret("");
    setInstagramBusinessId("");
    setErrors({});
    setApiError("");
    setVerifyToken(null);
    setCopied(null);
  }, []);

  function getWebhookUrl() {
    return typeof window !== "undefined" ? `${window.location.origin}${WEBHOOK_PATH}` : WEBHOOK_PATH;
  }

  async function handleCopy(text: string, which: "webhook" | "token") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");

    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "El nombre es requerido";
    if (!pageId.trim()) newErrors.pageId = "El Page ID es requerido";
    else if (!/^\d+$/.test(pageId.trim())) newErrors.pageId = "Debe ser un ID numérico";
    if (!pageAccessToken.trim()) newErrors.pageAccessToken = "El token de la página es requerido";
    if (!appSecret.trim()) newErrors.appSecret = "El App Secret es requerido";
    if (channel === "INSTAGRAM") {
      if (!instagramBusinessId.trim()) newErrors.instagramBusinessId = "El Instagram Business ID es requerido";
      else if (!/^\d+$/.test(instagramBusinessId.trim())) newErrors.instagramBusinessId = "Debe ser un ID numérico";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      const endpoint = channel === "MESSENGER" ? "/api/messenger/accounts" : "/api/instagram/accounts";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          pageId: pageId.trim(),
          pageAccessToken: pageAccessToken.trim(),
          appSecret: appSecret.trim(),
          ...(channel === "INSTAGRAM" ? { instagramBusinessId: instagramBusinessId.trim() } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al conectar la cuenta");

      // El verify token solo se devuelve esta vez (de aquí en más se guarda
      // hasheado) — se mantiene el modal abierto en un paso de éxito para
      // que el usuario pueda copiarlo antes de cerrar.
      setVerifyToken(data.verifyToken);
      onCreated();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al conectar la cuenta");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const copy = CHANNEL_COPY[channel];

  if (verifyToken) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title={copy.successTitle}
        description="Copia estos valores en la configuración de Webhooks de tu App de Meta. El verify token no se puede volver a mostrar."
        size="md"
        footer={<Button onClick={handleClose}>Listo</Button>}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-darker mb-1.5">URL del webhook</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface px-3 py-2 rounded-lg text-xs font-mono break-all">
                {getWebhookUrl()}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={copied === "webhook" ? Check : Copy}
                onClick={() => handleCopy(getWebhookUrl(), "webhook")}
              >
                {copied === "webhook" ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-darker mb-1.5">Verify token</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface px-3 py-2 rounded-lg text-xs font-mono break-all">
                {verifyToken}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={copied === "token" ? Check : Copy}
                onClick={() => handleCopy(verifyToken, "token")}
              >
                {copied === "token" ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-info-bg border border-info-border">
            <Info size={18} className="text-info shrink-0 mt-0.5" />
            <p className="text-sm text-muted-darker">
              En el Dashboard de tu App de Meta, sección <strong>Webhooks</strong>, suscríbete al producto <strong>{channel === "MESSENGER" ? "Messenger" : "Instagram"}</strong> con esta URL y este verify token, y activa el campo <strong>messages</strong>. Si ya conectaste otra cuenta bajo la misma App, este paso no se repite — el webhook es compartido entre todas las Páginas de esa App.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal layout="drawer"
      open={open}
      onClose={handleClose}
      title={copy.title}
      description={copy.description}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner /> : "Conectar cuenta"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {apiError && <Banner tone="danger">{apiError}</Banner>}

        <FormField label="Nombre de la cuenta" required error={errors.name} hint="Un nombre descriptivo para identificar esta cuenta">
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} error={errors.name} />
          )}
        </FormField>

        <FormField label="Page ID" required error={errors.pageId} hint="El ID de la Página de Facebook vinculada">
          {(id) => (
            <Input id={id} value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="123456789012345" error={errors.pageId} />
          )}
        </FormField>

        {channel === "INSTAGRAM" && (
          <FormField label="Instagram Business ID" required error={errors.instagramBusinessId} hint="El ID de la cuenta profesional de Instagram — distinto del Page ID">
            {(id) => (
              <Input id={id} value={instagramBusinessId} onChange={(e) => setInstagramBusinessId(e.target.value)} placeholder="17841400000000000" error={errors.instagramBusinessId} />
            )}
          </FormField>
        )}

        <FormField
          label="Token de acceso de la Página"
          required
          error={errors.pageAccessToken}
          hint={channel === "MESSENGER"
            ? "Page Access Token generado en Meta for Developers, con permiso pages_messaging"
            : "Page Access Token generado en Meta for Developers, con permisos pages_messaging e instagram_manage_messages"}
        >
          {(id) => (
            <Textarea id={id} value={pageAccessToken} onChange={(e) => setPageAccessToken(e.target.value)} placeholder="EAA…" rows={3} />
          )}
        </FormField>

        <FormField label="App Secret" required error={errors.appSecret} hint="Secreto de la App de Meta, para validar la firma de los webhooks entrantes">
          {(id) => (
            <Input id={id} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="abc123…" />
          )}
        </FormField>

        <div className="flex items-start gap-3 p-3 rounded-lg bg-info-bg border border-info-border">
          <Info size={18} className="text-info shrink-0 mt-0.5" />
          <p className="text-sm text-muted-darker">{copy.setupHint}</p>
        </div>
      </form>
    </Modal>
  );
}
