"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { useTheme } from "@/app/components/theme-provider";
import { Sun, Moon } from "lucide-react";
import { useHasMounted } from "@/app/hooks/use-has-mounted";
import { cn } from "@/app/components/ui/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  if (!mounted) {
    return <div className={cn("h-9 w-9", className)} aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Tooltip label={isDark ? "Modo claro" : "Modo oscuro"}><button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-muted-darker transition-colors hover:bg-surface-light hover:text-foreground",
        className
      )}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button></Tooltip>
  );
}
