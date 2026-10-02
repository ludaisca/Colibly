"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import type { NavGroup, NavItem } from "./app-shell";
import "./command-palette.css";

export function CommandPalette({ nav }: { nav: (NavItem | NavGroup)[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const inDemo = pathname.startsWith("/demo-componentes");

  useEffect(() => {
    if (inDemo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inDemo]);

  if (inDemo) return null;

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Buscar sección" title="Buscar sección (Ctrl/⌘ K)" className="colibly-command-trigger">
      <Search size={17} /><span className="hidden lg:inline">Buscar</span><kbd className="hidden lg:inline">⌘ K</kbd>
    </button>
    <Command.Dialog open={open} onOpenChange={setOpen} label="Ir a una sección" contentClassName="colibly-command" overlayClassName="colibly-command-overlay">
      <Command.Input autoFocus placeholder="Buscar una sección..." aria-label="Buscar sección" />
      <Command.List>
        <Command.Empty>No hay secciones con ese nombre.</Command.Empty>
        {nav.map((entry, index) => {
          const group = "items" in entry ? entry : { title: "Secciones", items: [entry] };
          return <Command.Group key={group.title ?? index} heading={group.title}>
            {group.items.map((item) => <Command.Item key={item.href} value={`${item.label} ${group.title ?? ""}`} onSelect={() => { setOpen(false); router.push(item.href); }}>
              <item.icon size={17} /><span>{item.label}</span>
            </Command.Item>)}
          </Command.Group>;
        })}
      </Command.List>
      <div className="colibly-command-hint">↑ ↓ para navegar · Enter para abrir · Esc para cerrar</div>
    </Command.Dialog>
  </>;
}
