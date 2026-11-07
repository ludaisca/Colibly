"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Modal } from "@/app/components/ui/modal";
import { MultiSelect } from "@/app/components/ui/multi-select";
import { SectionHeader } from "@/app/components/ui/section-header";
import { useToast } from "@/app/components/ui/toast";

// Usuarios → Equipos (lib/teams/). Un equipo agrupa personas para enrutar
// chats: la autoasignación de un chat con equipo solo reparte entre sus
// miembros, y cada persona ve "Mis equipos" en la bandeja. No da permisos.

interface Team {
  id: string;
  name: string;
  members: Array<{ id: string; name: string | null; email: string }>;
  accounts: Array<{ id: string; name: string; channel: string }>;
  openChats: number;
}
interface Person {
  id: string;
  name: string | null;
  email: string;
}
interface Account {
  id: string;
  name: string;
  channel: string;
  defaultTeamId: string | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Chat web",
};

export function TeamsSection() {
  const { success, error: toastError } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/equipos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los equipos");
      setTeams(data.teams);
      setPeople(data.people);
      setAccounts(data.accounts);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudieron cargar los equipos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el API
    void load();
  }, [load]);

  async function remove(team: Team) {
    setBusy(true);
    try {
      const res = await fetch(`/api/equipos/${team.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar el equipo");
      success(`Equipo "${team.name}" borrado`);
      setDeleting(null);
      void load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo borrar el equipo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader
        eyebrow="Enrutamiento"
        title="Equipos"
        action={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
            Nuevo equipo
          </Button>
        }
      />
      <p className="text-sm text-muted-darker">
        Agrupa a tu gente (Ventas, Soporte…). Los chats nuevos de las cuentas que elijas entran al equipo y la asignación
        automática solo reparte entre sus miembros. No cambia quién puede ver cada cuenta.
      </p>
      <EntityList
        rows={teams}
        rowKey={(t) => t.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyIcon={Users}
        emptyTitle="Aún no tienes equipos"
        emptyDescription="Crea uno cuando tengas varias personas atendiendo, por ejemplo Ventas y Soporte."
        rowClassName="flex-col items-stretch sm:flex-row sm:items-center"
        renderRow={(team) => (
          <>
            <EntityRow
              leading={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-subtle text-accent-ink"><Users size={15} /></span>}
              title={team.name}
              badges={<Badge tone="neutral" size="sm">{team.openChats === 1 ? "1 chat activo" : `${team.openChats} chats activos`}</Badge>}
              subtitle={[
                team.members.length ? team.members.map((m) => m.name ?? m.email).join(", ") : "Sin miembros",
                team.accounts.length ? `Recibe: ${team.accounts.map((a) => a.name).join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <span className="flex shrink-0 items-center justify-end gap-1 border-t border-border pt-2 sm:border-0 sm:pt-0">
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(team)}>
                Editar
              </Button>
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleting(team)} className="text-danger">
                Borrar
              </Button>
            </span>
          </>
        )}
      />

      {editing && (
        <TeamFormModal
          key={editing === "new" ? "new" : editing.id}
          team={editing === "new" ? null : editing}
          people={people}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) return remove(deleting);
        }}
        title={`Borrar el equipo "${deleting?.name ?? ""}"`}
        description="Sus chats y cuentas quedan sin equipo; nadie pierde acceso ni se desasigna ningún chat."
        confirmLabel="Borrar"
        tone="danger"
        loading={busy}
      />
    </section>
  );
}

function TeamFormModal({
  team,
  people,
  accounts,
  onClose,
  onSaved,
}: {
  team: Team | null;
  people: Person[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success } = useToast();
  const [name, setName] = useState(team?.name ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const [accountIds, setAccountIds] = useState<string[]>(team?.accounts.map((a) => a.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Una cuenta que ya es de otro equipo se puede elegir: pasa a este.
  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${CHANNEL_LABEL[a.channel] ?? a.channel}${a.defaultTeamId && a.defaultTeamId !== team?.id ? " (en otro equipo)" : ""}`,
  }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(team ? `/api/equipos/${team.id}` : "/api/equipos", {
        method: team ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, memberIds, accountIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el equipo");
      success(team ? "Equipo guardado" : "Equipo creado");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el equipo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal layout="drawer"
      open
      onClose={onClose}
      title={team ? `Editar ${team.name}` : "Nuevo equipo"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!name.trim()}>
            {team ? "Guardar" : "Crear equipo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nombre" error={error || undefined}>
          {(id) => <Input id={id} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ventas" autoFocus />}
        </FormField>
        <FormField label="Miembros" hint="Entre ellos se reparten los chats del equipo">
          {(id) => (
            <MultiSelect id={id} options={people.map((p) => ({ value: p.id, label: p.name ?? p.email }))} value={memberIds} onChange={setMemberIds} placeholder="Elige personas" />
          )}
        </FormField>
        <FormField label="Cuentas que recibe (opcional)" hint="Los chats nuevos de estas cuentas entran a este equipo">
          {(id) => <MultiSelect id={id} options={accountOptions} value={accountIds} onChange={setAccountIds} placeholder="Elige cuentas" />}
        </FormField>
      </div>
    </Modal>
  );
}
