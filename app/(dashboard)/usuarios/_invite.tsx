"use client";

import { useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { useToast } from "@/app/components/ui/toast";
import { invitationSchema } from "@/lib/validations";

interface Props {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

// Invitar por correo: la persona elige su propia contraseña al aceptar.
export function InviteFormModal({ open, onClose, onInvited }: Props) {
  const { success } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

  function handleClose() {
    setEmail("");
    setRole("user");
    setError("");
    setEmailError("");
    onClose();
  }

  async function handleSubmit() {
    setError("");
    setEmailError("");
    const parsed = invitationSchema.safeParse({ email, role });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/usuarios/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la invitación");
      success(`Invitación enviada a ${parsed.data.email}`);
      handleClose();
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la invitación");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Invitar a tu equipo"
      description="Le enviaremos un correo para que cree su contraseña y entre a tu espacio."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Enviar invitación
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <FormField label="Email" required error={emailError}>
          {(id) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@tuempresa.com"
              error={emailError}
            />
          )}
        </FormField>
        <FormField label="Rol" hint="Admin: todo. Usuario: todo menos Contactos, Bots IA, Meta Ads y Usuarios. Ejecutivo: solo chats, contactos y citas.">
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">Usuario</option>
              <option value="ejecutivo">Ejecutivo</option>
              <option value="admin">Admin</option>
            </Select>
          )}
        </FormField>
      </div>
    </Modal>
  );
}
