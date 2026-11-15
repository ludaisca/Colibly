"use client";

import { useState } from "react";
import { disablePush } from "@/lib/notifications/push-client";
import { signOut } from "next-auth/react";
import { Download, Trash2 } from "lucide-react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { Banner } from "@/app/components/ui/banner";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { PasswordInput } from "@/app/components/ui/password-input";
import { useToast } from "@/app/components/ui/toast";

// "Tus datos": exportar todo (cualquier admin) y eliminar la organización (solo
// el dueño). API: GET /api/organizacion/exportar y DELETE /api/organizacion.
export function DataSection({ organizationName, isOwner, isInternal }: { organizationName: string; isOwner: boolean; isInternal: boolean }) {
  const { error: toastError } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/organizacion/exportar");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo exportar");
      }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "colibly-datos.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader eyebrow="Tus datos" title="Exportar o eliminar" />
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Descargar todos los datos</p>
            <p className="mt-1 text-sm text-muted">
              Contactos, conversaciones con sus mensajes, notas, citas, usuarios y cuentas, en un archivo JSON. No incluye
              contraseñas, tokens ni los archivos multimedia.
            </p>
          </div>
          <Button variant="secondary" icon={Download} loading={exporting} onClick={handleExport} className="shrink-0">
            Exportar
          </Button>
        </div>
        {!isInternal && (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Eliminar la organización</p>
              <p className="mt-1 text-sm text-muted">
                {isOwner
                  ? "Borra para siempre la organización, sus usuarios y todos sus datos, y cancela la suscripción. No se puede deshacer."
                  : "Solo la persona titular de la organización puede eliminarla."}
              </p>
            </div>
            {isOwner && (
              <Button variant="danger" icon={Trash2} onClick={() => setDeleteOpen(true)} className="shrink-0">
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>
      {isOwner && !isInternal && <DeleteOrganizationModal open={deleteOpen} onClose={() => setDeleteOpen(false)} organizationName={organizationName} />}
    </section>
  );
}

function DeleteOrganizationModal({ open, onClose, organizationName }: { open: boolean; onClose: () => void; organizationName: string }) {
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const nameMatches = confirmName.trim().toLocaleLowerCase("es") === organizationName.trim().toLocaleLowerCase("es");

  function close() {
    if (deleting) return;
    setConfirmName("");
    setPassword("");
    setError("");
    onClose();
  }

  async function handleDelete() {
    setError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/organizacion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo eliminar la organización");
      // redirect: false + navegación relativa, como el "Cerrar sesión" del shell:
      // la URL absoluta que arma el servidor usa el origen interno del contenedor.
      // El navegador deja de recibir los avisos de esta cuenta.
                  await disablePush();
                  await signOut({ redirect: false });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la organización");
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      persistent={deleting}
      title="Eliminar la organización"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" icon={Trash2} loading={deleting} disabled={!nameMatches || !password} onClick={handleDelete}>
            Eliminar para siempre
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Banner tone="danger">
          Se borran todos los contactos, conversaciones, bots, automatizaciones, campañas y usuarios de{" "}
          <strong>{organizationName}</strong>, y se cancela la suscripción. Si quieres conservar algo, expórtalo antes.
        </Banner>
        {error && <Banner tone="danger">{error}</Banner>}
        <FormField label={`Escribe “${organizationName}” para confirmar`}>
          {(id) => <Input id={id} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />}
        </FormField>
        <FormField label="Tu contraseña">
          {(id) => <PasswordInput id={id} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
        </FormField>
      </div>
    </Modal>
  );
}
