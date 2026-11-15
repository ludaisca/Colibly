"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/app/components/ui/toast";
import { useApplyStoredTheme } from "@/app/components/theme-provider";

// `sessionless` (sitio público en su propio dominio): sesión fija en null, sin
// pedir /api/auth/session ni al montar ni al volver a la pestaña.
export function Providers({ children, sessionless = false }: { children: React.ReactNode; sessionless?: boolean }) {
  useApplyStoredTheme();
  return (
    <SessionProvider {...(sessionless ? { session: null, refetchOnWindowFocus: false } : {})}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
