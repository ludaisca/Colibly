"use client";

import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LayerProvider } from "@astryxdesign/core/Layer";
import esES from "@astryxdesign/core/locales/es-ES.generated.js";
import { astryxEsMxExtra } from "@/lib/astryx/es-mx";
import { ToastProvider } from "@/app/components/ui/toast";
import { useApplyStoredTheme } from "@/app/components/theme-provider";
import { themes, defaultThemeSlug } from "@/src/astryx-themes";

// `sessionless` (sitio público en su propio dominio): sesión fija en null, sin
// pedir /api/auth/session ni al montar ni al volver a la pestaña.
// Catálogo es-ES de Astryx + los textos que aún le faltan (lib/astryx/es-mx.ts).
const ASTRYX_MESSAGES = { "es-MX": { ...esES, ...astryxEsMxExtra } };

export function Providers({ children, sessionless = false }: { children: React.ReactNode; sessionless?: boolean }) {
  useApplyStoredTheme();
  return (
    // Astryx (rediseño): mode="system" sigue el `color-scheme` que el script de
    // theme-provider.tsx fija en <html> antes de pintar, así el modo claro/oscuro
    // tiene una sola fuente de verdad y no parpadea. El <div> que crea Theme
    // usa `display: contents` (globals.css) para no alterar el layout.
    <Theme theme={themes[defaultThemeSlug]} mode="system">
      {/* Textos de Astryx ("Obligatorio", "Cargando"…) en español; fechas y
          números con formato de México. El catálogo es-ES sirve para es-MX. */}
      <InternationalizationProvider locale="es-MX" messages={ASTRYX_MESSAGES}>
      {/* Los enlaces de Astryx navegan con el router de Next (sin recarga). */}
      {/* Capas de Astryx (toasts, menús, diálogos) comparten un solo contexto. */}
      <LayerProvider>
      <LinkProvider component={Link}>
        <SessionProvider {...(sessionless ? { session: null, refetchOnWindowFocus: false } : {})}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SessionProvider>
      </LinkProvider>
      </LayerProvider>
      </InternationalizationProvider>
    </Theme>
  );
}
