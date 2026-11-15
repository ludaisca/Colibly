"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/app/components/ui/button";

// Valor copiable (API key, secreto de webhook, URL) — mismo aspecto que el
// paso "Cuenta conectada" de whatsapp/cuentas/_form.tsx.
export function SecretField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-darker mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-surface px-3 py-2 rounded-lg text-xs font-mono break-all">{value}</code>
        <Button type="button" variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
