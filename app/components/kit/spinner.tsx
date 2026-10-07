// Generado por scripts/coss-sync.mjs desde coss ui (MIT, https://coss.com/ui). No editar a mano.
import { Loader2Icon } from "lucide-react";
import type React from "react";
import { cn } from "@/app/components/kit/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>): React.ReactElement {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
