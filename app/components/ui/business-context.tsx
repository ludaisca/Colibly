"use client";

import { createContext, useContext, type ReactNode } from "react";

// Nombre del negocio (Organization.name) para componentes cliente que lo
// necesitan sin pedirlo a la API: p. ej. la variable {{negocio}} de las
// respuestas rápidas. Lo provee DashboardShell.
const BusinessNameContext = createContext<string | null>(null);

export function BusinessNameProvider({ name, children }: { name: string | null; children: ReactNode }) {
  return <BusinessNameContext.Provider value={name}>{children}</BusinessNameContext.Provider>;
}

export function useBusinessName(): string | null {
  return useContext(BusinessNameContext);
}
