"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { Select } from "@/app/components/ui/select";
import { useToast } from "@/app/components/ui/toast";
import { parseCsv, type ParsedCsvRow } from "@/lib/whatsapp/parse-csv";

interface AccountOption {
  id: string;
  name: string;
  phoneNumber: string | null;
  channel?: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Chat web",
};

export function ContactImportModal({
  open,
  onClose,
  accounts,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  onImported: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveAccountId = accountId || accounts[0]?.id || "";

  async function onFile(file: File | null) {
    setError(null);
    if (!file) {
      setFileName("");
      setCsv("");
      setRows([]);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("El archivo supera 2 MB");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    setFileName(file.name);
    setCsv(text);
    setRows(parsed.rows);
  }

  async function submit() {
    if (!effectiveAccountId || !csv) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: effectiveAccountId, csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar");
      success(`${data.imported} contacto(s) importados, ${data.skipped} ya existían`);
      onImported();
      onClose();
      setFileName("");
      setCsv("");
      setRows([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo importar";
      setError(message);
      toastError(message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar contactos"
      description="Sube un CSV con cabecera teléfono/nombre (o phone/name). Los números repetidos se omiten."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button icon={Upload} onClick={() => void submit()} disabled={!effectiveAccountId || !csv || importing}>
            {importing ? "Importando…" : "Importar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-[9px] bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-darker" htmlFor="import-account">Cuenta destino</label>
          <Select id="import-account" value={effectiveAccountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.length === 0 && <option value="">No hay cuentas disponibles</option>}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}{account.channel ? ` · ${CHANNEL_LABEL[account.channel] ?? account.channel}` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-darker" htmlFor="import-file">Archivo CSV</label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-[9px] border border-border bg-surface-light px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-[9px] file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground hover:file:bg-accent-subtle"
          />
          <p className="mt-1 text-[11px] text-muted-darker">Máximo 2 MB y 5,000 filas.</p>
        </div>

        {fileName && (
          <div className="rounded-lg border border-border bg-surface-light p-3">
            <p className="text-xs font-medium text-foreground">{fileName}</p>
            <p className="mt-0.5 text-[11px] text-muted">{rows.length} fila(s) detectadas</p>
            {rows.length > 0 && (
              <div className="mt-2 space-y-1">
                {rows.slice(0, 5).map((row) => (
                  <p key={row.id} className="truncate text-[11px] text-muted">
                    {row.phoneNumber || "sin teléfono"}{row.contactName ? ` · ${row.contactName}` : ""}
                  </p>
                ))}
                {rows.length > 5 && <p className="text-[11px] text-muted-darker">… y {rows.length - 5} más</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
