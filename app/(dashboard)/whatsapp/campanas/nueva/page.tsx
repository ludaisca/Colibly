"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, Send, X, Plus, Upload, FileX, Tag as TagIcon } from "lucide-react";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { normalizeCampaignRecipients } from "@/lib/campaigns/recipients";
import { Card, CardBody, CardFooter } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { SearchableSelect } from "@/app/components/ui/searchable-select";
import { Badge } from "@/app/components/ui/badge";
import { FormField } from "@/app/components/ui/form-field";
import { DatePicker } from "@/app/components/ui/date-picker";
import { TimeSelect } from "@/app/components/ui/time-select";
import { Switch } from "@/app/components/ui/switch";
import { localISODaysAgo } from "@/lib/format/calendar";
import { Spinner } from "@/app/components/ui/spinner";
import { Banner } from "@/app/components/ui/banner";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { useToast } from "@/app/components/ui/toast";
import { getTemplateVariables } from "@/lib/whatsapp/template-variables";
import { parseCsv, type ParsedCsvRow } from "@/lib/whatsapp/parse-csv";
import { phoneFromJid } from "@/lib/whatsapp/contact-name";
import { TemplatePreview } from "@/app/components/whatsapp/template-preview";
import { plural } from "@/lib/format/plural";
import { templateLanguageLabel } from "@/lib/whatsapp/template-labels";
import { BackLink } from "@/app/components/ui/back-link";

interface Account { id: string; name: string; channel: string; }
interface Template { id: string; name: string; language: string; category: string; status: string; components: unknown; }
interface RecipientRow { phoneNumber: string; contactName: string; params: string[] }
interface TagOption { id: string; name: string; color: string }
interface ContactListItem { id: string; remoteJid: string; name: string | null }

const TEMPLATE_STATUS_LABEL: Record<string, string> = {
  PENDING: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Deshabilitada",
  DELETED: "Ya no está en Meta",
};

const CSV_PAGE_SIZE = 10;

export default function NewCampaignPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateLoadError, setTemplateLoadError] = useState("");
  const [accountLoadError, setAccountLoadError] = useState("");
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const [name, setName] = useState("");
  const [waAccountId, setWaAccountId] = useState("");
  const [waTemplateId, setWaTemplateId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  // Por defecto la campaña se guarda como borrador: enviar siempre es una acción aparte y con confirmación.
  const [schedule, setSchedule] = useState(false);
  const [confirm, setConfirm] = useState<null | "send" | "schedule">(null);
  const [pending, setPending] = useState<{ allRecipients: RecipientRow[]; duplicateCount: number } | null>(null);
  const [headerParam, setHeaderParam] = useState("");
  const [headerFileName, setHeaderFileName] = useState<string | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [buttonParam, setButtonParam] = useState("");

  const [recipients, setRecipients] = useState<RecipientRow[]>([
    { phoneNumber: "", contactName: "", params: [] },
  ]);

  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvPage, setCsvPage] = useState(0);

  // Carga masiva por etiqueta (P3-b del roadmap) — comparte el mismo estado
  // csvRows/csvFileName/csvPage que la importación CSV: son dos formas de
  // llenar la misma lista de destinatarios en bulk, no dos listas separadas.
  const [tags, setTags] = useState<TagOption[]>([]);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [loadingTagContacts, setLoadingTagContacts] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === waTemplateId) ?? null,
    [templates, waTemplateId]
  );
  const templateVars = useMemo(
    () => (selectedTemplate ? getTemplateVariables(selectedTemplate.components) : null),
    [selectedTemplate]
  );
  const bodyParamCount = templateVars?.bodyParamCount ?? 0;

  useEffect(() => {
    fetch("/api/whatsapp/accounts").then(async r => {
      const d = await r.json();
      if (!r.ok || !Array.isArray(d)) throw new Error(d.error ?? "Error al cargar cuentas");
      return d;
    }).then(d => {
      // GET /api/whatsapp/accounts sobreescribe channel a "WHATSAPP" (discriminador de
      // UI para mezclarse con /api/telegram/accounts) — nunca devuelve "META_CLOUD"
      // literal, aunque esa sea la cuenta interna. Filtrar por "META_CLOUD" aquí dejaba
      // el combo de cuentas siempre vacío — bug preexistente desde la integración de
      // Telegram (commit 4ee4e31), encontrado al probar P3-b.
      const available = d.filter((a: Account) => a.channel === "WHATSAPP");
      setAccounts(available);
      if (available.length === 1) setWaAccountId(available[0].id);
    }).catch((err) => setAccountLoadError(err instanceof Error ? err.message : "Error al cargar cuentas"))
      .finally(() => setAccountsLoaded(true));
  }, []);

  // Las etiquetas son por cuenta: se recargan al cambiar de número y se
  // descarta la selección anterior (pertenecía a otra cuenta).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cambiar de cuenta
    setSelectedTagId("");
    if (!waAccountId) {
      setTags([]);
      return;
    }
    fetch(`/api/whatsapp/tags?waAccountId=${waAccountId}`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTags(d);
    }).catch(() => toastError("Error al cargar etiquetas"));
  }, [waAccountId, toastError]);

  useEffect(() => {
    if (!waAccountId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load templates when account selection changes
    setLoadingTemplates(true);
    setTemplateLoadError("");
    fetch(`/api/whatsapp/templates?waAccountId=${encodeURIComponent(waAccountId)}`)
      .then(async r => { const d = await r.json(); if (!r.ok || !Array.isArray(d)) throw new Error(d.error ?? "Error al cargar plantillas"); return d; })
      .then(d => setTemplates(d))
      .catch((err) => setTemplateLoadError(err instanceof Error ? err.message : "Error al cargar plantillas"))
      .finally(() => setLoadingTemplates(false));
  }, [waAccountId]);

  // Params, header/button values and any imported CSV are all specific to the
  // previously selected template's shape — switching templates invalidates them.
  function handleTemplateChange(id: string) {
    setWaTemplateId(id);
    setHeaderParam("");
    if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
    setHeaderPreviewUrl(null);
    setHeaderFileName(null);
    setButtonParam("");
    setCsvRows([]);
    setCsvFileName(null);
    setCsvPage(0);
    setRecipients(prev => prev.map(r => ({ ...r, params: [] })));
  }

  async function handleHeaderFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !waAccountId) return;

    if (templateVars?.header.format === "IMAGE") {
      if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
      setHeaderPreviewUrl(URL.createObjectURL(file));
    }
    setHeaderFileName(file.name);
    setHeaderUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("accountId", waAccountId);
      const res = await fetch("/api/whatsapp/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir el archivo");
      setHeaderParam(data.mediaId);
      success("Archivo de cabecera cargado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al subir el archivo");
      setHeaderParam("");
      setHeaderFileName(null);
      if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
      setHeaderPreviewUrl(null);
    } finally {
      setHeaderUploading(false);
    }
  }

  function addRecipient() {
    setRecipients(prev => [...prev, { phoneNumber: "", contactName: "", params: [] }]);
  }
  function removeRecipient(idx: number) {
    setRecipients(prev => prev.filter((_, i) => i !== idx));
  }
  function updateRecipient(idx: number, field: "phoneNumber" | "contactName", value: string) {
    setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }
  function updateRecipientParam(idx: number, paramIdx: number, value: string) {
    setRecipients(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const params = [...r.params];
      params[paramIdx] = value;
      return { ...r, params };
    }));
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      setCsvRows(parsed.rows);
      setCsvFileName(file.name);
      setCsvPage(0);

      if (parsed.rows.length === 0) {
        toastError("No se encontraron destinatarios válidos en el archivo");
      } else if (bodyParamCount > 0 && parsed.paramColumnCount !== bodyParamCount) {
        toastError(`El archivo trae ${plural(parsed.paramColumnCount, "columna")} de variables, pero la plantilla requiere ${bodyParamCount}`);
      } else {
        success(`${parsed.rows.length} destinatarios importados`);
      }
    };
    reader.onerror = () => toastError("Error al leer el archivo");
    reader.readAsText(file);
  }

  function clearCsv() {
    setCsvRows([]);
    setCsvFileName(null);
    setCsvPage(0);
  }

  // Recorre /api/whatsapp/contacts por página (100 es el tope que acepta esa
  // ruta) hasta agotar la etiqueta — una etiqueta puede tener más contactos
  // de los que caben en una sola página. Escribe en el mismo csvRows/
  // csvFileName que usa la importación CSV: es la misma lista de destinatarios
  // en bulk, solo con otra fuente.
  async function loadRecipientsByTag() {
    if (!waAccountId || !selectedTagId) return;
    setLoadingTagContacts(true);
    try {
      const rows: ParsedCsvRow[] = [];
      let page = 1;
      let total = Infinity;
      while (rows.length < total) {
        const res = await fetch(`/api/whatsapp/contacts?accountId=${waAccountId}&tagId=${selectedTagId}&page=${page}&pageSize=100`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al cargar contactos de la etiqueta");
        total = data.total ?? 0;
        const items: ContactListItem[] = Array.isArray(data.items) ? data.items : [];
        for (const c of items) {
          rows.push({ id: `tag-${c.id}`, phoneNumber: phoneFromJid(c.remoteJid), contactName: c.name ?? "", params: [] });
        }
        if (items.length === 0) break;
        page += 1;
      }

      if (rows.length === 0) {
        toastError("Esa etiqueta no tiene contactos en esta cuenta");
        return;
      }
      setCsvRows(rows);
      setCsvFileName(`Etiqueta: ${tags.find(t => t.id === selectedTagId)?.name ?? ""}`);
      setCsvPage(0);
      success(`${plural(rows.length, "destinatario")} ${rows.length === 1 ? "cargado" : "cargados"} desde la etiqueta`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cargar contactos");
    } finally {
      setLoadingTagContacts(false);
    }
  }

  const csvTotalPages = Math.max(1, Math.ceil(csvRows.length / CSV_PAGE_SIZE));
  const csvPageRows = useMemo(
    () => csvRows.slice(csvPage * CSV_PAGE_SIZE, csvPage * CSV_PAGE_SIZE + CSV_PAGE_SIZE),
    [csvRows, csvPage]
  );

  const csvColumns: TableColumn<ParsedCsvRow>[] = useMemo(() => [
    {
      key: "phoneNumber",
      header: "Teléfono",
      render: (r) => <span className="font-mono text-xs">{r.phoneNumber}</span>,
    },
    {
      key: "contactName",
      header: "Nombre",
      render: (r) => r.contactName || "—",
    },
    {
      key: "params",
      header: "Parámetros",
      render: (r) => r.params.length > 0 ? r.params.filter(Boolean).join(" · ") || "—" : "—",
    },
    {
      key: "status",
      header: "Estado",
      render: (r) => {
        const validPhone = /^\d{8,15}$/.test(r.phoneNumber);
        const validParams = bodyParamCount === 0 || r.params.filter(Boolean).length === bodyParamCount;
        const ok = validPhone && validParams;
        return <Badge tone={ok ? "success" : "danger"} size="sm">{ok ? "OK" : "Revisar"}</Badge>;
      },
    },
  ], [bodyParamCount]);

  // Valida el formulario y devuelve los destinatarios ya depurados (o null si hay errores).
  function validateForm(): { allRecipients: RecipientRow[]; duplicateCount: number } | null {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Requerido";
    if (!waAccountId) newErrors.waAccountId = "Selecciona una cuenta";
    if (!waTemplateId) newErrors.waTemplateId = "Selecciona una plantilla";

    if (templateVars?.header.required && !headerParam.trim()) {
      newErrors.headerParam = templateVars.header.format === "TEXT"
        ? "La cabecera de esta plantilla requiere un valor"
        : `Sube el archivo de ${templateVars.header.format?.toLowerCase()} para la cabecera`;
    }
    if (templateVars?.buttonUrl && !buttonParam.trim()) {
      newErrors.buttonParam = "El botón de esta plantilla requiere un valor";
    }

    if (schedule) {
      if (!scheduledAt) {
        newErrors.scheduledAt = "Selecciona la fecha y hora de envío";
      } else if (new Date(scheduledAt).getTime() < Date.now() - 60_000) {
        newErrors.scheduledAt = "La fecha ya pasó — elige una fecha futura";
      }
    }

    const manualRecipients = recipients.filter(r => r.phoneNumber.trim());
    // Mismo criterio que el servidor (lib/campaigns/recipients.ts): teléfono de
    // México por defecto y sin duplicados por número equivalente (52… / 521…),
    // así el mismo lead nunca recibe la plantilla dos veces.
    const normalized = normalizeCampaignRecipients([...manualRecipients, ...csvRows]);
    const allRecipients = normalized.ok ? normalized.recipients : [];
    const duplicateCount = normalized.ok ? normalized.duplicates : 0;

    if (manualRecipients.length + csvRows.length === 0) {
      newErrors.recipients = "Al menos un destinatario es requerido";
    } else if (!normalized.ok) {
      newErrors.recipients = normalized.error;
    } else if (bodyParamCount > 0) {
      const incomplete = allRecipients.some(r => r.params.filter(Boolean).length !== bodyParamCount);
      if (incomplete) {
        newErrors.recipients = `Todos los destinatarios deben tener ${bodyParamCount === 1 ? "el parámetro" : `los ${bodyParamCount} parámetros`} del cuerpo`;
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return null;
    return { allRecipients, duplicateCount };
  }

  // Guardar borrador / programar: submit del formulario. Programar y enviar piden confirmación.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = validateForm();
    if (!valid) return;
    setPending(valid);
    if (schedule) setConfirm("schedule");
    else void persist("draft", valid);
  }

  function handleSendClick() {
    const valid = validateForm();
    if (!valid) return;
    setPending(valid);
    setConfirm("send");
  }

  async function persist(mode: "draft" | "schedule" | "send", valid: { allRecipients: RecipientRow[]; duplicateCount: number }) {
    const { allRecipients, duplicateCount } = valid;
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          waAccountId,
          waTemplateId,
          scheduledAt: mode !== "schedule" || !scheduledAt ? null : new Date(scheduledAt).toISOString(),
          headerParam: headerParam.trim() || undefined,
          buttonParam: buttonParam.trim() || undefined,
          recipients: allRecipients.map(r => ({
            phoneNumber: r.phoneNumber.trim(),
            contactName: r.contactName.trim() || undefined,
            parameters: bodyParamCount > 0
              ? Object.fromEntries(r.params.map((v, i) => [String(i + 1), v]))
              : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");

      if (mode === "send") {
        const sendRes = await fetch(`/api/whatsapp/campaigns/${data.id}/send`, { method: "POST" });
        if (!sendRes.ok) {
          // La campaña ya existe — no relanzar el submit (duplicaría la
          // campaña); avisar y mandar al usuario a la lista para reintentar.
          const sendData = await sendRes.json().catch(() => ({}));
          toastError(sendData.error ?? "La campaña se creó pero no pudo iniciarse — usa \"Enviar\" desde la lista");
          router.push("/whatsapp/campanas");
          return;
        }
      }

      const dupNote = duplicateCount > 0 ? ` (${plural(duplicateCount, "duplicado omitido", "duplicados omitidos")})` : "";
      success((mode === "send" ? "Campaña iniciada" : mode === "schedule" ? "Campaña programada" : "Borrador guardado") + dupNote);
      router.push("/whatsapp/campanas");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const totalRecipients = recipients.filter(r => r.phoneNumber.trim()).length + csvRows.length;

  return (
    <div className="space-y-6">
      <BackLink href="/whatsapp/campanas" className="mb-3">Volver a campañas</BackLink>
      <h1 className="text-2xl font-bold tracking-tight">Nueva campaña</h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <Card>
          <form onSubmit={handleSubmit}>
            <CardBody>
              <div className="space-y-5">
                {accountLoadError && <Banner tone="danger">{accountLoadError}</Banner>}
                {accountsLoaded && accounts.length === 0 && !accountLoadError && (
                  <Banner tone="info">Conecta una <Link href="/whatsapp/cuentas" className="underline">cuenta WhatsApp</Link> antes de crear una campaña.</Banner>
                )}
                <FormField label="Nombre de la campaña" required error={errors.name}>
                  {(id) => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Promoción Julio 2026" error={errors.name} />}
                </FormField>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Cuenta WhatsApp" required error={errors.waAccountId}>
                    {(id) => (
                      <Select id={id} value={waAccountId} onChange={e => { setWaAccountId(e.target.value); setTemplates([]); handleTemplateChange(""); }} placeholder="Seleccionar" error={errors.waAccountId}>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                    )}
                  </FormField>
                  <FormField
                    label="Plantilla"
                    required
                    error={errors.waTemplateId}
                    hint="Solo las plantillas aprobadas por Meta pueden usarse en una campaña."
                  >
                    {(id) => (
                      <SearchableSelect
                        id={id}
                        value={waTemplateId}
                        onChange={handleTemplateChange}
                        placeholder={loadingTemplates ? "Cargando…" : "Seleccionar"}
                        searchPlaceholder="Buscar plantilla…"
                        error={errors.waTemplateId}
                        disabled={!waAccountId || loadingTemplates}
                        options={templates.map(t => ({
                          value: t.id,
                          label: `${t.name} (${templateLanguageLabel(t.language)}) — ${TEMPLATE_STATUS_LABEL[t.status] ?? t.status}`,
                          disabled: t.status !== "APPROVED",
                        }))}
                      />
                    )}
                  </FormField>
                </div>
                {templateLoadError && <Banner tone="danger">{templateLoadError}</Banner>}
                {waAccountId && !loadingTemplates && !templateLoadError && !templates.some(t => t.status === "APPROVED") && (
                  <Banner tone="info">Esta cuenta no tiene plantillas aprobadas. <Link href={`/whatsapp/plantillas?accountId=${encodeURIComponent(waAccountId)}`} className="underline">Revisa o sincroniza sus plantillas</Link> antes de crear una campaña.</Banner>
                )}

                {templateVars?.header.required && templateVars.header.format === "TEXT" && (
                  <FormField
                    label="Valor de la cabecera"
                    required
                    error={errors.headerParam}
                    hint="Se aplica a todos los destinatarios de esta campaña."
                  >
                    {(id) => (
                      <Input
                        id={id}
                        value={headerParam}
                        onChange={e => setHeaderParam(e.target.value)}
                        placeholder="Texto de la cabecera"
                        error={errors.headerParam}
                      />
                    )}
                  </FormField>
                )}

                {templateVars?.header.required && templateVars.header.format !== "TEXT" && (
                  <FormField
                    label={`Archivo de ${templateVars.header.format?.toLowerCase()} para la cabecera`}
                    required
                    error={errors.headerParam}
                    hint="Se sube directo al sistema y se aplica a todos los destinatarios de esta campaña."
                  >
                    {() => (
                      <div className="space-y-2">
                        <input
                          ref={headerFileInputRef}
                          type="file"
                          accept={
                            templateVars.header.format === "IMAGE" ? "image/*"
                              : templateVars.header.format === "VIDEO" ? "video/*"
                              : "application/pdf"
                          }
                          onChange={handleHeaderFile}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={Upload}
                          onClick={() => headerFileInputRef.current?.click()}
                          disabled={!waAccountId || headerUploading}
                        >
                          {headerUploading ? "Subiendo…" : "Subir archivo"}
                        </Button>
                        {headerFileName && !headerUploading && (
                          <p className="text-xs text-muted-darker">{headerFileName} — cargado</p>
                        )}
                        {!waAccountId && (
                          <p className="text-xs text-muted-darker">Selecciona primero una cuenta de WhatsApp</p>
                        )}
                      </div>
                    )}
                  </FormField>
                )}

                {templateVars?.buttonUrl && (
                  <FormField
                    label={`Valor dinámico del botón "${templateVars.buttonUrl.text}"`}
                    required
                    error={errors.buttonParam}
                    hint="Se aplica a todos los destinatarios de esta campaña."
                  >
                    {(id) => (
                      <Input
                        id={id}
                        value={buttonParam}
                        onChange={e => setButtonParam(e.target.value)}
                        placeholder="Sufijo o valor de la URL"
                        error={errors.buttonParam}
                      />
                    )}
                  </FormField>
                )}

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Programar envío</p>
                    <p className="text-xs text-muted-darker">Si no la programas, se guarda como borrador y la envías cuando quieras</p>
                  </div>
                  <Switch checked={schedule} onCheckedChange={setSchedule} label="Programar envío" />
                </div>

                {schedule && (
                  <FormField label="Programar para" required hint="Fecha y hora de inicio" error={errors.scheduledAt}>
                    {(id) => (
                      // `scheduledAt` = "AAAA-MM-DDTHH:MM" en hora local; al enviar se
                      // convierte a ISO con zona. Antes solo había fecha y el servidor
                      // la leía como medianoche UTC (18:00 del día anterior en México).
                      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                        <DatePicker
                          id={id}
                          ariaLabel="Fecha de envío"
                          value={scheduledAt.slice(0, 10)}
                          min={localISODaysAgo()}
                          placeholder="Seleccionar fecha"
                          onChange={(date) => setScheduledAt(date ? `${date}T${scheduledAt.slice(11, 16) || "09:00"}` : "")}
                        />
                        <TimeSelect
                          ariaLabel="Hora de envío"
                          value={scheduledAt.slice(11, 16)}
                          onChange={(time) => setScheduledAt(`${scheduledAt.slice(0, 10) || localISODaysAgo()}T${time}`)}
                        />
                      </div>
                    )}
                  </FormField>
                )}

                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold mb-3">Destinatarios ({totalRecipients})</h3>

                  <div className="space-y-2 mb-4">
                    {recipients.map((r, i) => (
                      <div key={i} className="flex flex-wrap gap-2 items-start">
                        <Input
                          aria-label={`Teléfono del destinatario ${i + 1}`}
                          value={r.phoneNumber}
                          onChange={e => updateRecipient(i, "phoneNumber", e.target.value)}
                          placeholder="5215551234567"
                          className="flex-1 min-w-[140px]"
                        />
                        <Input
                          aria-label={`Nombre del destinatario ${i + 1}`}
                          value={r.contactName}
                          onChange={e => updateRecipient(i, "contactName", e.target.value)}
                          placeholder="Nombre (opcional)"
                          className="w-36"
                        />
                        {Array.from({ length: bodyParamCount }).map((_, paramIdx) => (
                          <Input
                            key={paramIdx}
                            aria-label={`Variable ${paramIdx + 1} del destinatario ${i + 1}`}
                            value={r.params[paramIdx] ?? ""}
                            onChange={e => updateRecipientParam(i, paramIdx, e.target.value)}
                            placeholder={`{{${paramIdx + 1}}}`}
                            className="w-28"
                          />
                        ))}
                        {recipients.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" icon={X} aria-label={`Quitar destinatario ${i + 1}`} onClick={() => removeRecipient(i)} />
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addRecipient}>
                      Agregar número
                    </Button>
                  </div>

                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Carga masiva de destinatarios</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleCsvFile}
                        className="hidden"
                      />
                      <Button type="button" variant="secondary" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
                        Subir CSV
                      </Button>
                    </div>
                    <p className="text-xs text-muted-darker">
                      Primera fila con encabezados: <code className="bg-surface px-1 rounded">telefono</code>, <code className="bg-surface px-1 rounded">nombre</code>{bodyParamCount > 0 ? `, y ${bodyParamCount} columna(s) más para las variables del cuerpo` : ""}.
                    </p>

                    <div className="border-t border-border pt-3 space-y-2">
                      <span className="text-sm font-medium">O por etiqueta</span>
                      {bodyParamCount > 0 ? (
                        <p className="text-xs text-muted-darker">
                          No disponible — esta plantilla requiere {plural(bodyParamCount, "variable")} en el cuerpo y los contactos de una etiqueta no traen esos valores por destinatario. Usa números manuales o CSV para esta plantilla.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Select
                            aria-label="Etiqueta para cargar contactos"
                            value={selectedTagId}
                            onChange={e => setSelectedTagId(e.target.value)}
                            disabled={!waAccountId}
                            className="flex-1 min-w-[160px]"
                          >
                            <option value="">Seleccionar etiqueta</option>
                            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </Select>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={TagIcon}
                            onClick={loadRecipientsByTag}
                            disabled={!waAccountId || !selectedTagId || loadingTagContacts}
                          >
                            {loadingTagContacts ? "Cargando…" : "Cargar contactos"}
                          </Button>
                        </div>
                      )}
                      {!waAccountId && (
                        <p className="text-xs text-muted-darker">Selecciona primero una cuenta de WhatsApp</p>
                      )}
                    </div>

                    {csvFileName && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-darker">
                            {csvFileName} — {plural(csvRows.length, "destinatario")}
                          </span>
                          <Button type="button" variant="ghost" size="sm" icon={FileX} onClick={clearCsv}>
                            Quitar
                          </Button>
                        </div>

                        <Table
                          columns={csvColumns}
                          rows={csvPageRows}
                          rowKey={(r) => r.id}
                          emptyIcon={Upload}
                          emptyTitle="Sin destinatarios"
                          mobileCard={(r) => {
                            const params = csvColumns.find((c) => c.key === "params")!;
                            const status = csvColumns.find((c) => c.key === "status")!;
                            return (
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-sm font-medium truncate">{r.phoneNumber}</span>
                                  {status.render(r)}
                                </div>
                                {r.contactName && <div className="text-xs text-muted-darker truncate">{r.contactName}</div>}
                                <div className="text-xs text-muted-darker truncate">{params.render(r)}</div>
                              </div>
                            );
                          }}
                        />

                        {csvTotalPages > 1 && (
                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-muted-darker">Página {csvPage + 1} de {csvTotalPages}</span>
                            <div className="flex gap-2">
                              <Button type="button" variant="secondary" size="sm" disabled={csvPage === 0} onClick={() => setCsvPage(p => p - 1)}>
                                Anterior
                              </Button>
                              <Button type="button" variant="secondary" size="sm" disabled={csvPage >= csvTotalPages - 1} onClick={() => setCsvPage(p => p + 1)}>
                                Siguiente
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {errors.recipients && <p className="text-xs text-danger mt-2">{errors.recipients}</p>}
                </div>
              </div>
            </CardBody>
            <CardFooter>
              <Button type="submit" icon={saving ? undefined : Save} disabled={saving}>
                {saving ? <Spinner /> : schedule ? "Programar campaña" : "Guardar borrador"}
              </Button>
              {!schedule && (
                <Button type="button" variant="secondary" icon={Send} disabled={saving} onClick={handleSendClick}>Enviar…</Button>
              )}
              <Button href="/whatsapp/campanas" type="button" variant="secondary">Cancelar</Button>
            </CardFooter>
          </form>
        </Card>

        <ConfirmDialog
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          tone="warning"
          title={confirm === "schedule" ? "¿Programar la campaña?" : "¿Enviar la campaña ahora?"}
          description={
            confirm === "schedule"
              ? `¿Programar el envío a ${plural(pending?.allRecipients.length ?? 0, "contacto", "contactos")} para el ${scheduledAt ? new Date(scheduledAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" }) : "—"}? Meta cobra cada mensaje de plantilla de marketing o utilidad.`
              : `¿Enviar a ${plural(pending?.allRecipients.length ?? 0, "contacto", "contactos")} ahora? Meta cobra cada mensaje de plantilla de marketing o utilidad.`
          }
          confirmLabel={confirm === "schedule" ? "Sí, programar" : "Sí, enviar"}
          onConfirm={async () => {
            const mode = confirm;
            setConfirm(null);
            if (mode && pending) await persist(mode, pending);
          }}
        />

        <div className="lg:sticky lg:top-6">
          {selectedTemplate ? (
            <TemplatePreview components={selectedTemplate.components} headerImagePreview={headerPreviewUrl} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-darker">
              Selecciona una plantilla para ver la vista previa
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
