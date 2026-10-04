"use client";

import { useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";

// Valor copiable (API key, secreto de webhook, URL) — mismo aspecto que el
// paso "Cuenta conectada" de whatsapp/cuentas/_form.tsx.
export function SecretField({ label, value }: { label: string; value: string }) {
  const { error: toastError } = useToast();
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLElement>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso del portapapeles o contexto no seguro: se deja el valor
      // seleccionado para que Ctrl+C funcione.
      const el = valueRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      toastError("No se pudo copiar automáticamente. El texto quedó seleccionado: presiona Ctrl+C.");
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-darker uppercase tracking-wider mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <code ref={valueRef} className="flex-1 bg-surface px-3 py-2 rounded-lg text-xs font-mono break-all">{value}</code>
        <Button type="button" variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <span role="status" aria-live="polite" className="sr-only">{copied ? "Copiado" : ""}</span>
      </div>
    </div>
  );
}
