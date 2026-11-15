// Esqueleto del embudo: encabezado con la línea de resumen y columnas sobre
// surface-light con tarjetas planas (mismo dibujo que la página).
function SkeletonCard() {
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-full bg-surface-light" />
        <div className="h-4 w-28 rounded-xs bg-surface-light" />
      </div>
      <div className="h-4 w-20 rounded-xs bg-surface-light" />
    </div>
  );
}

export default function VentasLoading() {
  return (
    <div className="space-y-5 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="Cargando embudo">
      <div className="flex min-h-14 flex-col justify-center gap-2">
        <div className="h-6 w-28 rounded-xs bg-surface-light" />
        <div className="h-4 w-96 max-w-full rounded-xs bg-surface-light" />
      </div>
      <div className="h-8 w-full max-w-md rounded-sm bg-surface-light" />
      <div className="flex gap-3 overflow-hidden pb-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="min-w-full flex-1 space-y-2 sm:min-w-[260px]">
            <div className="h-5 w-32 rounded-xs bg-surface-light" />
            <div className="space-y-2 rounded-lg bg-surface-light p-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
