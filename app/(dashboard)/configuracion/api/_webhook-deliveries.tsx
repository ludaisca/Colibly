"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, RefreshCw, RotateCcw } from "lucide-react";
import { DetailPage } from "@/app/components/ui/detail-page";
import { Card } from "@/app/components/ui/card";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { formatDateTime } from "./_shared";

interface Delivery {
  id: string;
  eventType: string;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
  payload: unknown;
}

const STATUS: Record<Delivery["status"], { label: string; tone: "success" | "warning" | "danger" }> = {
  SENT: { label: "Entregado", tone: "success" },
  PENDING: { label: "Reintentando", tone: "warning" },
  FAILED: { label: "Falló", tone: "danger" },
};

// Registro de las últimas 50 entregas de un endpoint: estado, intentos,
// respuesta del receptor y el cuerpo exacto que se envió.
export function WebhookDeliveriesView({ webhook }: { webhook: { id: string; name: string } }) {
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/configuracion/webhooks/${webhook.id}/deliveries`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar entregas");
      setItems(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al cargar entregas");
    } finally {
      setLoading(false);
    }
  }, [webhook.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open; load también refresca manualmente
    load();
  }, [load]);

  async function retry(id: string) {
    setRetrying(id);
    try {
      const res = await fetch(`/api/configuracion/webhooks/deliveries/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo reintentar");
      success("Reintento en cola");
      setTimeout(load, 1500);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo reintentar");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <DetailPage
      backHref="/configuracion/api?tab=webhooks"
      backLabel="Volver a webhooks"
      title={`Entregas · ${webhook.name}`}
      description="Últimas 50 entregas (se conservan 30 días). Las fallidas se reintentan solas hasta 6 veces."
      maxWidth="max-w-4xl"
      actions={<Button variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Actualizar</Button>}
    >
      <Card as="section" padding="lg">
      {loadError && (
        <Banner tone="danger" action={<Button variant="link" onClick={load}>Reintentar</Button>}>
          {loadError}
        </Banner>
      )}
      {loading && items.length === 0 ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Todavía no hay entregas. Usa “Probar” para mandar un evento de prueba.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((d) => (
            <li key={d.id} className="py-3">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                  <ChevronRight size={14} aria-hidden className="shrink-0 text-muted-darker transition-transform group-open:rotate-90" />
                  <Badge size="sm" tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                  <span className="font-mono text-xs text-foreground">{d.eventType}</span>
                  <span className="text-xs text-muted">
                    {d.responseCode ? `HTTP ${d.responseCode} · ` : ""}
                    {d.attempts} intento{d.attempts === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto text-xs text-muted tabular-nums">{formatDateTime(d.createdAt)}</span>
                </summary>
                {d.error && <p className="mt-2 text-xs text-danger break-words">{d.error}</p>}
                <pre tabIndex={0} aria-label="Cuerpo enviado" className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface-light p-3 text-xs">
                  {JSON.stringify(d.payload, null, 2)}
                </pre>
              </details>
              {d.status === "FAILED" && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={RotateCcw}
                    loading={retrying === d.id}
                    onClick={() => retry(d.id)}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      </Card>
    </DetailPage>
  );
}
