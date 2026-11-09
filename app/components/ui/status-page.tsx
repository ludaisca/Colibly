import { Logo } from "./logo";

interface StatusPageProps {
  code: string;
  title: string;
  description: string;
  actions: React.ReactNode;
  // Referencia opaca para soporte (digest de Next); nunca el mensaje del error.
  reference?: string;
}

// Pantalla completa para 404 y errores inesperados: marca, mensaje claro en
// español y salidas. Sin hooks ni nada de servidor, así sirve a not-found.tsx
// (servidor) y a error.tsx (cliente). No muestra detalles técnicos. Sigue el
// tema de la app (antes forzaba `theme-light`, que traía la paleta vieja).
export function StatusPage({ code, title, description, actions, reference }: StatusPageProps) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-foreground"
    >
      <main className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo href="/" size="lg" />
        </div>
        <p className="font-display text-hero font-bold leading-none tracking-tight text-foreground tabular-nums" aria-hidden>
          {code}
        </p>
        <h1 className="mt-4 font-display text-page-title font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted">{description}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        {reference && <p className="mt-8 text-xs text-muted">Referencia: <span className="font-mono">{reference}</span></p>}
      </main>
    </div>
  );
}
