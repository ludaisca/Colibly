"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, UserCheck } from "lucide-react";
import { Button } from "@/app/components/kit/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/app/components/kit/menu";
import { useToast } from "@/app/components/ui/toast";

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

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se consulta cada vez que se abre el menú
    fetchAssignees();
  }, [open, fetchAssignees]);

  async function handleAssign(assigneeId: string | null) {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: assigneeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al asignar");
      onAssigned(data.assignedTo ?? null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al asignar");
    }
  }

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button variant="outline" size="sm" className="max-w-36" />}>
        <UserCheck />
        <span className="truncate">{assignedTo?.name ?? "Asignar"}</span>
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-48">
        <MenuItem onClick={() => handleAssign(null)}>
          Sin asignar {!assignedTo && <Check className="ms-auto" />}
        </MenuItem>
        <MenuSeparator />
        {assignees.map((a) => (
          <MenuItem key={a.id} onClick={() => handleAssign(a.id)}>
            <span className="truncate">{a.name ?? a.email}</span>
            {assignedTo?.id === a.id && <Check className="ms-auto" />}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
