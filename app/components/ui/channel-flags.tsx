"use client";

import { createContext, useContext } from "react";

// Canales visibles para la organización (habilitados o con cuentas ya
// conectadas, ver app/(dashboard)/layout.tsx). Lo usan las pestañas de
// "Canales" para no ofrecer un canal desactivado.
export interface ChannelFlags {
  telegram: boolean;
  messenger: boolean;
  instagram: boolean;
  webchat: boolean;
  // WhatsApp por QR (no oficial): solo con la bandera del operador.
  whatsappWeb: boolean;
}

const ChannelFlagsContext = createContext<ChannelFlags | null>(null);

export function ChannelFlagsProvider({ flags, children }: { flags: ChannelFlags | null; children: React.ReactNode }) {
  return <ChannelFlagsContext.Provider value={flags}>{children}</ChannelFlagsContext.Provider>;
}

export function useChannelFlags(): ChannelFlags | null {
  return useContext(ChannelFlagsContext);
}
