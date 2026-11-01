"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { Settings, LogOut, ChevronDown, Check } from "lucide-react";
import { AVAILABILITY_LABEL, type Availability } from "@/lib/users/availability-rules";
import { useToast } from "./toast";

const AVAILABILITY_DOT: Record<Availability, string> = {
  ONLINE: "bg-success",
  BUSY: "bg-warning",
  OFFLINE: "bg-muted-darker",
};
const AVAILABILITY_HINT: Record<Availability, string> = {
  ONLINE: "Disponible para chats nuevos",
  BUSY: "Conectado, sin asignación automática",
  OFFLINE: "Sin asignación automática",
};
const AVAILABILITY_ORDER: Availability[] = ["ONLINE", "BUSY", "OFFLINE"];

function StatusDot({ value, className = "" }: { value: Availability; className?: string }) {
  return <span aria-hidden className={`block rounded-full ring-2 ring-surface ${AVAILABILITY_DOT[value]} ${className}`} />;
}

export function UserDropdown({ initialUser }: { initialUser?: { name?: string | null; email?: string | null } }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { error: toastError } = useToast();

  // Estado elegido por el usuario (la auto-asignación "solo en línea" lo usa).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/usuarios/me/disponibilidad")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.availability) setAvailability(data.availability); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function changeAvailability(next: Availability) {
    const previous = availability;
    setAvailability(next);
    try {
      const res = await fetch("/api/usuarios/me/disponibilidad", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAvailability(previous);
      toastError("No se pudo cambiar tu estado");
    }
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const user = session?.user ?? initialUser;
  if (!user) return null;

  const name    = user.name ?? user.email ?? "Usuario";
  const email   = user.email ?? "";
  const initials = name.slice(0, 2).toUpperCase();
  const shortName = name.split(/\s+/).slice(0, 2).join(" ");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-surface-light transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={availability ? `Menú de usuario — ${AVAILABILITY_LABEL[availability]}` : "Menú de usuario"}
      >
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent font-bold text-xs shrink-0 select-none">
          {initials}
          {availability && <StatusDot value={availability} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5" />}
        </div>
        <span className="hidden md:block text-sm font-medium max-w-[130px] truncate">{shortName}</span>
        <ChevronDown
          size={14}
          className={`hidden md:block text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-surface shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent font-bold text-sm shrink-0 select-none">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-xs text-muted-darker truncate">{email}</p>
                </div>
              </div>
            </div>

            {availability && (
              <div className="border-b border-border py-1" role="group" aria-label="Tu disponibilidad">
                {AVAILABILITY_ORDER.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeAvailability(value)}
                    aria-pressed={availability === value}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-light transition-colors"
                  >
                    <StatusDot value={value} className="h-2.5 w-2.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block">{AVAILABILITY_LABEL[value]}</span>
                      <span className="block text-xs text-muted-darker">{AVAILABILITY_HINT[value]}</span>
                    </span>
                    {availability === value && <Check size={14} className="shrink-0 text-accent-ink" aria-hidden />}
                  </button>
                ))}
                <p className="px-4 pb-1.5 pt-0.5 text-[11px] text-muted-darker">
                  La asignación automática respeta tu estado en las cuentas con &quot;Solo asignar a ejecutivos en línea&quot;.
                </p>
              </div>
            )}

            <div className="py-1">
              <Link
                href="/configuracion"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-light transition-colors"
              >
                <Settings size={15} className="text-muted shrink-0" />
                Configuración
              </Link>
            </div>

            <div className="border-t border-border py-1">
              <button
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
                <LogOut size={15} className="shrink-0" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
