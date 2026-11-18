"use client";

import { useState, useCallback } from "react";
import { UserCheck } from "lucide-react";
import { Dropdown, DropdownDivider, DropdownItem, DropdownButton } from "@/app/components/ui/dropdown";
import { useToast } from "@/app/components/ui/toast";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

interface Assignee {
  id: string;
  name: string | null;
  email: string;
}

export function ChatAssigneePicker({
  chatId,
  assignedTo,
  onAssigned,
}: {
  chatId: string;
  assignedTo: { id: string; name: string | null } | null;
  onAssigned: (assignee: { id: string; name: string | null } | null) => void;
}) {
  const { error: toastError } = useToast();
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [open, setOpen] = useState(false);

  const fetchAssignees = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/assignees`);
      const data = await res.json();
      if (Array.isArray(data)) setAssignees(data);
    } catch {
      toastError("Error al cargar usuarios");
    }
  }, [chatId, toastError]);

  useRunOnChange(() => {
    if (!open) return;
    fetchAssignees();
  }, [open, fetchAssignees]);

  async function patchAssignment(body: { assignedToId?: string | null; self?: true }) {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al asignar");
      onAssigned(data.assignedTo ?? null);
      setOpen(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al asignar");
    }
  }

  function handleAssign(assigneeId: string | null) {
    return patchAssignment({ assignedToId: assigneeId });
  }

  function handleAssignSelf() {
    return patchAssignment({ self: true });
  }

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="right"
      portal
      trigger={
        <DropdownButton
          label={assignedTo?.name ?? "Asignar"}
          icon={UserCheck}
          size="sm"
          className="max-w-36 [&>span]:truncate"
        />
      }
    >
      <DropdownItem onClick={handleAssignSelf} icon={UserCheck}>Asignarme</DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={() => handleAssign(null)}>Sin asignar</DropdownItem>
      {assignees.map((a) => (
        <DropdownItem key={a.id} onClick={() => handleAssign(a.id)}>
          {a.name ?? a.email}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
