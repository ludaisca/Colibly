"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search, Send } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Spinner } from "@/app/components/ui/spinner";
import { getTemplateVariables, renderTemplateText } from "@/lib/whatsapp/template-variables";
import type { Message } from "@/app/components/whatsapp/chat-shared";
import { templateLanguageLabel } from "@/lib/whatsapp/template-labels";

interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
}

const CATEGORY_LABEL: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" };

// Sin precios propios: Meta cobra por plantilla entregada según categoría y
// país del destinatario (https://developers.facebook.com/docs/whatsapp/pricing).
function categoryNote(category: string, windowOpen: boolean): string {
  if (category === "UTILITY" && windowOpen) return "Con la ventana de 24 h abierta, Meta no cobra las plantillas de utilidad.";
  if (category === "MARKETING" || category === "UTILITY" || category === "AUTHENTICATION") {
    return `Meta cobra cada plantilla de ${CATEGORY_LABEL[category].toLowerCase()} entregada según la tarifa del país del cliente; se carga a la cuenta de WhatsApp Business.`;
  }
  return "Meta puede cobrar esta plantilla según su categoría y el país del cliente.";
}

function bodyText(components: unknown): string {
  const list = Array.isArray(components) ? (components as Array<{ type?: string; text?: string }>) : [];
  return list.find((c) => c.type === "BODY")?.text ?? "";
}

export function TemplatePickerModal({
  open,
  onClose,
  chatId,
  accountId,
  contactName,
  windowOpen,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  chatId: string;
  accountId: string;
  contactName: string;
  windowOpen: boolean;
  onSent: (message: Message) => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [headerParam, setHeaderParam] = useState("");
  const [buttonParam, setButtonParam] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Se monta al abrir (ver chat-workspace), así el estado arranca limpio.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/whatsapp/templates?waAccountId=${encodeURIComponent(accountId)}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las plantillas");
        setTemplates((data as TemplateRow[]).filter((t) => t.status === "APPROVED"));
      })
      .catch((err) => { if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "No se pudieron cargar las plantillas"); });
    return () => controller.abort();
  }, [open, accountId]);

  const vars = useMemo(() => (selected ? getTemplateVariables(selected.components) : null), [selected]);
  const mediaHeader = !!vars?.header.format && vars.header.format !== "TEXT";

  function choose(template: TemplateRow) {
    const v = getTemplateVariables(template.components);
    setSelected(template);
    setSendError(null);
    // {{1}} suele ser el nombre del cliente: se propone como valor inicial.
    setBodyParams(Array.from({ length: v.bodyParamCount }, (_, i) => (i === 0 ? contactName : "")));
    setHeaderParam(v.header.required && v.header.format === "TEXT" ? contactName : "");
    setButtonParam("");
  }

  const filtered = (templates ?? []).filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()));
  const preview = selected ? renderTemplateText(selected.components, { bodyParams, headerParam: headerParam || null }) : "";
  const missing = !!vars && (bodyParams.some((p) => !p.trim()) || (vars.header.required && !mediaHeader && !headerParam.trim()) || (!!vars.buttonUrl?.required && !buttonParam.trim()));

  async function send() {
    if (!selected) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selected.id, bodyParams: bodyParams.map((p) => p.trim()), headerParam: headerParam.trim() || null, buttonParam: buttonParam.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la plantilla");
      onSent(data as Message);
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "No se pudo enviar la plantilla");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={selected ? `Plantilla: ${selected.name}` : "Enviar plantilla"}
      description={windowOpen ? "La ventana de 24 h está abierta; también puedes responder con texto libre." : "Pasaron más de 24 h desde el último mensaje del cliente: solo puedes escribirle con una plantilla aprobada."}
      footer={selected ? (
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setSelected(null)} disabled={sending}>Elegir otra</Button>
          <Button icon={Send} loading={sending} disabled={missing || mediaHeader} onClick={send}>Enviar plantilla</Button>
        </div>
      ) : undefined}
    >
      {loadError ? (
        <p role="alert" className="text-sm text-danger">{loadError}</p>
      ) : templates === null ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay plantillas aprobadas"
          description="Esta cuenta de WhatsApp todavía no tiene plantillas aprobadas por Meta. Créalas o sincronízalas desde Plantillas."
          action={<Button href="/whatsapp/plantillas" variant="secondary">Ir a Plantillas</Button>}
        />
      ) : !selected ? (
        <div className="space-y-3">
          <Input icon={Search} placeholder="Buscar plantilla" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar plantilla" />
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto" aria-label="Plantillas aprobadas">
            {filtered.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => choose(t)} className="w-full rounded-lg border border-border bg-surface p-3 text-left hover:border-accent-strong hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-accent-strong">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{t.name}</span>
                    <span className="rounded-md bg-surface-light px-1.5 py-0.5 text-micro text-muted">{templateLanguageLabel(t.language)}</span>
                    <span className="rounded-md bg-accent-subtle px-1.5 py-0.5 text-micro text-accent-ink">{CATEGORY_LABEL[t.category] ?? t.category}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{bodyText(t.components) || "Sin texto de cuerpo"}</p>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="py-6 text-center text-sm text-muted">Ninguna plantilla coincide con “{query}”.</li>}
          </ul>
          <p className="text-xs text-muted">¿Falta alguna? <Link href="/whatsapp/plantillas" className="text-accent-ink underline-offset-4 hover:underline">Administra tus plantillas</Link>.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {mediaHeader ? (
            <p role="alert" className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning">
              Esta plantilla lleva un encabezado con archivo ({vars?.header.format?.toLowerCase()}); desde el chat solo se envían plantillas de texto. Usa Campañas para enviarla.
            </p>
          ) : null}
          {vars?.header.required && !mediaHeader && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Variable del encabezado</span>
              <Input value={headerParam} onChange={(e) => setHeaderParam(e.target.value)} maxLength={60} />
            </label>
          )}
          {bodyParams.map((value, i) => (
            <label key={i} className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">{`Variable {{${i + 1}}}`}{i === 0 ? " (nombre del cliente por defecto)" : ""}</span>
              <Input value={value} onChange={(e) => setBodyParams((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))} maxLength={1024} />
            </label>
          ))}
          {vars?.buttonUrl?.required && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">{`Final de la URL del botón "${vars.buttonUrl.text ?? ""}"`}</span>
              <Input value={buttonParam} onChange={(e) => setButtonParam(e.target.value)} maxLength={200} />
            </label>
          )}
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Vista previa</p>
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface-light p-3 text-sm text-foreground">{preview}</div>
          </div>
          <p className="text-xs text-muted">{categoryNote(selected.category, windowOpen)}</p>
          {sendError && <p role="alert" className="text-sm text-danger">{sendError}</p>}
        </div>
      )}
    </Modal>
  );
}
