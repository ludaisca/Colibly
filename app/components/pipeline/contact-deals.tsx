"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { useToast } from "@/app/components/ui/toast";
import { formatMoney } from "@/lib/pipeline/format";

export interface ContactDeal {
  id: string;
  title: string;
  amount: number;
  stage: { id: string; name: string; color: string };
  pipeline: { id: string; name: string };
}

interface PipelineOption {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; outcome: "OPEN" | "WON" | "LOST" }>;
}

// Negocios abiertos de la persona (lo que antes era el "estado del lead") con
// cambio de etapa y alta de uno nuevo. Perder un negocio pide el motivo.
export function ContactDeals({ personId, contactId, deals, onChanged }: { personId: string; contactId: string; deals: ContactDeal[]; onChanged: () => void }) {
  const { error: toastError, success } = useToast();
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [currency, setCurrency] = useState("MXN");
  const [reasons, setReasons] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingLost, setPendingLost] = useState<{ dealId: string; stageId: string } | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/crm/pipelines")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setPipelines(d.items);
        setCurrency(d.currency);
      })
      .catch(() => undefined);
  }, []);

  async function call(url: string, body: unknown, ok: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      success(ok);
      onChanged();
      return true;
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function pickStage(dealId: string, stageId: string) {
    const stage = pipelines.flatMap((p) => p.stages).find((s) => s.id === stageId);
    if (stage?.outcome === "LOST") {
      if (!reasons.length) {
        fetch("/api/crm/loss-reasons")
          .then((r) => r.json())
          .then((d) => setReasons(d.items ?? []))
          .catch(() => toastError("No se pudieron cargar los motivos de pérdida"));
      }
      setReasonId("");
      setPendingLost({ dealId, stageId });
      return;
    }
    void call(`/api/crm/deals/${dealId}/move`, { stageId }, stage?.outcome === "WON" ? "¡Negocio ganado!" : "Etapa actualizada");
  }

  const defaultPipeline = pipelines[0];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-muted-darker">Negocios</label>
        {defaultPipeline && (
          <Button size="sm" variant="ghost" icon={Plus} disabled={busy} onClick={() => void call("/api/crm/deals", { personId, contactId }, "Negocio abierto")}>
            Abrir negocio
          </Button>
        )}
      </div>
      {deals.length === 0 ? (
        <p className="text-sm text-muted">Sin negocios abiertos.</p>
      ) : (
        <div className="space-y-2">
          {deals.map((deal) => {
            const pipeline = pipelines.find((p) => p.id === deal.pipeline.id);
            return (
              <div key={deal.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{deal.title}</p>
                  <Badge tone="neutral" size="sm">{formatMoney(deal.amount, currency)}</Badge>
                </div>
                {pipelines.length > 1 && <p className="mt-0.5 text-xs text-muted-darker">{deal.pipeline.name}</p>}
                <Select aria-label={`Etapa de ${deal.title}`} value={deal.stage.id} disabled={busy || !pipeline} onChange={(e) => pickStage(deal.id, e.target.value)} className="mt-2">
                  {(pipeline?.stages ?? [{ id: deal.stage.id, name: deal.stage.name, outcome: "OPEN" as const }]).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                {pendingLost?.dealId === deal.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <Select aria-label="Motivo de pérdida" value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="flex-1">
                      <option value="">Motivo de pérdida</option>
                      {reasons.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      disabled={!reasonId || busy}
                      onClick={async () => {
                        if (await call(`/api/crm/deals/${deal.id}/move`, { stageId: pendingLost.stageId, lostReasonId: reasonId }, "Negocio perdido")) setPendingLost(null);
                      }}
                    >
                      Perder
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingLost(null)}>Cancelar</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
