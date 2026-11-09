"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

// Tema claro/oscuro sin next-themes (2026-11-08): menos JS y sin su proveedor
// de cliente. El script de arranque vive en el <head> del layout raíz
// (componente de servidor) y el estado sale del propio <html>: la clase
// `dark`/`light` es la única verdad. En las páginas de notFound() Next las
// renderiza en el cliente; ahí el script no corre (ver useApplyStoredTheme).
//
// Compatible con lo que guardaba next-themes: misma clave `theme` en
// localStorage y valores "light" | "dark" | "system".

const STORAGE_KEY = "theme";
type Theme = "light" | "dark";

/** Script que corre antes de pintar: aplica la clase guardada (claro por defecto). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.classList.toggle("light",!d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Sin transiciones durante el cambio (lo que hacía disableTransitionOnChange).
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme !== "dark");
  root.style.colorScheme = theme;
  void getComputedStyle(document.body).opacity; // fuerza el repintado sin transición
  setTimeout(() => style.remove(), 1);
}

function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === "dark") return "dark";
    if (t === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    // almacenamiento bloqueado: claro
  }
  return "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  // Otra pestaña cambió el tema.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) applyTheme(storedTheme());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
const getServerSnapshot = (): Theme | undefined => undefined;

/** `resolvedTheme` es `undefined` en el servidor y durante la hidratación. */
export function useTheme() {
  const resolvedTheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((theme: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // sin almacenamiento el cambio dura lo que la página
    }
    applyTheme(theme);
  }, []);
  return { resolvedTheme, setTheme };
}

/**
 * Respaldo del script de arranque. Cuando una página llama a notFound(), Next
 * 16 entrega un documento de error y renderiza todo en el cliente, así que el
 * script del <head> nunca corre (y React avisa en desarrollo de ese <script>).
 * Si al montar el <html> no tiene clase de tema, se aplica la guardada.
 */
export function useApplyStoredTheme() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("dark") && !root.classList.contains("light")) {
      const theme = storedTheme();
      root.classList.add(theme);
      root.style.colorScheme = theme;
    }
  }, []);
}
