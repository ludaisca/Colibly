"use client";

import { EntityAvatar } from "./avatar";
import { useSession, signOut } from "next-auth/react";
import { disablePush } from "@/lib/notifications/push-client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu } from "@base-ui/react/menu";
import { Settings, LifeBuoy, LogOut, ChevronDown, Check, BellRing } from "lucide-react";
import { enablePush, needsHomeScreenInstall, pushSupported, syncPush } from "@/lib/notifications/push-client";
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

/**
 * Datos del usuario que el layout ya trae del servidor (R8 de
 * docs/RENDIMIENTO_2026-11-04.md): con ellos el menú no pide
 * /api/usuarios/me/disponibilidad ni /api/usuarios/me/push al montar.
 * `pushPublicKey: null` = la plataforma no tiene llaves push.
 */
export interface ShellUser {
  name?: string | null;
  email?: string | null;
  availability?: Availability;
  pushPublicKey?: string | null;
}

export function UserDropdown({ initialUser }: { initialUser?: ShellUser }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(initialUser?.availability ?? null);
  const { error: toastError } = useToast();

  // Estado elegido por el usuario (la auto-asignación "solo en línea" lo usa).
  const serverAvailability = initialUser?.availability !== undefined;
  useEffect(() => {
    if (serverAvailability) return;
    let cancelled = false;
    fetch("/api/usuarios/me/disponibilidad")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.availability) setAvailability(data.availability); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverAvailability]);

  // Avisos push en este navegador. null = la plataforma no tiene llaves o el
  // navegador no lo admite: la fila no se muestra.
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const serverPushKey = initialUser?.pushPublicKey;
  useEffect(() => {
    let cancelled = false;
    const keyRequest: Promise<{ publicKey?: string | null } | null> = serverPushKey !== undefined
      ? Promise.resolve({ publicKey: serverPushKey })
      : fetch("/api/usuarios/me/push").then((res) => (res.ok ? res.json() : null));
    keyRequest
      .then(async (data) => {
        if (cancelled || !data?.publicKey) return;
        if (needsHomeScreenInstall()) {
          setIosHint(true);
          return;
        }
        if (!pushSupported()) return;
        setPushKey(data.publicKey);
        setPushOn(await syncPush(data.publicKey).catch(() => false));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverPushKey]);

  async function togglePush(next: boolean) {
    if (!pushKey) return;
    setPushBusy(true);
    try {
      if (next) await enablePush(pushKey);
      else await disablePush();
      setPushOn(next);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudieron cambiar los avisos");
    } finally {
      setPushBusy(false);
    }
  }

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

  const user = session?.user ?? initialUser;
  if (!user) return null;

  const name    = user.name ?? user.email ?? "Usuario";
  const email   = user.email ?? "";
  const seed = (session?.user as { id?: string } | undefined)?.id ?? email ?? name;
  const shortName = name.split(/\s+/).slice(0, 2).join(" ");

  const ITEM = "flex w-full cursor-default select-none items-center gap-3 px-4 py-2.5 text-left text-sm outline-none transition-colors data-[highlighted]:bg-surface-light data-[disabled]:opacity-50";

  return (
    <Menu.Root open={open} onOpenChange={(next) => setOpen(next)} modal={false}>
      <Menu.Trigger
        className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-light"
        aria-label={availability ? `Menú de usuario — ${AVAILABILITY_LABEL[availability]}` : "Menú de usuario"}
      >
        <span className="relative inline-flex shrink-0">
          <EntityAvatar id={seed} name={name} size="sm" figure seed={seed} />
          {availability && <StatusDot value={availability} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5" />}
        </span>
        <span className="hidden md:block text-sm font-medium max-w-[130px] truncate">{shortName}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`hidden md:block text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={8} className="z-[70] outline-none">
          <Menu.Popup className="w-64 max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-border bg-surface shadow-lg outline-none origin-[var(--transform-origin)] transition-[scale,opacity] duration-fast ease-brand data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <EntityAvatar id={seed} name={name} size="md" figure seed={seed} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  {/* Sin nombre, `name` ya es el correo: no repetirlo. */}
                  {email && email !== name && <p className="text-xs text-muted-darker truncate">{email}</p>}
                </div>
              </div>
            </div>

            {availability && (
              <div className="border-b border-border py-1">
                <Menu.RadioGroup
                  value={availability}
                  onValueChange={(value) => void changeAvailability(value as Availability)}
                  aria-label="Tu disponibilidad"
                >
                  {AVAILABILITY_ORDER.map((value) => (
                    <Menu.RadioItem key={value} value={value} closeOnClick={false} className={ITEM}>
                      <StatusDot value={value} className="h-2.5 w-2.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block">{AVAILABILITY_LABEL[value]}</span>
                        <span className="block text-xs text-muted-darker">{AVAILABILITY_HINT[value]}</span>
                      </span>
                      <Menu.RadioItemIndicator className="shrink-0 text-accent-ink">
                        <Check size={14} aria-hidden />
                      </Menu.RadioItemIndicator>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
                <p className="px-4 pb-1.5 pt-0.5 text-xs text-muted-darker">
                  La asignación automática respeta tu estado en las cuentas con &quot;Solo asignar a ejecutivos en línea&quot;.
                </p>
              </div>
            )}

            {pushKey ? (
              <div className="border-b border-border py-1">
                <Menu.CheckboxItem
                  checked={pushOn}
                  onCheckedChange={(next) => void togglePush(next)}
                  disabled={pushBusy}
                  closeOnClick={false}
                  className={ITEM}
                >
                  <BellRing size={15} className="shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block">Avisos en este navegador</span>
                    <span className="block text-xs text-muted-darker">Mensajes y chats asignados, aunque la pestaña esté cerrada</span>
                  </span>
                  <span aria-hidden className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${pushOn ? "bg-accent" : "bg-border"}`}>
                    <span className={`absolute h-4 w-4 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none ${pushOn ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                  </span>
                </Menu.CheckboxItem>
              </div>
            ) : iosHint ? (
              <p className="border-b border-border px-4 py-2.5 text-xs text-muted-darker">
                Para recibir avisos en iPhone, agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.
              </p>
            ) : null}

            <div className="py-1">
              <Menu.LinkItem render={<Link href="/configuracion" />} closeOnClick className={ITEM}>
                <Settings size={15} className="text-muted shrink-0" aria-hidden />
                Configuración
              </Menu.LinkItem>
              <Menu.LinkItem render={<Link href="/ayuda" />} closeOnClick className={ITEM}>
                <LifeBuoy size={15} className="text-muted shrink-0" aria-hidden />
                Ayuda
              </Menu.LinkItem>
            </div>

            <div className="border-t border-border py-1">
              <Menu.Item
                // redirect: false + navegación relativa — ver app-shell.tsx: la
                // redirección del servidor usa el origen interno del contenedor.
                onClick={async () => {
                  // El navegador deja de recibir los avisos de esta cuenta.
                  await disablePush();
                  await signOut({ redirect: false });
                  // Recarga completa a propósito — ver app-shell.tsx.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/login";
                }}
                className={`${ITEM} text-muted data-[highlighted]:text-foreground`}
              >
                <LogOut size={15} className="shrink-0" aria-hidden />
                Cerrar sesión
              </Menu.Item>
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
