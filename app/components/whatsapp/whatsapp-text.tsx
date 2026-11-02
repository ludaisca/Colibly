import { Fragment, type ReactNode } from "react";
import { parseWhatsAppFormat, type FormatNode } from "@/lib/whatsapp/format";

// Texto con el formato de WhatsApp (*negrita*, _cursiva_, ~tachado~, `código`,
// ```bloque```) convertido en elementos React — nunca HTML inyectado.

function render(nodes: FormatNode[], key = ""): ReactNode {
  return nodes.map((node, index) => {
    const k = `${key}${index}`;
    if (typeof node === "string") return <Fragment key={k}>{node}</Fragment>;
    switch (node.kind) {
      case "bold":
        return <strong key={k} className="font-semibold">{render(node.children, `${k}.`)}</strong>;
      case "italic":
        return <em key={k}>{render(node.children, `${k}.`)}</em>;
      case "strike":
        return <s key={k}>{render(node.children, `${k}.`)}</s>;
      case "code":
        return <code key={k} className="rounded bg-surface-light px-1 py-px font-mono text-[0.9em]">{node.children[0] as string}</code>;
      case "mono":
        return <span key={k} className="font-mono text-[0.92em]">{node.children[0] as string}</span>;
    }
  });
}

export function WhatsAppText({ text }: { text: string }) {
  return <>{render(parseWhatsAppFormat(text))}</>;
}
