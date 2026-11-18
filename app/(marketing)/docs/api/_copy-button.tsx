"use client";

import { useEffect } from "react";

// Un solo manejador para todos los botones "Copiar" de la documentación
// (<button data-copy-code> dentro de cada <pre>, ver _ui.tsx:Code). Antes cada
// bloque montaba su propio componente con el texto como prop, que viajaba
// repetido en el payload de la página (QA-010).
export function CodeCopy() {
  useEffect(() => {
    async function onClick(ev: MouseEvent) {
      const button = (ev.target as Element | null)?.closest?.("button[data-copy-code]");
      if (!(button instanceof HTMLButtonElement)) return;
      const text = button.parentElement?.querySelector("code")?.textContent ?? "";
      if (!(await copyText(text))) return;
      button.textContent = "Copiado";
      button.setAttribute("aria-label", "Código copiado");
      window.setTimeout(() => {
        button.textContent = "Copiar";
        button.setAttribute("aria-label", "Copiar código");
      }, 2000);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Navegadores sin permiso de Clipboard API: fallback clásico.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }
}
