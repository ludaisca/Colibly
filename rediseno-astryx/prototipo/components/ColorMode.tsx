'use client';

import {createContext, use, useSyncExternalStore} from 'react';

// Igual que Colibly: el tema lo controla la app (no el sistema), claro por
// defecto y guardado en localStorage con la clave `theme`.
export type ColorMode = 'light' | 'dark';
const KEY = 'theme';
const listeners = new Set<() => void>();

function read(): ColorMode {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

export function setColorMode(mode: ColorMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Modo privado o almacenamiento bloqueado: el cambio vive solo en memoria.
  }
  listeners.forEach((l) => l());
}

/** Lee el modo guardado; en el servidor (y en la hidratación) siempre 'light'. */
export function useStoredColorMode(): ColorMode {
  return useSyncExternalStore(subscribe, read, () => 'light');
}

const ColorModeContext = createContext<{mode: ColorMode; toggle: () => void}>({
  mode: 'light',
  toggle: () => {},
});

export const ColorModeProvider = ColorModeContext.Provider;
export const useColorMode = () => use(ColorModeContext);
