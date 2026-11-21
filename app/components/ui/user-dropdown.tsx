"use client";

import { EntityAvatar } from "./avatar";
import { useSession, signOut } from "next-auth/react";
import { disablePush } from "@/lib/notifications/push-client";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuDivider,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@astryxdesign/core/DropdownMenu";
import type { IconType } from "@astryxdesign/core/Icon";
import { Settings, LifeBuoy, LogOut, ChevronDown, BellRing, Users, Megaphone } from "lucide-react";
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
  /** Admin: Usuarios y Meta Ads viven en este menú (ya no en el lateral). */
  isAdmin?: boolean;
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

  const signOutNow = async () => {
    // El navegador deja de recibir los avisos de esta cuenta.
    await disablePush();
    // redirect: false + navegación relativa — ver app-shell.tsx: la
    // redirección del servidor usa el origen interno del contenedor.
    await signOut({ redirect: false });
    // Recarga completa a propósito — ver app-shell.tsx.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  return (
    <DropdownMenu
      isMenuOpen={open}
      onOpenChange={setOpen}
      placement="below"
      alignment="end"
      menuWidth={288}
      menuMaxHeight={600}
      footer={
        !pushKey && iosHint ? (
          <p className="px-1 py-1 text-xs text-muted-darker">
            Para recibir avisos en iPhone, agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.
          </p>
        ) : undefined
      }
      header={
        <div className="flex items-center gap-3 px-1 py-1">
          <EntityAvatar id={seed} name={name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            {/* Sin nombre, `name` ya es el correo: no repetirlo. */}
            {email && email !== name && <p className="truncate text-xs text-muted-darker">{email}</p>}
          </div>
        </div>
      }
      renderTrigger={(props) => (
        <button
          type="button"
          {...(props as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          ref={props.ref as React.Ref<HTMLButtonElement>}
          className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-light"
          aria-label={availability ? `Menú de usuario — ${AVAILABILITY_LABEL[availability]}` : "Menú de usuario"}
        >
          <span className="relative inline-flex shrink-0">
            <EntityAvatar id={seed} name={name} size="sm" />
            {availability && <StatusDot value={availability} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5" />}
          </span>
          <span className="hidden max-w-[130px] truncate text-sm font-medium md:block">{shortName}</span>
          <ChevronDown
            size={14}
            aria-hidden
            className={`hidden text-muted transition-transform duration-200 motion-reduce:transition-none md:block ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
    >
      {availability && (
        <>
          <DropdownMenuRadioGroup
            label="Tu disponibilidad"
            value={availability}
            hasCloseOnSelect={false}
            onChange={(value) => void changeAvailability(value as Availability)}
          >
            {AVAILABILITY_ORDER.map((value) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                icon={<StatusDot value={value} className="h-2.5 w-2.5 shrink-0" />}
                label={AVAILABILITY_LABEL[value]}
                description={AVAILABILITY_HINT[value]}
              />
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuDivider />
        </>
      )}

      {pushKey && (
        <>
          <DropdownMenuCheckboxItem
            icon={BellRing as IconType}
            label="Avisos en este navegador"
            description="Mensajes y chats asignados, aunque la pestaña esté cerrada"
            value={pushOn}
            onChange={(next) => void togglePush(next)}
            isDisabled={pushBusy}
          />
          <DropdownMenuDivider />
        </>
      )}

      <DropdownMenuItem icon={Settings as IconType} label="Configuración" href="/configuracion" />
      <DropdownMenuItem icon={LifeBuoy as IconType} label="Ayuda" href="/ayuda" />
      {initialUser?.isAdmin && (
        <>
          <DropdownMenuItem icon={Users as IconType} label="Usuarios" href="/usuarios" />
          <DropdownMenuItem icon={Megaphone as IconType} label="Meta Ads" href="/meta-ads" />
        </>
      )}
      <DropdownMenuDivider />
      <DropdownMenuItem icon={LogOut as IconType} label="Cerrar sesión" onClick={() => void signOutNow()} />
    </DropdownMenu>
  );
}
