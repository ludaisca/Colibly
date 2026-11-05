"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Dropdown, DropdownDivider, DropdownItem, DropdownButton } from "@/app/components/ui/dropdown";
import { useToast } from "@/app/components/ui/toast";

interface TeamOption {
  id: string;
  name: string;
}

// Equipo del chat (lib/teams/): enruta la autoasignación y la vista "Mis
// equipos". Si el chat no tiene a nadie asignado, moverlo a un equipo intenta
// asignarlo dentro de ese equipo (el servidor devuelve a quién).
export function ChatTeamPicker({
  chatId,
  team,
  onAssigned,
}: {
  chatId: string;
  team: TeamOption | null;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
}) {
  const { error: toastError, success } = useToast();
  const [current, setCurrent] = useState<TeamOption | null>(team);
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const [prevChat, setPrevChat] = useState(chatId);
  if (prevChat !== chatId) {
    setPrevChat(chatId);
    setCurrent(team);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/equipos/opciones");
      const data = await res.json();
      if (Array.isArray(data?.teams)) setTeams(data.teams);
    } catch {
      toastError("No se pudieron cargar los equipos");
    }
  }, [toastError]);

  useEffect(() => {
    if (!open || teams) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir el menú
    void load();
  }, [open, teams, load]);

  async function choose(teamId: string | null) {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el equipo");
      setCurrent(data.team ?? null);
      if (data.assignedTo) {
        onAssigned(data.assignedTo);
        success(`Asignado a ${data.assignedTo.name ?? "alguien del equipo"}`);
      }
      setOpen(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo cambiar el equipo");
    }
  }

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="right"
      portal
      trigger={<DropdownButton label={current?.name ?? "Sin equipo"} icon={Users} size="sm" className="max-w-36 [&>span]:truncate" />}
    >
      <DropdownItem onClick={() => void choose(null)}>Sin equipo</DropdownItem>
      <DropdownDivider />
      {teams === null ? (
        <p className="px-3 py-2 text-xs text-muted-darker">Cargando…</p>
      ) : teams.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-darker">Aún no hay equipos. Un admin los crea en Usuarios → Equipos.</p>
      ) : (
        teams.map((t) => (
          <DropdownItem key={t.id} onClick={() => void choose(t.id)}>
            {t.name}
          </DropdownItem>
        ))
      )}
    </Dropdown>
  );
}
