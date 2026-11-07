"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, X } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  role: string;
  disabledAt?: string | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "Usuario", ejecutivo: "Ejecutivo" };

// "Compartir cuenta" para cuentas de canal (Telegram, Messenger, Instagram,
// Web) — mismo comportamiento que la sección equivalente de
// whatsapp/cuentas/[id], en un modal porque estos canales no tienen página de
// detalle. Solo lo abre el admin dueño de la cuenta.
export function ChannelAccountShareModal({
  open,
  onClose,
  account,
}: {
  open: boolean;
  onClose: () => void;
  account: { id: string; name: string; userId: string } | null;
}) {
  const { success, error: toastError } = useToast();
  const [sharedUsers, setSharedUsers] = useState<UserOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [shareUserId, setShareUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const fetchSharing = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [sharedRes, usersRes] = await Promise.all([
        fetch(`/api/channel-accounts/${account.id}/share`),
        fetch("/api/usuarios"),
      ]);
      const [sharedData, usersData] = await Promise.all([sharedRes.json(), usersRes.json()]);
      if (!sharedRes.ok) throw new Error(sharedData.error ?? "Error al cargar accesos");
      setSharedUsers(Array.isArray(sharedData) ? sharedData : []);
      setAllUsers(Array.isArray(usersData) ? usersData : []);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cargar accesos");
    } finally {
      setLoading(false);
    }
  }, [account, toastError]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al abrir
    setShareUserId("");
    fetchSharing();
  }, [open, fetchSharing]);

  async function handleShare() {
    if (!account || !shareUserId) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/channel-accounts/${account.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: shareUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al compartir");
      setShareUserId("");
      await fetchSharing();
      success("Cuenta compartida");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al compartir la cuenta");
    } finally {
      setSharing(false);
    }
  }

  async function handleUnshare(userId: string) {
    if (!account) return;
    try {
      const res = await fetch(`/api/channel-accounts/${account.id}/share?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSharedUsers((prev) => prev.filter((u) => u.id !== userId));
      success("Acceso removido");
    } catch {
      toastError("Error al quitar el acceso");
    }
  }

  const candidates = allUsers.filter(
    (u) => account && u.id !== account.userId && !u.disabledAt && !sharedUsers.some((s) => s.id === u.id)
  );

  return (
    <Modal open={open} onClose={onClose} title={account ? `Compartir "${account.name}"` : "Compartir cuenta"} size="md">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Los usuarios con acceso pueden ver y atender los chats y contactos de esta cuenta — dentro de lo que su propio
          rol ya permite. No pueden editarla ni eliminarla.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : sharedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sharedUsers.map((u) => (
              <Badge key={u.id} tone="neutral" size="sm" className="gap-1.5">
                {u.name ?? u.email} · {ROLE_LABEL[u.role] ?? u.role}
                <button
                  onClick={() => handleUnshare(u.id)}
                  className="hover:text-danger transition-colors"
                  aria-label={`Quitar acceso a ${u.name ?? u.email}`}
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-darker">Todavía no compartes esta cuenta con nadie.</p>
        )}

        <div className="flex items-center gap-2">
          <Select value={shareUserId} onChange={(e) => setShareUserId(e.target.value)} className="flex-1" aria-label="Usuario">
            <option value="">Seleccionar usuario…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email} ({ROLE_LABEL[u.role] ?? u.role})
              </option>
            ))}
          </Select>
          <Button size="sm" icon={sharing ? undefined : UserPlus} onClick={handleShare} disabled={sharing || !shareUserId}>
            {sharing ? <Spinner /> : "Compartir"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
