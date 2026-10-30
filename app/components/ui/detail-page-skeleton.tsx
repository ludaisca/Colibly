import { Skeleton, SkeletonText } from "./skeleton";
import { Card, CardBody } from "./card";
import { PageHeader } from "./page-header";
import { cn } from "./cn";

// Esqueleto reutilizable para páginas de una sola columna con Card(s):
// back-link + heading simple (bots/[id], cuentas/[id], campañas/[id],
// campañas/nueva), back-link + PageHeader (configuración/ia), o solo
// PageHeader sin back-link (configuración). Cada número en `cardLines` es
// la cantidad de líneas de texto de esa Card.
export function DetailPageSkeleton({
  backLabel,
  title,
  description,
  cardLines = [3, 4],
  maxWidth = "max-w-6xl",
  className,
}: {
  backLabel?: string;
  title?: string;
  description?: string;
  cardLines?: number[];
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6 mx-auto", maxWidth, className)}>
      {backLabel && (
        <div className="flex items-center gap-1.5 text-sm text-muted">
          <Skeleton className="h-3.5 w-3.5 rounded-full" />
          <span>{backLabel}</span>
        </div>
      )}
      {title ? <PageHeader title={title} description={description} /> : !backLabel ? null : <Skeleton className="h-7 w-1/2" />}

      {cardLines.map((lines, i) => (
        <Card key={i}>
          <CardBody>
            <SkeletonText lines={lines} />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
