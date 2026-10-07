"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Archive, Briefcase, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Alert } from "@/app/components/kit/alert";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogDescription } from "@/app/components/kit/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { Field, FieldDescription, FieldLabel } from "@/app/components/kit/field";
import { Input } from "@/app/components/kit/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/app/components/kit/menu";
import { Textarea } from "@/app/components/kit/textarea";
import { cn } from "@/app/components/kit/utils";
import { useToast } from "@/app/components/ui/toast";
import { SimpleSelect } from "@/app/components/crm/simple-select";
import { invalidateCrmLookups, useLossReasons, usePipelines, useTeam, type PipelineOption } from "@/app/components/crm/use-crm-lookups";
import { stageClasses } from "@/lib/pipeline/stage-colors";
import { formatMoney, timeInStage } from "@/lib/pipeline/format";

// Negocios de una persona: lista con cambio de etapa (perder pide el motivo),
// alta, edición y archivo. Sirve a la ficha completa y a la columna de la
// bandeja (`compact`: solo los abiertos y sin menú de edición).

export interface PersonDeal {
  id: string;
  title: string;
  amount: number;
  probability: number | null;
  expectedCloseDate: string | null;
  status: "OPEN" | "WON" | "LOST";
  ownerId: string | null;
  owner?: { id: string; name: string | null } | null;
  lostReason?: { id: string; name: string } | null;
  version: number;
  closedAt: string | null;
  stageEnteredAt: string;
  stage: { id: string; name: string; color: string };
  pipeline: { id: string; name: string };
}

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// ── Alta y edición ──────────────────────────────────────────────────────────

function DealDialog({
  open,
  onClose,
  onSaved,
  personId,
  personLabel,
  contactId,
  deal,
  pipelines,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  personId: string;
  personLabel: string;
  contactId?: string | null;
  deal?: PersonDeal | null;
  pipelines: PipelineOption[];
}) {
  const { success } = useToast();
  const { data: session } = useSession();
  const canAssign = session?.user?.role !== "ejecutivo";
  const team = useTeam(open && canAssign);
  const isEdit = !!deal;

  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [probability, setProbability] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio del formulario al abrirlo
    setError("");
    setTitle(deal?.title ?? "");
    setAmount(deal ? String(deal.amount) : "");
    setCloseDate(dateOnly(deal?.expectedCloseDate ?? null));
    setProbability(deal?.probability == null ? "" : String(deal.probability));
    setOwnerId(deal?.ownerId ?? "");
    const pid = deal?.pipeline.id ?? defaultPipeline?.id ?? "";
    setPipelineId(pid);
    setStageId(deal?.stage.id ?? pipelines.find((p) => p.id === pid)?.stages.find((s) => s.outcome === "OPEN")?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [open]);

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const openStages = (pipeline?.stages ?? []).filter((s) => s.outcome === "OPEN");

  async function submit() {
    setError("");
    const value = amount.trim() === "" ? 0 : Number(amount);
    if (!Number.isFinite(value) || value < 0) return setError("El importe no puede ser negativo");
    const prob = probability.trim() === "" ? null : Number(probability);
    if (prob !== null && (!Number.isInteger(prob) || prob < 0 || prob > 100)) return setError("La probabilidad es un número entero de 0 a 100");
    if (isEdit && !title.trim()) return setError("Indica el título del negocio");
    setSaving(true);
    try {
      let res: Response;
      if (isEdit) {
        const body: Record<string, unknown> = { expectedVersion: deal!.version, title: title.trim(), amount: value, probability: prob, expectedCloseDate: closeDate || null };
        if (canAssign && ownerId !== (deal!.ownerId ?? "")) body.ownerId = ownerId || null;
        res = await fetch(`/api/crm/deals/${deal!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        const body: Record<string, unknown> = { personId, amount: value, probability: prob, expectedCloseDate: closeDate || null, pipelineId: pipelineId || undefined, stageId: stageId || undefined };
        if (title.trim()) body.title = title.trim();
        if (contactId) body.contactId = contactId;
        if (canAssign && ownerId) body.ownerId = ownerId;
        res = await fetch("/api/crm/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "version_conflict") onSaved();
        throw new Error(data.code === "version_conflict" ? "Alguien modificó este negocio mientras lo editabas. Ya se actualizó la lista: ábrelo de nuevo." : data.error ?? "No se pudo guardar el negocio");
      }
      success(isEdit ? "Negocio actualizado" : "Negocio creado");
      invalidateCrmLookups();
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el negocio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogPopup>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar negocio" : "Nuevo negocio"}</DialogTitle>
            <DialogDescription>{personLabel}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              {error && <Alert variant="error">{error}</Alert>}
              <Field>
                <FieldLabel>Título</FieldLabel>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isEdit ? undefined : personLabel} maxLength={200} autoFocus />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Importe</FieldLabel>
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </Field>
                <Field>
                  <FieldLabel>Cierre esperado</FieldLabel>
                  <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
                </Field>
              </div>
              {!isEdit && (
                <div className={cn("grid gap-3", pipelines.length > 1 && "sm:grid-cols-2")}>
                  {pipelines.length > 1 && (
                    <Field>
                      <FieldLabel>Pipeline</FieldLabel>
                      <SimpleSelect
                        ariaLabel="Pipeline"
                        value={pipelineId}
                        onChange={(id) => { setPipelineId(id); setStageId(pipelines.find((p) => p.id === id)?.stages.find((s) => s.outcome === "OPEN")?.id ?? ""); }}
                        options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel>Etapa</FieldLabel>
                    <SimpleSelect ariaLabel="Etapa" value={stageId} onChange={setStageId} options={openStages.map((s) => ({ value: s.id, label: s.name }))} />
                  </Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Probabilidad (%)</FieldLabel>
                  <Input type="number" inputMode="numeric" min={0} max={100} step={1} value={probability} onChange={(e) => setProbability(e.target.value)} placeholder="La de la etapa" />
                  <FieldDescription>Vacío = la probabilidad de la etapa.</FieldDescription>
                </Field>
                {canAssign && (
                  <Field>
                    <FieldLabel>Responsable</FieldLabel>
                    <SimpleSelect
                      ariaLabel="Responsable del negocio"
                      value={ownerId}
                      onChange={setOwnerId}
                      options={[{ value: "", label: isEdit ? "Sin responsable" : "El del contacto" }, ...team.map((u) => ({ value: u.id, label: u.name ?? u.email }))]}
                    />
                  </Field>
                )}
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" loading={saving}>{isEdit ? "Guardar cambios" : "Crear negocio"}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

// ── Motivo de pérdida ───────────────────────────────────────────────────────

function LostDialog({ open, deal, stageId, onClose, onDone }: { open: boolean; deal: PersonDeal | null; stageId: string; onClose: () => void; onDone: () => void }) {
  const { success, error: toastError } = useToast();
  const reasons = useLossReasons(open);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio al abrir
      setReasonId("");
      setNote("");
    }
  }, [open]);

  async function submit() {
    if (!deal || !reasonId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId, lostReasonId: reasonId, lostNote: note.trim() || null, expectedVersion: deal.version }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.code === "version_conflict" ? "El negocio cambió mientras decidías. Revisa su etapa e inténtalo de nuevo." : data.error ?? "No se pudo marcar como perdido");
      success("Negocio marcado como perdido");
      onDone();
      onClose();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo marcar como perdido");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogPopup>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>¿Por qué se perdió?</DialogTitle>
            <DialogDescription>{deal?.title}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              <Field>
                <FieldLabel>Motivo</FieldLabel>
                <SimpleSelect ariaLabel="Motivo de pérdida" value={reasonId} onChange={setReasonId} placeholder="Elige un motivo" options={reasons.map((r) => ({ value: r.id, label: r.name }))} />
              </Field>
              <Field>
                <FieldLabel>Nota (opcional)</FieldLabel>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={!reasonId} loading={saving}>Marcar como perdido</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

// ── Lista ───────────────────────────────────────────────────────────────────

export function PersonDeals({
  personId,
  personLabel,
  contactId,
  deals,
  onChanged,
  compact = false,
}: {
  personId: string;
  personLabel: string;
  contactId?: string | null;
  deals: PersonDeal[];
  onChanged: () => void;
  compact?: boolean;
}) {
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();
  const canArchive = session?.user?.role !== "ejecutivo";
  const { items: pipelines, currency } = usePipelines();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PersonDeal | null>(null);
  const [lost, setLost] = useState<{ deal: PersonDeal; stageId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const open = useMemo(() => deals.filter((d) => d.status === "OPEN"), [deals]);
  const closed = useMemo(() => deals.filter((d) => d.status !== "OPEN"), [deals]);
  const shown = compact ? open : showClosed ? deals : open;

  async function changeStage(deal: PersonDeal, stageId: string) {
    if (stageId === deal.stage.id) return;
    const stage = pipelines.flatMap((p) => p.stages).find((s) => s.id === stageId);
    if (stage?.outcome === "LOST") return setLost({ deal, stageId });
    setBusyId(deal.id);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId, expectedVersion: deal.version }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.code === "version_conflict" ? "El negocio cambió mientras lo movías. Se actualizó la lista." : data.error ?? "No se pudo mover el negocio");
      success(stage?.outcome === "WON" ? "¡Negocio ganado!" : "Etapa actualizada");
      onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo mover el negocio");
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function archive(deal: PersonDeal) {
    setBusyId(deal.id);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: deal.version, archived: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo archivar");
      success("Negocio archivado");
      onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo archivar");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Negocios</h3>
        <div className="flex items-center gap-1">
          {!compact && closed.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowClosed((v) => !v)} aria-pressed={showClosed}>
              {showClosed ? "Ocultar cerrados" : `Ver cerrados (${closed.length})`}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setCreating(true)}><Plus /> {compact ? "Abrir negocio" : "Nuevo negocio"}</Button>
        </div>
      </div>

      {shown.length === 0 ? (
        compact ? (
          <p className="text-sm text-muted-foreground">Sin negocios abiertos.</p>
        ) : (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
              <EmptyTitle>Sin negocios</EmptyTitle>
              <EmptyDescription>Abre un negocio para seguir una oportunidad de venta con este contacto.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus /> Nuevo negocio</Button>
          </Empty>
        )
      ) : (
        <ul className="space-y-2">
          {shown.map((deal) => {
            const pipeline = pipelines.find((p) => p.id === deal.pipeline.id);
            const tone = stageClasses(deal.stage.color);
            return (
              <li key={deal.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{deal.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={cn("size-1.5 rounded-full", tone.dot)} />{pipelines.length > 1 ? `${deal.pipeline.name} · ` : ""}{deal.stage.name}</span>
                      {deal.status === "WON" && <Badge size="sm" variant="success">Ganado</Badge>}
                      {deal.status === "LOST" && <Badge size="sm" variant="error">Perdido{deal.lostReason ? ` · ${deal.lostReason.name}` : ""}</Badge>}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatMoney(deal.amount, currency)}</span>
                  {!compact && (
                    <Menu>
                      <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Acciones de ${deal.title}`} disabled={busyId === deal.id} />}><MoreHorizontal /></MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem onClick={() => setEditing(deal)}><Pencil /> Editar</MenuItem>
                        {canArchive && <MenuItem onClick={() => archive(deal)}><Archive /> Archivar</MenuItem>}
                      </MenuPopup>
                    </Menu>
                  )}
                </div>
                <div className="mt-2.5">
                  <SimpleSelect
                    ariaLabel={`Etapa de ${deal.title}`}
                    value={deal.stage.id}
                    onChange={(id) => void changeStage(deal, id)}
                    disabled={busyId === deal.id || !pipeline}
                    options={(pipeline?.stages ?? [{ id: deal.stage.id, name: deal.stage.name }]).map((s) => ({ value: s.id, label: s.name }))}
                  />
                </div>
                {!compact && (
                  <p suppressHydrationWarning className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>En la etapa {timeInStage(deal.stageEnteredAt)}</span>
                    {deal.expectedCloseDate && deal.status === "OPEN" && <span>Cierre esperado: {shortDate(deal.expectedCloseDate)}</span>}
                    {deal.closedAt && <span>Cerrado: {shortDate(deal.closedAt)}</span>}
                    <span>{deal.owner?.name ? `Responsable: ${deal.owner.name}` : "Sin responsable"}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DealDialog open={creating} onClose={() => setCreating(false)} onSaved={onChanged} personId={personId} personLabel={personLabel} contactId={contactId} pipelines={pipelines} />
      {editing && <DealDialog open onClose={() => setEditing(null)} onSaved={onChanged} personId={personId} personLabel={personLabel} deal={editing} pipelines={pipelines} />}
      <LostDialog open={!!lost} deal={lost?.deal ?? null} stageId={lost?.stageId ?? ""} onClose={() => setLost(null)} onDone={onChanged} />
    </div>
  );
}
