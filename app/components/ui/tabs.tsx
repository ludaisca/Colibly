"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TabList, Tab } from "@astryxdesign/core/TabList";

// Adaptador (rediseño con Astryx): TabList de Astryx (flechas, Inicio/Fin,
// foco itinerante). Solo se pinta el panel activo.
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
  const baseId = useId();
  const active = items.find((item) => item.id === value);
  return (
    <div>
      <TabList role="tablist" aria-label={label} value={value} onChange={(next) => { if (next !== value) onChange(next as T); }} hasDivider>
        {items.map((item) => (
          <Tab key={item.id} value={item.id} label={item.label} panelId={`${baseId}-panel`} />
        ))}
      </TabList>
      <div role="tabpanel" id={`${baseId}-panel`} aria-label={active?.label} className="pt-5">
        {children}
      </div>
    </div>
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
