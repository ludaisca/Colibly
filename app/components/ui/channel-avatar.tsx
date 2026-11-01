import { EntityAvatar } from "./avatar";
import { CHANNEL_ICONS } from "./channel-icons";
import { cn } from "./cn";

export type AvatarChannel = keyof typeof CHANNEL_ICONS;

const CHANNEL_NAME: Record<AvatarChannel, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  MESSENGER: "Messenger",
  TELEGRAM: "Telegram",
  WEBCHAT: "Chat web",
};

// Avatar del contacto con la insignia del canal en la esquina: de un vistazo
// se distingue un chat de Instagram, WhatsApp o del chat web. El hue sigue
// siendo el de la cuenta (hueClassFor), la insignia el de la marca.
export function ChannelAvatar({
  id,
  name,
  channel,
  size = "sm",
  className,
}: {
  id: string;
  name: string;
  channel?: AvatarChannel | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Mark = channel ? CHANNEL_ICONS[channel] : null;
  const badge = size === "sm" ? 14 : 16;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <EntityAvatar id={id} name={name} size={size} />
      {Mark && (
        <span
          className="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full bg-surface p-[2px] text-accent-ink shadow-sm ring-1 ring-border"
          title={CHANNEL_NAME[channel!]}
        >
          <Mark size={badge - 4} />
          <span className="sr-only">{CHANNEL_NAME[channel!]}</span>
        </span>
      )}
    </span>
  );
}
