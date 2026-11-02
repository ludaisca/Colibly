"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { macroActionsSummary, type MacroAction } from "@/lib/macros/types";

interface MacroRow {
  id: string;
  name: string;
  description: string | null;
  actions: MacroAction[];
}

export function MacroPickerModal({
  open,
  onClose,
  chatId,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  chatId: string;
  onApplied?: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [macros, setMacros] = useState<MacroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/macros");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar macros");
      setMacros(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar macros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open
    void load();
  }, [open, load]);

  async function run(macro: MacroRow) {
    setRunning(macro.id);
    try {
      const res = await fetch(`/api/whatsapp/macros/${macro.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo aplicar la macro");
      success(`Macro aplicada: ${macro.name}`);
      onApplied?.();
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo aplicar la macro");
    } finally {
      setRunning(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aplicar macro"
      description="Se ejecutan en orden sobre este chat."
      size="md"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      {loading ? (
        <div className="flex items-center justify-center py-8"><Spinner /></div>
      ) : error ? (
        <p className="py-4 text-sm text-danger">{error}</p>
      ) : macros.length === 0 ? (
        <div className="py-4 text-sm text-muted">
          No hay macros todavía.{" "}
          <Link href="/configuracion/macros" className="text-accent-ink hover:underline" onClick={onClose}>
            Crea la primera
          </Link>.
        </div>
      ) : (
        <div className="space-y-2">
          {macros.map((macro) => (
            <button
              key={macro.id}
              type="button"
              onClick={() => void run(macro)}
              disabled={running !== null}
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-light p-3 text-left transition-colors hover:border-accent-muted disabled:opacity-50"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-accent-subtle text-accent-ink">
                {running === macro.id ? <Spinner /> : <Zap size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{macro.name}</span>
                {macro.description && <span className="mt-0.5 block truncate text-xs text-muted">{macro.description}</span>}
                <span className="mt-1 block truncate text-[11px] text-muted-darker">{macroActionsSummary(macro.actions)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
