"use client";

import { useEffect, useRef, type DependencyList } from "react";

/**
 * Corre `run` al montar y cada vez que cambia algo de `deps`: cargar datos de
 * un API (`fetchItems` que pone `loading` y luego los datos) o reiniciar un
 * formulario cuando se abre su modal.
 *
 * Existe por la regla `react-hooks/set-state-in-effect`: marca cualquier
 * función que haga setState dentro de un efecto, también las cargas de datos,
 * que son el caso para el que existen los efectos. Antes cada pantalla repetía
 * el `eslint-disable` (más de 100); aquí queda una sola excepción documentada.
 * Para leer del navegador (matchMedia, localStorage) sin parpadeo, mejor
 * `useSyncExternalStore`; para refrescar periódicamente, `usePoll()`.
 *
 * `run` puede ser una función nueva en cada render: se llama siempre la última,
 * y solo `deps` decide cuándo.
 */
export function useRunOnChange(run: () => unknown, deps: DependencyList): void {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    void latest.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` lo decide quien llama, como en useEffect
  }, deps);
}
