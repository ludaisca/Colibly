"use client";

import { SessionProvider } from "next-auth/react";
import { Theme } from "@astryxdesign/core/theme";
import { ToastProvider } from "@/app/components/ui/toast";
import { useApplyStoredTheme } from "@/app/components/theme-provider";
import { themes, defaultThemeSlug } from "@/src/astryx-themes";

// `sessionless` (sitio público en su propio dominio): sesión fija en null, sin
// pedir /api/auth/session ni al montar ni al volver a la pestaña.
export function Providers({ children, sessionless = false }: { children: React.ReactNode; sessionless?: boolean }) {
  useApplyStoredTheme();
  return (
    // Astryx (rediseño): mode="system" sigue el `color-scheme` que el script de
    // theme-provider.tsx fija en <html> antes de pintar, así el modo claro/oscuro
    // tiene una sola fuente de verdad y no parpadea. El <div> que crea Theme
    // usa `display: contents` (globals.css) para no alterar el layout.
    <Theme theme={themes[defaultThemeSlug]} mode="system">
      <SessionProvider {...(sessionless ? { session: null, refetchOnWindowFocus: false } : {})}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </SessionProvider>
    </Theme>
  );
}
