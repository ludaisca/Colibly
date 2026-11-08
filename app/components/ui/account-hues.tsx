"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { hueClassIn, type AccountHues } from "./hue";

// Mapa cuenta → tono de la organización (lib/accounts/hues.ts), calculado en
// el layout del panel. Fuera del proveedor se usa el tono del hash.
const AccountHuesContext = createContext<AccountHues | null>(null);

export function AccountHuesProvider({ hues, children }: { hues: AccountHues | null; children: ReactNode }) {
  return <AccountHuesContext.Provider value={hues}>{children}</AccountHuesContext.Provider>;
}

/** `(accountId) => "hue-N"` con el tono asignado en la organización. */
export function useHueClass(): (id: string) => string {
  const hues = useContext(AccountHuesContext);
  return useCallback((id: string) => hueClassIn(hues, id), [hues]);
}
