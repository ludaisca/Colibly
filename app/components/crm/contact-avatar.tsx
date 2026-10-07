import { Avatar, AvatarFallback } from "@/app/components/kit/avatar";
import { cn } from "@/app/components/kit/utils";
import { hueClassFor } from "@/app/components/ui/hue";

// Avatar redondo con iniciales; el tono sale del id (cuenta o persona) para que
// la misma entidad se vea igual en la lista, el hilo y la ficha.

const SIZE = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ContactAvatar({ id, name, size = "md", className }: { id: string; name: string; size?: keyof typeof SIZE; className?: string }) {
  return (
    <Avatar className={cn(SIZE[size], hueClassFor(id), className)}>
      <AvatarFallback className="bg-entity-bg font-semibold text-entity">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
