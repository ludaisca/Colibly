"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { Dropdown } from "./dropdown";

export function UserDropdown({ initialUser }: { initialUser?: { name?: string | null; email?: string | null } }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const user = session?.user ?? initialUser;
  if (!user) return null;

  const name    = user.name ?? user.email ?? "Usuario";
  const email   = user.email ?? "";
  const initials = name.slice(0, 2).toUpperCase();
  const shortName = name.split(/\s+/).slice(0, 2).join(" ");

  return (
    <Dropdown
      align="right"
      open={open}
      onOpenChange={setOpen}
      menuLabel="Cuenta"
      trigger={
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-surface-light transition-colors"
          aria-label={`Cuenta de ${name}`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent font-bold text-xs shrink-0 select-none" aria-hidden="true">
            {initials}
          </div>
          <span className="hidden md:block text-sm font-medium max-w-[130px] truncate">{shortName}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`hidden md:block text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      }
    >
      <div className="w-64 -my-1 overflow-hidden rounded-xl">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent font-bold text-sm shrink-0 select-none" aria-hidden="true">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{name}</p>
              <p className="text-xs text-muted-darker truncate">{email}</p>
            </div>
          </div>
        </div>

        <div className="py-1">
          <Link
            href="/configuracion"
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-light transition-colors"
          >
            <Settings size={15} aria-hidden="true" className="text-muted shrink-0" />
            Configuración
          </Link>
        </div>

        <div className="border-t border-border py-1">
          <button
            type="button"
            // redirect: false + navegación relativa — ver app-shell.tsx: la
            // redirección del servidor usa el origen interno del contenedor.
            onClick={async () => {
              await signOut({ redirect: false });
              // Recarga completa a propósito — ver app-shell.tsx.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted hover:bg-surface-light hover:text-foreground transition-colors"
          >
            <LogOut size={15} aria-hidden="true" className="shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </Dropdown>
  );
}
