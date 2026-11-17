"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { Segmented } from "@/app/components/ui/segmented";
import { usePoll } from "@/app/components/ui/use-poll";

// Alta de un número de WhatsApp por QR: primero el nombre (crea la cuenta y su
// device en GoWA), luego la vinculación. La vinculación también se abre desde
// la lista para volver a escanear una cuenta desconectada.

export function WhatsappWebNewModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (account: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setName("");
    setError("");
    onClose();
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) {
      setError("El nombre es requerido");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp-web/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la cuenta");
      setName("");
      onCreated({ id: data.id, name: data.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Conectar número por QR"
      description="Después escaneas un código QR con el WhatsApp de ese teléfono."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={() => handleSubmit()} disabled={saving}>{saving ? <Spinner /> : "Continuar"}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Banner tone="info">
          WhatsApp por QR no es la API oficial de Meta: WhatsApp puede suspender el número si detecta envíos masivos o a personas que no te tienen agregado.
        </Banner>
        <FormField label="Nombre" error={error || undefined}>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ventas" maxLength={100} autoFocus />}
        </FormField>
      </form>
    </Modal>
  );
}

type LinkState =
  | { phase: "loading" }
  | { phase: "qr"; qr: string; expiresAt: number }
  | { phase: "connected"; phone: string | null }
  | { phase: "error"; message: string };

export function WhatsappWebLinkModal({
  account,
  onClose,
  onConnected,
}: {
  account: { id: string; name: string } | null;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [state, setState] = useState<LinkState>({ phase: "loading" });
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState("");
  const [requestingCode, setRequestingCode] = useState(false);
  const connectedRef = useRef(false);
  const accountId = account?.id ?? null;

  const check = useCallback(
    async (withQr: boolean) => {
      if (!accountId || connectedRef.current) return;
      try {
        const res = await fetch(`/api/whatsapp-web/accounts/${accountId}/conexion${withQr ? "?qr=1" : ""}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo consultar la conexión");
        if (data.status === "CONNECTED") {
          connectedRef.current = true;
          setState({ phase: "connected", phone: data.phone ?? null });
          onConnected();
          return;
        }
        if (withQr && data.qr) {
          setState({ phase: "qr", qr: data.qr, expiresAt: Date.now() + (data.expiresInSeconds ?? 30) * 1000 });
        }
      } catch (err) {
        setState({ phase: "error", message: err instanceof Error ? err.message : "No se pudo consultar la conexión" });
      }
    },
    [accountId, onConnected]
  );

  useEffect(() => {
    if (!accountId) return;
    connectedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio al abrir otra cuenta
    setState({ phase: "loading" });
    setCode(null);
    setCodeError("");
    void check(true);
  }, [accountId, check]);

  // Estado cada 3 s; QR nuevo solo cuando el anterior vence.
  const poll = useCallback(async () => {
    const qrExpired = mode === "qr" && state.phase === "qr" && Date.now() > state.expiresAt - 2000;
    await check(qrExpired);
  }, [check, mode, state]);
  usePoll(poll, { intervalMs: 3000, immediate: false, enabled: !!accountId && state.phase !== "connected" && state.phase !== "error" });

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!accountId) return;
    setRequestingCode(true);
    setCodeError("");
    try {
      const res = await fetch(`/api/whatsapp-web/accounts/${accountId}/conexion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo generar el código");
      setCode(data.code);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "No se pudo generar el código");
    } finally {
      setRequestingCode(false);
    }
  }

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={account ? `Vincular ${account.name}` : "Vincular"}
      size="sm"
      footer={<Button variant={state.phase === "connected" ? "primary" : "secondary"} onClick={onClose}>{state.phase === "connected" ? "Listo" : "Cerrar"}</Button>}
    >
      {state.phase === "connected" ? (
        <Banner tone="success">Número vinculado{state.phone ? `: +${state.phone}` : ""}. Los mensajes nuevos llegan a Chats.</Banner>
      ) : state.phase === "error" ? (
        <div className="space-y-3">
          <Banner tone="danger">{state.message}</Banner>
          <Button variant="secondary" onClick={() => { setState({ phase: "loading" }); void check(true); }}>Reintentar</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Segmented
            label="Forma de vincular"
            value={mode}
            onChange={setMode}
            options={[
              { value: "qr", label: "Código QR" },
              { value: "code", label: "Código de 8 letras" },
            ]}
          />
          {mode === "qr" ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Abre WhatsApp en el teléfono del número.</li>
                <li>Ve a Dispositivos vinculados → Vincular un dispositivo.</li>
                <li>Escanea este código.</li>
              </ol>
              <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-surface">
                {state.phase === "qr" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL generada por el servidor
                  <img src={state.qr} alt="Código QR para vincular WhatsApp" width={240} height={240} className="h-60 w-60 [image-rendering:pixelated]" />
                ) : (
                  <Spinner />
                )}
              </div>
              <p className="text-xs text-muted">El código se renueva solo. Esta ventana detecta la vinculación sola.</p>
            </>
          ) : (
            <form onSubmit={requestCode} className="space-y-3">
              <FormField label="Número con lada" error={codeError || undefined}>
                {(id) => <Input id={id} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5215512345678" inputMode="numeric" />}
              </FormField>
              <Button type="submit" variant="secondary" size="sm" disabled={requestingCode || !phone.trim()}>
                {requestingCode ? <Spinner /> : "Generar código"}
              </Button>
              {code && (
                <div className="space-y-1">
                  <p className="text-figure tracking-widest text-foreground">{code}</p>
                  <p className="text-sm text-muted">En WhatsApp: Dispositivos vinculados → Vincular un dispositivo → Vincular con el número de teléfono, y escribe este código.</p>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
