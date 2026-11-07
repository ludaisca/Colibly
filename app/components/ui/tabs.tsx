"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs as Base } from "@base-ui/react/tabs";

// Pestañas sobre Base UI (2026-11-07; antes HeroUI). Flechas para moverse
// entre pestañas, Inicio/Fin, foco itinerante y panel enlazado. Andén: la
// pestaña activa se marca en tinta. Solo se pinta el panel activo.
//
// Web Design Guidelines: la pestaña de una página va en la URL (`?tab=`), así
// el enlace se puede compartir y recargar sin perderla → `useUrlTab`.

interface TabsProps<T extends string> {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  children: ReactNode;
}

export function Tabs<T extends string>({ items, value, onChange, label, children }: TabsProps<T>) {
  return (
    <Base.Root value={value} onValueChange={(next) => { if (next !== value) onChange(next as T); }}>
      <Base.List aria-label={label} className="relative flex gap-1 overflow-x-auto border-b border-border scrollbar-none">
        {items.map((item) => (
          <Base.Tab
            key={item.id}
            value={item.id}
            className="relative inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-t-[9px] px-3.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-light hover:text-foreground data-[selected]:text-foreground"
          >
            {item.label}
          </Base.Tab>
        ))}
        <Base.Indicator className="absolute bottom-0 left-[var(--active-tab-left)] h-0.5 w-[var(--active-tab-width)] rounded-full bg-foreground transition-[left,width] duration-200 ease-brand motion-reduce:transition-none" />
      </Base.List>
      {items.map((item) => (
        <Base.Panel key={item.id} value={item.id} className="pt-5">
          {value === item.id ? children : null}
        </Base.Panel>
      ))}
    </Base.Root>
  );
}

/**
 * Pestaña activa guardada en la URL (`?tab=<id>` por defecto). Cambiar de
 * pestaña reemplaza la entrada del historial (no la acumula) y conserva el
 * resto de los parámetros. Un valor desconocido cae en `fallback`.
 * Requiere `<Suspense>` alrededor de la página (usa `useSearchParams`).
 */
export function useUrlTab<T extends string>(ids: readonly T[], fallback: T, param = "tab"): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(param);
  const [tab, setTab] = useState<T>(ids.includes(fromUrl as T) ? (fromUrl as T) : fallback);

  const change = useCallback(
    (next: T) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete(param);
      else params.set(param, next);
      const query = params.toString();
      // Sin cambio real en la URL no se navega: un replace a la misma URL
      // vuelve a pedir la página y, si algo vuelve a avisar del mismo valor,
      // se forma un ciclo de peticiones.
      if (query === searchParams.toString()) return;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [fallback, param, pathname, router, searchParams]
  );

  return [tab, change];
}
