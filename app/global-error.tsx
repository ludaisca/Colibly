"use client";

import { useEffect } from "react";
import { BRAND_NAME, BRAND_CONTACT_EMAIL } from "@/lib/brand";
import { BRAND_COLORS } from "@/lib/brand-colors";

// Último recurso: falla el layout raíz, así que no hay CSS global, fuentes ni
// proveedores. Reemplaza al <html> completo, por eso lleva estilos en línea
// con la paleta de la marca (lib/brand-colors.ts). Sin detalles técnicos.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const button = {
    display: "inline-block",
    padding: "12px 22px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  } as const;

  return (
    <html lang="es">
      <head>
        <meta name="robots" content="noindex" />
        <title>{`Algo salió mal · ${BRAND_NAME}`}</title>
      </head>
      <body style={{ margin: 0, background: BRAND_COLORS.background, color: BRAND_COLORS.ink, fontFamily: "Helvetica, Arial, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <p style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: BRAND_COLORS.accentInk }}>{BRAND_NAME}</p>
          <h1 style={{ margin: "0 0 12px", fontSize: 28 }}>Algo salió mal de nuestro lado</h1>
          <p style={{ margin: "0 0 28px", maxWidth: 420, lineHeight: 1.6, color: BRAND_COLORS.muted }}>
            No pudimos cargar la aplicación. Intenta de nuevo; si el problema sigue, escríbenos y lo revisamos.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button type="button" onClick={() => reset()} style={{ ...button, border: "none", background: BRAND_COLORS.accent, color: BRAND_COLORS.onAccent }}>
              Intentar de nuevo
            </button>
            <a href={`mailto:${BRAND_CONTACT_EMAIL}`} style={{ ...button, border: `1px solid ${BRAND_COLORS.border}`, background: BRAND_COLORS.surface, color: BRAND_COLORS.ink }}>
              Escribir a soporte
            </a>
          </div>
          {error.digest && <p style={{ marginTop: 32, fontSize: 12, color: BRAND_COLORS.muted }}>Referencia: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
