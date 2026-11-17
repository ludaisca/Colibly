"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";
import { useChannelFlags } from "./channel-flags";

// Pestañas de "Canales" (una sola entrada en el menú): reutilizan las páginas
// de cuentas de cada canal. Solo se muestran en la lista de cada canal, no
// dentro del detalle de una cuenta.
const TABS = [
  { href: "/whatsapp/cuentas", label: "WhatsApp", flag: null },
  { href: "/instagram/cuentas", label: "Instagram", flag: "instagram" },
  { href: "/messenger/cuentas", label: "Messenger", flag: "messenger" },
  { href: "/telegram/cuentas", label: "Telegram", flag: "telegram" },
  { href: "/webchat/cuentas", label: "Web", flag: "webchat" },
  { href: "/whatsapp-web/cuentas", label: "WhatsApp (QR)", flag: "whatsappWeb" },
] as const;

export function ChannelTabs() {
  const pathname = usePathname();
  const flags = useChannelFlags();
  if (!TABS.some((tab) => tab.href === pathname)) return null;
  // WhatsApp por QR nunca se muestra sin la bandera explícita (los demás, ante
  // la duda, sí).
  const tabs = TABS.filter((tab) => tab.flag === null || (tab.flag === "whatsappWeb" ? !!flags?.whatsappWeb : !flags || flags[tab.flag]));
  return (
    <nav aria-label="Canales" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border scrollbar-none">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast",
              active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
