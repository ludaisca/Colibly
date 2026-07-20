"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Barra de progreso de navegación, sin dependencias (nprogress-style casero).
// Next.js App Router no expone un evento público "la navegación empezó" —
// se detecta de forma optimista al hacer clic en cualquier <a> interno (así
// es como se navega en toda la app, ver <Link> en el sidebar), y
// se cierra cuando el pathname/searchParams realmente cambian (la señal de
// que el nuevo segmento ya se montó). prefers-reduced-motion ya lo neutraliza
// automáticamente vía la regla global en globals.css (son transiciones CSS
// normales, no motion/JS).
export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const key = `${pathname}?${searchParams.toString()}`;
  const prevKeyRef = useRef(key);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (anchor.origin !== window.location.origin) return;
      if (href === window.location.pathname + window.location.search) return;

      setVisible(true);
      setProgress(15);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setProgress((p) => (p < 85 ? p + (85 - p) * 0.1 : p));
      }, 150);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setProgress(100);
    const t = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none" aria-hidden="true">
      <div
        className="h-full bg-accent transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
      />
    </div>
  );
}
