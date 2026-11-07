"use client";

import { Tooltip } from "./tooltip";
import { useEffect, useState, type RefObject } from "react";
import { Bold, Code, Italic, Strikethrough, type LucideIcon } from "lucide-react";
import { toggleFormat, type FormatKind } from "@/lib/whatsapp/format";
import { cn } from "./cn";

type Kind = Exclude<FormatKind, "code">;

const BUTTONS: Array<{ kind: Kind; icon: LucideIcon; label: string; keys: string }> = [
  { kind: "bold", icon: Bold, label: "Negrita", keys: "Ctrl+B" },
  { kind: "italic", icon: Italic, label: "Cursiva", keys: "Ctrl+I" },
  { kind: "strike", icon: Strikethrough, label: "Tachado", keys: "Ctrl+Shift+X" },
  { kind: "mono", icon: Code, label: "Monoespaciado", keys: "Ctrl+Shift+M" },
];

// Barra flotante de formato (patrón "floating-toolbar" de Tesela) para un
// <textarea> con el formato de WhatsApp: aparece encima del campo cuando hay
// texto seleccionado y pone los marcadores (*, _, ~, ```). Va anclada al campo
// y no a la selección: un textarea no da la posición del texto seleccionado
// sin medir con un clon, y eso es frágil. El contenedor del textarea debe ser
// `relative`. También agrega Ctrl/⌘+B, I, Shift+X y Shift+M al campo.
export function FormatToolbar({ textareaRef, value, onChange, className }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  function apply(kind: Kind) {
    const ta = textareaRef.current;
    if (!ta) return;
    const next = toggleFormat(value, ta.selectionStart, ta.selectionEnd, kind);
    onChange(next.text);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(next.start, next.end);
      setVisible(next.start !== next.end);
    });
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const update = () => setVisible(document.activeElement === ta && ta.selectionStart !== ta.selectionEnd);
    const onBlur = () => setVisible(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const kind: Kind | null =
        event.code === "KeyB" && !event.shiftKey ? "bold"
        : event.code === "KeyI" && !event.shiftKey ? "italic"
        : event.code === "KeyX" && event.shiftKey ? "strike"
        : event.code === "KeyM" && event.shiftKey ? "mono"
        : null;
      if (!kind) return;
      event.preventDefault();
      apply(kind);
    };
    document.addEventListener("selectionchange", update);
    ta.addEventListener("select", update);
    ta.addEventListener("keyup", update);
    ta.addEventListener("mouseup", update);
    ta.addEventListener("blur", onBlur);
    ta.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("selectionchange", update);
      ta.removeEventListener("select", update);
      ta.removeEventListener("keyup", update);
      ta.removeEventListener("mouseup", update);
      ta.removeEventListener("blur", onBlur);
      ta.removeEventListener("keydown", onKeyDown);
    };
  });

  if (!visible) return null;
  return (
    <div
      role="toolbar"
      aria-label="Formato del texto"
      className={cn(
        "absolute bottom-full left-0 z-20 mb-2 flex animate-scale-in items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-lg",
        className
      )}
      // Sin esto, el clic le quita el foco al textarea y se pierde la selección.
      onMouseDown={(event) => event.preventDefault()}
    >
      {BUTTONS.map(({ kind, icon: Icon, label, keys }) => (
        <Tooltip label={`${label} (${keys})`} key={kind}><button
          type="button"
          onClick={() => apply(kind)}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-darker transition-colors hover:bg-surface-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong"
        >
          <Icon size={15} />
        </button></Tooltip>
      ))}
    </div>
  );
}
