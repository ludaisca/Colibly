"use client";

import { Info } from "lucide-react";
import { GLOSSARY, type GlossaryKey } from "@/lib/help/glossary";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

// Ícono (i) con "¿Qué es esto?": la explicación sale del glosario
// (lib/help/glossary.ts) o de un texto propio. Es un botón: se abre con el
// teclado y el texto también queda en aria-label para lectores de pantalla.
export function HelpHint({ term, text, className }: { term?: GlossaryKey; text?: string; className?: string }) {
  const label = text ?? (term ? GLOSSARY[term] : "");
  if (!label) return null;
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={`¿Qué es esto? ${label}`}
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full p-1 text-muted-darker hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong", className)}
      >
        <Info size={15} aria-hidden />
      </button>
    </Tooltip>
  );
}
