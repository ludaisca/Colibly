"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

// Datos de ejemplo (Spa Aurora): un botón para cargarlos y otro, con
// confirmación, para borrarlos. Solo lo ve un admin. Los de ejemplo son
// contactos sin canal con la marca "Ejemplo"; no se envían ni cuentan.
export function SampleDataControls({ size = "md", variant = "secondary" }: { size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const { data: session } = useSession();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const isAdmin = session?.user?.role === "admin";
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/sample-data");
      if (res.ok) setLoaded(Boolean((await res.json()).loaded));
    } catch {
      /* sin estado: no se muestra el botón */
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del estado
  useEffect(() => { if (isAdmin) void refreshStatus(); }, [isAdmin, refreshStatus]);

  if (!isAdmin || loaded === null) return null;

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/sample-data", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los datos de ejemplo");
      success("Cargamos datos de ejemplo del Spa Aurora");
      setLoaded(true);
      router.refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudieron cargar los datos de ejemplo");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const res = await fetch("/api/onboarding/sample-data", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "No se pudieron borrar los datos de ejemplo");
    success("Borramos los datos de ejemplo");
    setLoaded(false);
    router.refresh();
  }

  return (
    <>
      {loaded ? (
        <Button size={size} variant="ghost" icon={Trash2} onClick={() => setConfirmOpen(true)}>Borrar datos de ejemplo</Button>
      ) : (
        <Button size={size} variant={variant} icon={Sparkles} onClick={() => void load()} disabled={busy}>
          {busy ? "Cargando…" : "Cargar datos de ejemplo"}
        </Button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        title="¿Borrar los datos de ejemplo?"
        description="Se quitan los contactos, la cita y las etiquetas de ejemplo del Spa Aurora. Tus contactos reales no se tocan."
        confirmLabel="Sí, borrar"
      />
    </>
  );
}
