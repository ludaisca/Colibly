"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/app/components/ui/button";

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
// Ritmo del sondeo (revisión 2026-11-07; antes 2 s siempre): en llamada se
// sigue su estado cada 2 s; esperando el timbre, cada 4 s con la pestaña
// visible y cada 12 s oculta (el aviso push cubre el timbre ahí).
const IN_CALL_MS = 2000;
const RING_MS = 4000;
const RING_HIDDEN_MS = 12_000;

interface LiveCall {
  id: string;
  direction: "USER_INITIATED" | "BUSINESS_INITIATED";
  status: string;
  peerName: string | null;
  peerWaId: string | null;
  hasAnswer?: boolean;
  sdpOffer?: string | null;
  sdpAnswer?: string | null;
}

type Phase = "idle" | "incoming" | "connecting" | "active" | "permission";

function waitIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(finish, 2500);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

function waitConnected(pc: RTCPeerConnection): Promise<void> {
  if (pc.connectionState === "connected") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      pc.removeEventListener("connectionstatechange", onChange);
      if (ok) resolve();
      else reject(new Error("No se conectó el audio"));
    };
    const onChange = () => {
      if (pc.connectionState === "connected") finish(true);
      if (pc.connectionState === "failed" || pc.connectionState === "closed") finish(false);
    };
    const timer = setTimeout(() => finish(false), 20_000);
    pc.addEventListener("connectionstatechange", onChange);
  });
}

function micError(error: unknown): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "NotFoundError")) {
    return "Permite el micrófono del navegador para usar la llamada";
  }
  return error instanceof Error ? error.message : "No se pudo usar el audio";
}

export function CallDock({ pollIncoming = true }: { pollIncoming?: boolean } = {}) {
  const [incoming, setIncoming] = useState<LiveCall | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionChatId, setPermissionChatId] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const incomingIdRef = useRef<string | null>(null);
  const epochRef = useRef(0);
  const placeCallRef = useRef<(chatId: string, name: string) => Promise<void>>(async () => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function closeMedia() {
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    callIdRef.current = null;
    setMuted(false);
  }

  function bindAudio(pc: RTCPeerConnection) {
    pc.ontrack = (event) => {
      const remote = event.streams[0];
      if (!audioRef.current || !remote) return;
      audioRef.current.srcObject = remote;
      void audioRef.current.play().catch(() => {});
    };
  }

  async function signal(id: string, action: string, sdp?: string) {
    const res = await fetch(`/api/whatsapp/calls/${id}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sdp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo actualizar la llamada");
  }

  async function answer(call: LiveCall) {
    const ticket = ++epochRef.current;
    setBusy(true);
    setNote(null);
    setPhase("connecting");
    setLabel(call.peerName || call.peerWaId || "Llamada");
    try {
      const detailRes = await fetch(`/api/whatsapp/calls/${call.id}`);
      const detail = await detailRes.json() as LiveCall & { error?: string };
      if (!detailRes.ok) throw new Error(detail.error ?? "No se pudo tomar la llamada");
      if (typeof detail.sdpOffer !== "string") throw new Error("La llamada ya no está disponible");
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;
      callIdRef.current = call.id;
      bindAudio(pc);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription({ type: "offer", sdp: detail.sdpOffer });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("No se armó el audio");
      if (epochRef.current !== ticket) {
        closeMedia();
        return;
      }
      await signal(call.id, "pre_accept", sdp);
      await waitConnected(pc);
      if (epochRef.current !== ticket) return;
      await signal(call.id, "accept", sdp);
      setIncoming(null);
      incomingIdRef.current = null;
      setPhase("active");
    } catch (error) {
      if (epochRef.current === ticket) {
        closeMedia();
        setPhase("idle");
        setNote(micError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function decline(call: LiveCall) {
    epochRef.current += 1;
    setBusy(true);
    try {
      await signal(call.id, "reject");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "No se pudo rechazar");
    } finally {
      closeMedia();
      setIncoming(null);
      incomingIdRef.current = null;
      setPhase("idle");
      setBusy(false);
    }
  }

  async function endCall() {
    const id = callIdRef.current;
    epochRef.current += 1;
    setBusy(true);
    try {
      if (id) await signal(id, "terminate");
    } catch {
      // Si el otro lado ya colgó, igual cerramos el audio local.
    } finally {
      closeMedia();
      setPermissionChatId(null);
      setPhase("idle");
      setBusy(false);
    }
  }

  async function placeCall(chatId: string, name: string) {
    if (phaseRef.current === "active" || phaseRef.current === "connecting") {
      setNote("Ya hay una llamada en curso");
      return;
    }
    if (phaseRef.current === "incoming") {
      setNote("Primero contesta o rechaza la llamada que está sonando");
      return;
    }
    const ticket = ++epochRef.current;
    setBusy(true);
    setNote(null);
    setPermissionChatId(null);
    setLabel(name);
    setPhase("connecting");
    try {
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;
      bindAudio(pc);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("No se armó el audio");
      if (epochRef.current !== ticket) {
        closeMedia();
        return;
      }
      const res = await fetch("/api/whatsapp/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, sdp }),
      });
      const data = await res.json().catch(() => ({})) as { id?: string; error?: string; code?: string };
      if (epochRef.current !== ticket) {
        if (res.ok && data.id) await signal(data.id, "terminate").catch(() => {});
        closeMedia();
        return;
      }
      if (!res.ok) {
        closeMedia();
        if (data.code === "call_permission") {
          setPermissionChatId(chatId);
          setPhase("permission");
          setNote(data.error ?? "Hace falta permiso para llamar");
          return;
        }
        setPhase("idle");
        setNote(data.error ?? "No se pudo llamar");
        return;
      }
      callIdRef.current = data.id ?? null;
      const started = Date.now();
      while (Date.now() - started < 45_000 && epochRef.current === ticket && data.id) {
        const detailRes = await fetch(`/api/whatsapp/calls/${data.id}`);
        const detail = await detailRes.json() as LiveCall;
        if (["REJECTED", "FAILED", "ENDED", "MISSED"].includes(detail.status)) {
          closeMedia();
          setPhase("idle");
          setNote(detail.status === "REJECTED" ? "No contestaron" : "La llamada no se conectó");
          return;
        }
        if (typeof detail.sdpAnswer === "string" && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription({ type: "answer", sdp: detail.sdpAnswer });
        }
        if (pc.connectionState === "connected" || detail.status === "ACTIVE") {
          setPhase("active");
          setLabel(name);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (epochRef.current === ticket) {
        if (data.id) await signal(data.id, "terminate").catch(() => {});
        closeMedia();
        setPhase("idle");
        setNote("No contestaron");
      }
    } catch (error) {
      if (epochRef.current === ticket) {
        closeMedia();
        setPhase("idle");
        setNote(micError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    placeCallRef.current = placeCall;
  });

  async function requestPermission() {
    if (!permissionChatId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/calls/permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: permissionChatId }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo pedir permiso");
      setNote("Se envió la solicitud. Cuando la acepten, ya se puede llamar.");
      setPhase("idle");
      setPermissionChatId(null);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "No se pudo pedir permiso");
    } finally {
      setBusy(false);
    }
  }

  function toggleMute() {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }

  useEffect(() => {
    const onCall = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: string; name?: string }>).detail;
      if (detail?.chatId) void placeCallRef.current(detail.chatId, detail.name || "Llamada");
    };
    const onHide = () => {
      const id = callIdRef.current;
      if (!id) return;
      void fetch(`/api/whatsapp/calls/${id}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminate" }),
        keepalive: true,
      });
    };
    window.addEventListener("colibly-whatsapp-call", onCall);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("colibly-whatsapp-call", onCall);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Siguiente consulta según el momento: se programa al terminar la anterior
    // (nunca se solapan, como usePoll).
    function nextDelay() {
      const current = phaseRef.current;
      if (current === "active" || current === "connecting" || current === "incoming") return IN_CALL_MS;
      return document.visibilityState === "hidden" ? RING_HIDDEN_MS : RING_MS;
    }
    function schedule() {
      if (stop) return;
      timer = setTimeout(now, nextDelay());
    }
    async function tick() {
      if (stop) return;
      const current = phaseRef.current;
      const id = callIdRef.current;
      const inCall = (current === "active" || current === "connecting") && !!id;
      // Sin Calling API en la organización no hay timbre que esperar.
      if (!inCall && current !== "incoming" && !pollIncoming) return;
      try {
        if ((current === "active" || current === "connecting") && id) {
          const res = await fetch(`/api/whatsapp/calls/${id}`);
          if (!res.ok) return;
          const detail = await res.json() as LiveCall;
          if (["ENDED", "MISSED", "FAILED", "REJECTED"].includes(detail.status)) {
            epochRef.current += 1;
            closeMedia();
            setPhase("idle");
            if (detail.status === "REJECTED") setNote("Colgaron");
          }
          return;
        }
        const res = await fetch("/api/whatsapp/calls");
        if (!res.ok) return;
        const calls = await res.json() as LiveCall[];
        const ring = calls.find((call) => call.direction === "USER_INITIATED" && call.status === "RINGING") ?? null;
        if (current === "incoming") {
          if (!ring || ring.id !== incomingIdRef.current) {
            setIncoming(null);
            incomingIdRef.current = null;
            setPhase("idle");
          }
          return;
        }
        if (current === "idle" && ring) {
          incomingIdRef.current = ring.id;
          setIncoming(ring);
          setPhase("incoming");
          setLabel(ring.peerName || ring.peerWaId || "Llamada");
        }
      } catch {
        // El siguiente ciclo vuelve a intentar.
      }
    }
    // Al volver a la pestaña se consulta en el acto (no se espera el ciclo de 12 s).
    let running = false;
    function now() {
      if (stop || running) return;
      if (timer) clearTimeout(timer);
      running = true;
      void tick().finally(() => { running = false; schedule(); });
    }
    const onVisible = () => { if (document.visibilityState === "visible") now(); };
    document.addEventListener("visibilitychange", onVisible);
    now();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollIncoming]);

  const visible = phase !== "idle" || note;
  const title = phase === "incoming" ? "Llamada entrante" : phase === "permission" ? "Permiso para llamar" : phase === "connecting" ? "Conectando" : phase === "active" ? "En llamada" : "Llamada";

  return (
    <>
      <audio ref={audioRef} autoPlay className="hidden" />
      {visible && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-4 shadow-lg">
          <p className="text-xs font-medium text-muted-darker">{title}</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{label || "WhatsApp"}</p>
          {note && <p className="mt-2 text-xs text-muted-darker">{note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {phase === "incoming" && incoming && (
              <>
                <Button type="button" size="sm" icon={Phone} loading={busy} onClick={() => void answer(incoming)}>Contestar</Button>
                <Button type="button" size="sm" variant="danger" icon={PhoneOff} disabled={busy} onClick={() => void decline(incoming)}>Rechazar</Button>
              </>
            )}
            {(phase === "connecting" || phase === "active") && (
              <>
                <Button type="button" size="sm" variant="secondary" icon={muted ? MicOff : Mic} onClick={toggleMute}>{muted ? "Activar micrófono" : "Silenciar"}</Button>
                <Button type="button" size="sm" variant="danger" icon={PhoneOff} loading={busy} onClick={() => void endCall()}>Colgar</Button>
              </>
            )}
            {phase === "permission" && (
              <Button type="button" size="sm" loading={busy} onClick={() => void requestPermission()}>Pedir permiso para llamar</Button>
            )}
            {phase === "idle" && note && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setNote(null)}>Cerrar</Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
