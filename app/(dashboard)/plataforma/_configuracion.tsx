"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Bell, CreditCard, Mail, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/billing/plans";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { PageContainer } from "@/app/components/ui/page-container";
import { useToast } from "@/app/components/ui/toast";
import type { PlatformSecretField } from "@/lib/platform-settings";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";

interface ConfigResponse {
  hasOpencodeApiKey: boolean;
  hasGoogleApiKey: boolean;
  aiProvider: "opencode" | "google" | null;
  aiTextModel: string | null;
  aiVisionModel: string | null;
  hasStripeSecretKey: boolean;
  hasStripeWebhookSecret: boolean;
  stripePriceEssential: string | null;
  stripePriceBusiness: string | null;
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
  stripeAutomaticTax: boolean;
}

const SECRET_FIELDS = ["opencodeApiKey", "googleApiKey", "stripeSecretKey", "stripeWebhookSecret", "smtpPass", "turnstileSecretKey", "metaCapiAccessToken", "metaAppSecret", "metaWebhookVerifyToken"] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

// Tiempo que un secreto revelado queda en pantalla antes de ocultarse solo.
const REVEAL_MS = 60_000;

// Campo cifrado: nunca se prefila con el valor real. Vacío + no "Quitar" = no
// se toca; "Quitar" fuerza a null; escribir algo lo reemplaza. Con
// `revealField`, "Mostrar" pide el valor guardado a
// /api/plataforma/configuracion/revelar (queda en el log del servidor) y lo
// muestra 60 s con "Copiar".
export function SecretField({
  label,
  hint,
  hasValue,
  value,
  onChange,
  cleared,
  onToggleClear,
  revealField,
}: {
  label: string;
  hint?: string;
  hasValue: boolean;
  value: string;
  onChange: (v: string) => void;
  cleared: boolean;
  onToggleClear: () => void;
  revealField?: PlatformSecretField;
}) {
  const { error: toastError, success } = useToast();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function hide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setRevealed(null);
  }
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);
  // Un secreto marcado para quitar o que ya no existe no se sigue mostrando.
  const shown = cleared || !hasValue ? null : revealed;

  async function reveal() {
    if (!revealField) return;
    setRevealing(true);
    try {
      const res = await fetch("/api/plataforma/configuracion/revelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: revealField }),
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.value !== "string") throw new Error(body.error || "No se pudo mostrar el secreto");
      setRevealed(body.value);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, REVEAL_MS);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo mostrar el secreto");
    } finally {
      setRevealing(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      success("Copiado");
    } catch {
      toastError("El navegador no permitió copiar; selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <FormField
      label={label}
      hint={hint}
      className="gap-1.5"
    >
      {(id) => (
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id={id}
              type="password"
              value={value}
              onChange={(e) => {
                // Al escribir un reemplazo, el valor viejo deja de mostrarse.
                hide();
                onChange(e.target.value);
              }}
              placeholder={cleared ? "Se quitará al guardar" : hasValue ? "•••••••• (configurado)" : "Sin configurar"}
              disabled={cleared}
              className="min-w-0 flex-1"
            />
            {hasValue && revealField && !cleared && (
              <Button type="button" variant="ghost" size="sm" loading={revealing} onClick={shown !== null ? hide : reveal}>
                {shown !== null ? "Ocultar" : "Mostrar"}
              </Button>
            )}
            {hasValue && (
              <Button type="button" variant={cleared ? "secondary" : "ghost"} size="sm" onClick={onToggleClear}>
                {cleared ? "Deshacer" : "Quitar"}
              </Button>
            )}
          </div>
          {shown !== null && (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2">
              <code className="min-w-0 flex-1 select-all break-all text-xs text-foreground" aria-label={`${label} (valor guardado)`}>
                {shown}
              </code>
              <Button type="button" variant="secondary" size="sm" onClick={copy}>
                Copiar
              </Button>
            </div>
          )}
        </div>
      )}
    </FormField>
  );
}


type BlockStatus = { label: string; tone: "success" | "warning" | "neutral" };
// Configurado = todos los datos clave presentes; Pendiente = falta alguno.
// Los bloques opcionales (medición) sin datos se marcan "Opcional".
export function blockStatus(checks: boolean[], optional = false): BlockStatus {
  if (checks.every(Boolean)) return { label: "Configurado", tone: "success" };
  if (optional && !checks.some(Boolean)) return { label: "Opcional", tone: "neutral" };
  return { label: "Pendiente", tone: "warning" };
}

// Sección de la configuración: solo se ve la activa (la navegación está a la
// izquierda en pantallas anchas y arriba en móvil), pero todas siguen montadas
// con `hidden`, así guardar envía todos los campos como siempre.
function SettingsBlock({ id, active, eyebrow, title, status, children }: { id: string; active: boolean; eyebrow: string; title: string; status: BlockStatus; children: ReactNode }) {
  return (
    <section id={`cfg-${id}`} role="tabpanel" aria-labelledby={`cfg-tab-${id}`} hidden={!active} className="min-w-0 rounded-lg border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">{eyebrow}</p>
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        <Badge tone={status.tone} size="sm">{status.label}</Badge>
      </header>
      <div className="min-w-0 space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

// Llaves VAPID de las notificaciones push (lib/notifications/push.ts). No se
// escriben a mano: se generan; regenerarlas borra todas las suscripciones.
function PushKeysBlock({ active }: { active: boolean }) {
  const { success, error: toastError } = useToast();
  const [state, setState] = useState<{ hasKeys: boolean; publicKey: string | null; subscriptions: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/plataforma/push")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setState(data))
      .catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/plataforma/push", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudieron generar las llaves");
      setState(data);
      success("Llaves generadas: cada usuario activa los avisos desde su menú");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudieron generar las llaves");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <SettingsBlock
      id="push"
      active={active}
      eyebrow="Navegador"
      title="Notificaciones push"
      status={state?.hasKeys ? { tone: "success", label: "Configurado" } : { tone: "neutral", label: "Opcional" }}
    >
      <p className="text-sm text-muted">
        Avisos del navegador para mensajes de chats asignados, chats asignados y llamadas entrantes, aunque la pestaña esté cerrada.
        Las llaves (VAPID) se generan aquí; la privada se guarda cifrada.
      </p>
      {state?.hasKeys && (
        <p className="break-all rounded-lg bg-surface-light p-2 font-mono text-xs text-muted-darker">
          Pública: {state.publicKey}
          <span className="mt-1 block font-sans">{state.subscriptions} navegadores suscritos</span>
        </p>
      )}
      <Button variant="secondary" size="sm" loading={busy} onClick={() => (state?.hasKeys ? setConfirming(true) : void generate())}>
        {state?.hasKeys ? "Regenerar llaves" : "Generar llaves"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={generate}
        title="¿Regenerar las llaves push?"
        description="Todos los navegadores suscritos dejan de recibir avisos y cada usuario tiene que volver a activarlos desde su menú."
        confirmLabel="Regenerar"
        tone="danger"
        loading={busy}
      />
    </SettingsBlock>
  );
}

const SECTIONS = [
  { id: "ia", label: "Inteligencia artificial", Icon: Sparkles },
  { id: "stripe", label: "Facturación", Icon: CreditCard },
  { id: "smtp", label: "Correo", Icon: Mail },
  { id: "turnstile", label: "Captcha", Icon: ShieldCheck },
  { id: "meta", label: "WhatsApp (Meta)", Icon: MessageCircle },
  { id: "medicion", label: "Medición", Icon: BarChart3 },
  { id: "push", label: "Notificaciones push", Icon: Bell },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function PlataformaConfiguracion() {
  const [section, setSection] = useState<SectionId>("ia");
  const [baseline, setBaseline] = useState("");
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
    stripePriceEssential: "",
    stripePriceBusiness: "",
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
    stripeAutomaticTax: false,
    aiProvider: "",
    aiTextModel: "",
    aiVisionModel: "",
  });
  const [opencodeModels, setOpencodeModels] = useState<{ id: string; label: string }[]>(
    AI_MODELS.filter((m) => m.provider === "opencode").map((m) => ({ id: m.id, label: m.label }))
  );
  const [modelsNote, setModelsNote] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/plataforma/configuracion");
      if (!res.ok) throw new Error();
      const json: ConfigResponse = await res.json();
      setData(json);
      const nextPlain = {
        stripePriceEssential: json.stripePriceEssential ?? "",
        stripePriceBusiness: json.stripePriceBusiness ?? "",
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
        stripeAutomaticTax: json.stripeAutomaticTax ?? false,
        aiProvider: json.aiProvider ?? "",
        aiTextModel: json.aiTextModel ?? "",
        aiVisionModel: json.aiVisionModel ?? "",
      };
      setPlain(nextPlain);
      setBaseline(JSON.stringify(nextPlain));
      if (json.hasOpencodeApiKey) {
        const modelsRes = await fetch("/api/plataforma/configuracion/modelos");
        if (modelsRes.ok) {
          const catalog: { models: { id: string; label: string }[]; source: string; error?: string } = await modelsRes.json();
          if (catalog.models?.length) setOpencodeModels(catalog.models);
          setModelsNote(
            catalog.source === "opencode"
              ? `La API key de OpenCode responde. Hay ${catalog.models.length} modelos.`
              : catalog.error ?? null
          );
        }
      } else {
        setModelsNote(null);
      }
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

  // Enlace directo a una sección: /plataforma?...#ia
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#(cfg-)?/, "");
    const match = SECTIONS.find((x) => x.id === fromHash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el hash al montar
    if (match) setSection(match.id);
  }, []);

  function selectSection(id: SectionId) {
    setSection(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      /* sin historial: la sección igual cambia */
    }
  }

  const dirty =
    !!baseline &&
    (JSON.stringify(plain) !== baseline ||
      SECRET_FIELDS.some((f) => secrets[f].trim() !== "" || cleared[f]));

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
      payload.stripePriceEssential = plain.stripePriceEssential.trim() || null;
      payload.stripePriceBusiness = plain.stripePriceBusiness.trim() || null;
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
      payload.stripeAutomaticTax = plain.stripeAutomaticTax;
      payload.aiProvider = plain.aiProvider || null;
      payload.aiTextModel = plain.aiTextModel.trim() || null;
      payload.aiVisionModel = plain.aiVisionModel.trim() || null;

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

  function modelOptions(current: string) {
    if (current && !opencodeModels.some((m) => m.id === current)) {
      // Un id guardado que el catálogo ya no ofrece se muestra marcado en vez
      // de desaparecer: así el operador ve que hay que cambiarlo (al guardar,
      // el servidor lo rechaza).
      return [{ id: current, label: `${current} (no está en el catálogo)` }, ...opencodeModels];
    }
    return opencodeModels;
  }

  if (loading) {
    return (
      <PageContainer width="6xl">
        <div className="flex items-center gap-3 py-12 text-sm text-muted-darker">
          <Spinner /> Cargando configuración…
        </div>
      </PageContainer>
    );
  }
  if (loadError || !data) {
    return (
      <PageContainer width="6xl">
        <ListErrorState message={loadError ?? "No se pudo cargar la configuración."} onRetry={load} />
      </PageContainer>
    );
  }

  const statuses: Partial<Record<SectionId, BlockStatus>> = {
    ia: blockStatus([data.hasOpencodeApiKey || data.hasGoogleApiKey]),
    stripe: blockStatus([data.hasStripeSecretKey, data.hasStripeWebhookSecret]),
    smtp: blockStatus([!!data.smtpHost, !!data.smtpUser, data.hasSmtpPass]),
    turnstile: blockStatus([!!data.turnstileSiteKey, data.hasTurnstileSecretKey]),
    meta: blockStatus([!!data.metaAppId, data.hasMetaAppSecret, !!data.metaEmbeddedSignupConfigId, data.hasMetaWebhookVerifyToken]),
    medicion: blockStatus([!!data.metaPixelId || !!data.gaMeasurementId || !!data.googleAdsId], true),
  };
  const dot: Record<BlockStatus["tone"], string> = { success: "bg-success", warning: "bg-warning", neutral: "bg-muted" };

  return (
    <PageContainer width="6xl">
      <Banner tone="info">
        Estas credenciales sirven a todas las organizaciones de la plataforma. Los campos cifrados llegan ocultos: &ldquo;Mostrar&rdquo; enseña el valor
        guardado durante 60 segundos (queda registrado en el log), escribe un valor nuevo para reemplazarlo o usa &ldquo;Quitar&rdquo; para borrarlo.
      </Banner>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Secciones de la configuración" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div role="tablist" aria-orientation="vertical" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {SECTIONS.map(({ id, label, Icon }) => {
              const st = statuses[id];
              const isActive = section === id;
              return (
                <button
                  key={id}
                  id={`cfg-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`cfg-${id}`}
                  onClick={() => selectSection(id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:w-full ${
                    isActive ? "border-accent-strong bg-accent-subtle font-medium text-foreground" : "border-transparent text-muted hover:bg-surface-light hover:text-foreground"
                  }`}
                >
                  <Icon aria-hidden="true" size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 whitespace-nowrap lg:whitespace-normal">{label}</span>
                  {st ? <span className={`size-2 shrink-0 rounded-full ${dot[st.tone]}`} title={st.label} aria-label={st.label} /> : null}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
      <SettingsBlock id="ia" active={section === "ia"} eyebrow="Inteligencia artificial" title="OpenCode Go y Google" status={blockStatus([data.hasOpencodeApiKey || data.hasGoogleApiKey])}>
        <SecretField
          label="API key de OpenCode Go"
          hasValue={data.hasOpencodeApiKey}
          value={secrets.opencodeApiKey}
          onChange={(v) => setSecrets((s) => ({ ...s, opencodeApiKey: v }))}
          cleared={cleared.opencodeApiKey}
          revealField="opencodeApiKey"
          onToggleClear={() => toggleClear("opencodeApiKey")}
        />
        <SecretField
          label="API key de Google (Gemini)"
          hint="También se usa para los embeddings de RAG de los bots en OpenCode."
          hasValue={data.hasGoogleApiKey}
          value={secrets.googleApiKey}
          onChange={(v) => setSecrets((s) => ({ ...s, googleApiKey: v }))}
          cleared={cleared.googleApiKey}
          revealField="googleApiKey"
          onToggleClear={() => toggleClear("googleApiKey")}
        />
        <FormField
          label="Proveedor que responde"
          hint="Quién atiende bots, calificación, recuperación, sugerencias y automatizaciones. Automático usa OpenCode si tiene llave y, si no, Google. Los embeddings de RAG siempre son de Google."
        >
          {(id) => (
            <Select id={id} value={plain.aiProvider} onChange={(e) => setPlain((p) => ({ ...p, aiProvider: e.target.value }))}>
              <option value="">Automático</option>
              <option value="opencode" disabled={!data.hasOpencodeApiKey}>OpenCode Go{data.hasOpencodeApiKey ? "" : " (sin API key)"}</option>
              <option value="google" disabled={!data.hasGoogleApiKey}>Google Gemini{data.hasGoogleApiKey ? "" : " (sin API key)"}</option>
            </Select>
          )}
        </FormField>
        {plain.aiProvider === "google" ? (
          <p className="text-sm text-muted-darker">Con Google, los bots usan {DEFAULT_AI_MODEL.google}; los modelos de abajo solo aplican a OpenCode.</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Modelo de texto" hint="Respuestas, calificación, recuperación y automatizaciones. Vacío usa GLM 5.3 Flash.">
            {(id) => (
              <Select id={id} value={plain.aiTextModel} onChange={(e) => setPlain((p) => ({ ...p, aiTextModel: e.target.value }))}>
                <option value="">Recomendado ({DEFAULT_AI_MODEL.opencode})</option>
                {modelOptions(plain.aiTextModel).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Modelo para imágenes" hint="Cuando el mensaje trae una foto. Vacío usa el de texto.">
            {(id) => (
              <Select id={id} value={plain.aiVisionModel} onChange={(e) => setPlain((p) => ({ ...p, aiVisionModel: e.target.value }))}>
                <option value="">El mismo que el de texto</option>
                {modelOptions(plain.aiVisionModel).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        {modelsNote && <p className="text-sm text-muted-darker">{modelsNote}</p>}
        <p className="text-sm text-muted-darker">Las notas de voz se transcriben con OpenCode (MiMo) y Gemini de respaldo; con Google elegido, Gemini va primero.</p>
          </SettingsBlock>

          <SettingsBlock id="stripe" active={section === "stripe"} eyebrow="Facturación" title="Stripe" status={blockStatus([data.hasStripeSecretKey, data.hasStripeWebhookSecret])}>
        <SecretField
          label="Secret key"
          hasValue={data.hasStripeSecretKey}
          value={secrets.stripeSecretKey}
          onChange={(v) => setSecrets((s) => ({ ...s, stripeSecretKey: v }))}
          cleared={cleared.stripeSecretKey}
          revealField="stripeSecretKey"
          onToggleClear={() => toggleClear("stripeSecretKey")}
        />
        <SecretField
          label="Webhook secret"
          hasValue={data.hasStripeWebhookSecret}
          value={secrets.stripeWebhookSecret}
          onChange={(v) => setSecrets((s) => ({ ...s, stripeWebhookSecret: v }))}
          cleared={cleared.stripeWebhookSecret}
          revealField="stripeWebhookSecret"
          onToggleClear={() => toggleClear("stripeWebhookSecret")}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Price id Básico ($59 MXN por usuario/mes)" hint="Precio recurrente mensual en MXN, por unidad: la cantidad de la suscripción = usuarios.">
            {(id) => <Input id={id} value={plain.stripePriceEssential} onChange={(e) => setPlain((p) => ({ ...p, stripePriceEssential: e.target.value }))} placeholder="price_..." />}
          </FormField>
          <FormField label="Price id Avanzado ($89 MXN por usuario/mes)" hint="Precio recurrente mensual en MXN, por unidad.">
            {(id) => <Input id={id} value={plain.stripePriceBusiness} onChange={(e) => setPlain((p) => ({ ...p, stripePriceBusiness: e.target.value }))} placeholder="price_..." />}
          </FormField>
          <FormField label="Price id Pro ($149 MXN por usuario/mes)" hint="Precio recurrente mensual en MXN, por unidad.">
            {(id) => <Input id={id} value={plain.stripePricePro} onChange={(e) => setPlain((p) => ({ ...p, stripePricePro: e.target.value }))} placeholder="price_..." />}
          </FormField>
        </div>
        <p className="text-sm text-muted-darker">
          Estos price ids son los que usa el checkout. Si dejas uno vacío, se busca en Stripe por su lookup key (<code>colibly_esencial_monthly</code>, <code>colibly_negocio_monthly</code>,{" "}
          <code>colibly_pro_monthly</code>). El checkout se bloquea si el monto, la moneda o el intervalo no coinciden con la oferta (59/89/149 MXN mensuales por usuario).
        </p>
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={plain.stripeAutomaticTax} onCheckedChange={(v) => setPlain((p) => ({ ...p, stripeAutomaticTax: v }))} label="Calcular impuestos con Stripe Tax" />
          <span>
            Calcular impuestos con Stripe Tax en el pago (<code>automatic_tax</code>).{" "}
            <span className="text-muted-darker">Déjalo apagado hasta definir el IVA con el contador y registrar el impuesto en Stripe.</span>
          </span>
        </label>
          </SettingsBlock>

          <SettingsBlock id="smtp" active={section === "smtp"} eyebrow="Correo" title="SMTP" status={blockStatus([!!data.smtpHost, !!data.smtpUser, data.hasSmtpPass])}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          revealField="smtpPass"
            onToggleClear={() => toggleClear("smtpPass")}
          />
          <FormField label="Remitente (From)">
            {(id) => <Input id={id} value={plain.emailFrom} onChange={(e) => setPlain((p) => ({ ...p, emailFrom: e.target.value }))} placeholder="Colibly <noreply@colibly.com>" />}
          </FormField>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={plain.smtpSecure} onCheckedChange={(v) => setPlain((p) => ({ ...p, smtpSecure: v }))} label="Conexión segura (TLS)" />
          Conexión segura (TLS)
        </label>
          </SettingsBlock>

          <SettingsBlock id="turnstile" active={section === "turnstile"} eyebrow="Captcha" title="Cloudflare Turnstile" status={blockStatus([!!data.turnstileSiteKey, data.hasTurnstileSecretKey])}>
        <FormField label="Site key" hint="Pública — se envía al navegador en /register.">
          {(id) => <Input id={id} value={plain.turnstileSiteKey} onChange={(e) => setPlain((p) => ({ ...p, turnstileSiteKey: e.target.value }))} />}
        </FormField>
        <SecretField
          label="Secret key"
          hasValue={data.hasTurnstileSecretKey}
          value={secrets.turnstileSecretKey}
          onChange={(v) => setSecrets((s) => ({ ...s, turnstileSecretKey: v }))}
          cleared={cleared.turnstileSecretKey}
          revealField="turnstileSecretKey"
          onToggleClear={() => toggleClear("turnstileSecretKey")}
        />
          </SettingsBlock>

          <SettingsBlock id="meta" active={section === "meta"} eyebrow="WhatsApp" title="App de Meta de la plataforma (Embedded Signup)" status={blockStatus([!!data.metaAppId, data.hasMetaAppSecret, !!data.metaEmbeddedSignupConfigId, data.hasMetaWebhookVerifyToken])}>
        <Banner tone="info">
          Datos de la app de Meta de Colibly. Con ellos los clientes conectan su WhatsApp con un botón, sin copiar tokens. El App Secret
          firma los webhooks de esas cuentas; nunca se vuelve a mostrar.
        </Banner>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          revealField="metaAppSecret"
          onToggleClear={() => toggleClear("metaAppSecret")}
        />
        <SecretField
          label="Token de verificación del webhook"
          hasValue={data.hasMetaWebhookVerifyToken}
          value={secrets.metaWebhookVerifyToken}
          onChange={(v) => setSecrets((s) => ({ ...s, metaWebhookVerifyToken: v }))}
          cleared={cleared.metaWebhookVerifyToken}
          revealField="metaWebhookVerifyToken"
          onToggleClear={() => toggleClear("metaWebhookVerifyToken")}
        />
          </SettingsBlock>

          <SettingsBlock id="medicion" active={section === "medicion"} eyebrow="Medición" title="Meta Pixel, Google Analytics y Ads" status={blockStatus([!!data.metaPixelId || !!data.gaMeasurementId || !!data.googleAdsId], true)}>
        <FormField label="Meta Pixel ID">
          {(id) => <Input id={id} value={plain.metaPixelId} onChange={(e) => setPlain((p) => ({ ...p, metaPixelId: e.target.value }))} />}
        </FormField>
        <SecretField
          label="Meta Conversions API access token"
          hasValue={data.hasMetaCapiAccessToken}
          value={secrets.metaCapiAccessToken}
          onChange={(v) => setSecrets((s) => ({ ...s, metaCapiAccessToken: v }))}
          cleared={cleared.metaCapiAccessToken}
          revealField="metaCapiAccessToken"
          onToggleClear={() => toggleClear("metaCapiAccessToken")}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </SettingsBlock>

          <PushKeysBlock active={section === "push"} />

        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-3 flex items-center justify-between gap-3 border-t border-border bg-surface px-3 py-3 sm:px-4 sm:mx-0 sm:rounded-lg sm:border">
        <p className={`text-sm ${dirty ? "text-foreground" : "text-muted-darker"}`} aria-live="polite">
          {dirty ? "Tienes cambios sin guardar." : "Todo guardado."}
        </p>
        <Button onClick={handleSave} loading={saving} disabled={!dirty} className="shrink-0">
          Guardar configuración
        </Button>
      </div>
    </PageContainer>
  );
}
