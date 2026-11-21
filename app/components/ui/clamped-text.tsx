"use client";

import { useState } from "react";
import { cn } from "./cn";
import { Button } from "./button";

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
        <span className="mt-1 block text-xs">
          <Button variant="link" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Ver menos" : "Ver todo"}
          </Button>
        </span>
      )}
    </span>
  );
}
