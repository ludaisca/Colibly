import { Camera, Globe, MessageCircle, Send } from "lucide-react";
import { cn } from "@/app/components/kit/utils";
import type { Channel } from "./chat-shared";

// Nombre e ícono de cada canal — una sola fuente para la lista, el rail, la
// cabecera del hilo y la ficha del contacto.
export const CHANNELS: Record<Channel, { label: string; icon: typeof MessageCircle }> = {
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  TELEGRAM: { label: "Telegram", icon: Send },
  MESSENGER: { label: "Messenger", icon: MessageCircle },
  INSTAGRAM: { label: "Instagram", icon: Camera },
  WEBCHAT: { label: "Chat web", icon: Globe },
};

export function ChannelGlyph({ channel, size = 12, className }: { channel: Channel; size?: number; className?: string }) {
  const Icon = CHANNELS[channel].icon;
  return <Icon size={size} aria-hidden="true" className={cn("shrink-0", className)} />;
}
