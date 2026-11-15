"use client";

import { useState } from "react";
import { cn } from "./cn";

// Texto largo en dos líneas con "Ver todo" (QA-027: las instrucciones de un
// bot ocupaban la pantalla entera).
export function ClampedText({ text, lines = 2, className }: { text: string | null | undefined; lines?: 2 | 3; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-muted">—</span>;
  const long = text.length > 160 || text.split("\n").length > lines;
  return (
    <span className={cn("block", className)}>
      <span className={cn("block whitespace-pre-line", !open && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>{text}</span>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-accent-ink underline underline-offset-2">
          {open ? "Ver menos" : "Ver todo"}
        </button>
      )}
    </span>
  );
}
