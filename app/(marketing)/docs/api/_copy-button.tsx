"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/app/components/ui/cn";

/** Copia el bloque de código al portapapeles con confirmación breve. */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Navegadores sin permiso de Clipboard API: fallback clásico.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(area);
    }
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Código copiado" : "Copiar código"}
      title={copied ? "Copiado" : "Copiar"}
      className={cn(
        "absolute right-2 top-2 z-10 inline-flex h-8 items-center gap-1.5 rounded-md border border-code-foreground/20 bg-code-foreground/10 px-2 text-[11px] font-medium text-code-foreground transition-colors hover:bg-code-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-code-foreground",
        className
      )}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      <span>{copied ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
