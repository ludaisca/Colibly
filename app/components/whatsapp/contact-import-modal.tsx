"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { Select } from "@/app/components/ui/select";
import { useToast } from "@/app/components/ui/toast";
import { parseCsvTable } from "@/lib/whatsapp/parse-csv";
import {
  MAX_IMPORT_ROWS,
  MAX_IMPORT_TAGS,
  buildImportPlan,
  guessMapping,
  mappingError,
  type ColumnTarget,
  type FieldDefinition,
} from "@/lib/contacts/import-mapping";

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

// Valor del <select> de cada columna ↔ ColumnTarget.
function targetValue(target: ColumnTarget): string {
  return target.kind === "field" ? `field:${target.definitionId}` : target.kind;
}
function parseTarget(value: string): ColumnTarget {
  if (value.startsWith("field:")) return { kind: "field", definitionId: value.slice(6) };
  return { kind: value as "phone" | "name" | "tag" | "ignore" };
}

// Importación en dos pasos (F3): archivo → mapeo de columnas con vista
// previa. La vista previa usa la misma lógica pura que el servidor
// (lib/contacts/import-mapping.ts), así los números coinciden.
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
  const [table, setTable] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([]);
  const [step, setStep] = useState<"file" | "map">("file");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveAccountId = accountId || accounts[0]?.id || "";
  const account = accounts.find((item) => item.id === effectiveAccountId);

  // Campos personalizados de la cuenta destino (son por cuenta).
  useEffect(() => {
    if (!open || !account) return;
    const param = !account.channel || account.channel === "WHATSAPP" ? "waAccountId" : "channelAccountId";
    let cancelled = false;
    fetch(`/api/whatsapp/custom-fields?${param}=${account.id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setDefinitions(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDefinitions([]); });
    return () => { cancelled = true; };
  }, [open, account]);

  const plan = useMemo(
    () => (step === "map" ? buildImportPlan(table, mapping, definitions) : null),
    [step, table, mapping, definitions]
  );
  const mapError = step === "map" ? mappingError(mapping) : null;

  function reset() {
    setFileName("");
    setCsv("");
    setTable({ headers: [], rows: [] });
    setMapping([]);
    setStep("file");
    setError(null);
  }

  async function onFile(file: File | null) {
    setError(null);
    if (!file) {
      reset();
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("El archivo supera 2 MB");
      return;
    }
    const text = await file.text();
    const parsed = parseCsvTable(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setError("El archivo no tiene filas (la primera fila debe ser la cabecera)");
      return;
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setError(`Máximo ${MAX_IMPORT_ROWS.toLocaleString("es-MX")} filas por importación`);
      return;
    }
    setFileName(file.name);
    setCsv(text);
    setTable(parsed);
  }

  async function submit() {
    if (!effectiveAccountId || !csv || mapError) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: effectiveAccountId, csv, mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar");
      const extra = data.issueCount ? ` · ${data.issueCount} aviso(s)` : "";
      success(`${data.imported} contacto(s) importados, ${data.skipped} ya existían${extra}`);
      onImported();
      onClose();
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo importar";
      setError(message);
      toastError(message);
    } finally {
      setImporting(false);
    }
  }

  const sample = (column: number) => table.rows.find((row) => (row[column] ?? "").trim())?.[column] ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar contactos"
      description={step === "file" ? "Sube un CSV con cabecera. En el siguiente paso eliges qué es cada columna." : "Elige qué es cada columna y revisa la vista previa."}
      size={step === "map" ? "lg" : "md"}
      footer={
        step === "file" ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={() => {
                // Se propone con los campos de la cuenta elegida AHORA (pudo cambiar después de subir el archivo).
                setMapping(guessMapping(table.headers, definitions));
                setStep("map");
              }}
              disabled={!effectiveAccountId || !csv}
            >
              Siguiente
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep("file")}>Atrás</Button>
            <Button icon={Upload} onClick={() => void submit()} disabled={!!mapError || !plan?.rows.length || importing || (plan?.tagNames.length ?? 0) > MAX_IMPORT_TAGS}>
              {importing ? "Importando…" : `Importar ${plan?.rows.length ?? 0}`}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-[9px] bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

        {step === "file" ? (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-darker" htmlFor="import-account">Cuenta destino</label>
              <Select id="import-account" value={effectiveAccountId} onChange={(event) => setAccountId(event.target.value)}>
                {accounts.length === 0 && <option value="">No hay cuentas disponibles</option>}
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.channel ? ` · ${CHANNEL_LABEL[item.channel] ?? item.channel}` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-micro text-muted-darker">Las etiquetas y los campos personalizados son de esta cuenta.</p>
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
              <p className="mt-1 text-micro text-muted-darker">Máximo 2 MB y 5,000 filas.</p>
            </div>

            {fileName && (
              <p className="rounded-lg border border-border bg-surface-light p-3 text-xs text-foreground">
                {fileName} · {table.rows.length} fila(s) · {table.headers.length} columna(s)
              </p>
            )}
          </>
        ) : (
          <>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-light text-left text-micro uppercase text-muted-darker">
                  <tr>
                    <th className="px-3 py-2 font-medium">Columna del archivo</th>
                    <th className="px-3 py-2 font-medium">Ejemplo</th>
                    <th className="px-3 py-2 font-medium">Importar como</th>
                  </tr>
                </thead>
                <tbody>
                  {table.headers.map((header, column) => (
                    <tr key={`${header}-${column}`} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">{header || `Columna ${column + 1}`}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-xs text-muted" title={sample(column)}>{sample(column) || "—"}</td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={`Importar ${header} como`}
                          value={targetValue(mapping[column] ?? { kind: "ignore" })}
                          onChange={(event) =>
                            setMapping((prev) => prev.map((target, index) => (index === column ? parseTarget(event.target.value) : target)))
                          }
                        >
                          <option value="ignore">No importar</option>
                          <option value="phone">Teléfono</option>
                          <option value="name">Nombre</option>
                          <option value="tag">Etiqueta(s)</option>
                          {definitions.map((def) => (
                            <option key={def.id} value={`field:${def.id}`}>Campo: {def.label}</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {mapError ? (
              <p className="rounded-[9px] bg-warning-bg px-3 py-2 text-xs text-warning">{mapError}</p>
            ) : plan && (
              <div className="space-y-2 rounded-lg border border-border bg-surface-light p-3 text-xs">
                <p className="text-foreground">
                  <span className="font-semibold">{plan.rows.length}</span> contacto(s) listos
                  {plan.duplicatesInFile > 0 && ` · ${plan.duplicatesInFile} repetido(s) en el archivo`}
                  {plan.tagNames.length > 0 && ` · ${plan.tagNames.length} etiqueta(s): ${plan.tagNames.slice(0, 5).join(", ")}${plan.tagNames.length > 5 ? "…" : ""}`}
                </p>
                <p className="text-muted-darker">Los teléfonos que ya existen en la cuenta se omiten.</p>
                {plan.tagNames.length > MAX_IMPORT_TAGS && (
                  <p className="text-danger">Máximo {MAX_IMPORT_TAGS} etiquetas distintas por importación.</p>
                )}
                {plan.issues.length > 0 && (
                  <div>
                    <p className="font-medium text-warning">{plan.issues.length} aviso(s):</p>
                    <ul className="mt-1 space-y-0.5 text-muted">
                      {plan.issues.slice(0, 6).map((issue, index) => (
                        <li key={index}>Fila {issue.line}: {issue.message}</li>
                      ))}
                      {plan.issues.length > 6 && <li>… y {plan.issues.length - 6} más</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
