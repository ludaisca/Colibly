// Traducción pura de los webhooks `calls` de Cloud API a un estado que el
// resto de Colibly puede guardar. No habla con Meta ni con la base.

export type CallDirection = "USER_INITIATED" | "BUSINESS_INITIATED";
export type TerminalOutcome = "ENDED" | "MISSED" | "FAILED" | "REJECTED";

export interface ParsedCall {
  metaCallId: string;
  event: "connect" | "terminate";
  direction: CallDirection;
  peer: string;
  peerName: string | null;
  sdp: string | null;
  sdpType: "offer" | "answer" | null;
  opaque: string | null;
  outcome: TerminalOutcome | null;
  durationSeconds: number | null;
  endStatus: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface ParsedStatus {
  metaCallId: string;
  status: "RINGING" | "ACCEPTED" | "REJECTED";
}

export interface ParsedCallArtifact {
  metaCallId: string;
  kind: "recording" | "transcript";
  mediaId: string;
  mimeType: string | null;
}

export function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// El par (from, to) no siempre trae `direction`. Si uno de los dos es el
// número del negocio, el otro es la persona. La oferta SDP es una llamada
// entrante; la respuesta SDP es la que nosotros marcamos.
export function resolveCallParty(input: {
  direction?: string | null;
  from?: string | null;
  to?: string | null;
  sdpType?: string | null;
  businessNumber?: string | null;
}): { direction: CallDirection; peer: string } {
  const from = digits(input.from);
  const to = digits(input.to);
  const business = digits(input.businessNumber);
  const raw = (input.direction ?? "").toUpperCase();
  const direction: CallDirection = raw === "BUSINESS_INITIATED" || (!raw && (input.sdpType ?? "").toLowerCase() === "answer")
    ? "BUSINESS_INITIATED"
    : "USER_INITIATED";
  const peer = business && from === business ? to
    : business && to === business ? from
    : direction === "BUSINESS_INITIATED" ? (to || from)
    : (from || to);
  return { direction, peer };
}

export function terminateOutcome(status: unknown, duration: number | null): Exclude<TerminalOutcome, "REJECTED"> {
  const list = (Array.isArray(status) ? status : status == null ? [] : [status]).map((item) => String(item).toUpperCase());
  if (list.some((item) => item.includes("FAIL"))) return "FAILED";
  if ((duration ?? 0) > 0) return "ENDED";
  return "MISSED";
}

const OPEN_STATUSES = new Set(["RINGING", "CONNECTING", "ACTIVE"]);

// Un estado que ya terminó no vuelve atrás. ACCEPTED de Meta es nuestra ACTIVE.
export function statusAfterWebhook(current: string, reported: ParsedStatus["status"]): string {
  if (!OPEN_STATUSES.has(current)) return current;
  if (reported === "ACCEPTED") return "ACTIVE";
  if (reported === "REJECTED") return "REJECTED";
  return current;
}

export function callLogBody(direction: CallDirection, outcome: string, durationSeconds: number | null): string {
  if (outcome === "MISSED") return direction === "USER_INITIATED" ? "Llamada perdida" : "No contestaron";
  if (outcome === "REJECTED") return direction === "USER_INITIATED" ? "Llamada rechazada" : "Rechazaron la llamada";
  if (outcome === "FAILED") return "La llamada no se conectó";
  const seconds = Math.max(0, durationSeconds ?? 0);
  if (seconds < 60) return `Llamada · ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `Llamada · ${minutes} min ${rest} s` : `Llamada · ${minutes} min`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function unixDate(value: unknown): Date | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

function durationOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

const SPEAKER: Record<string, string> = { business: "Nosotros", customer: "Cliente", agent: "Nosotros", user: "Cliente" };

// El JSON de Meta trae un texto completo o segmentos con quién habló.
export function formatCallTranscript(raw: unknown): string {
  const root = asRecord(raw);
  if (!root) return typeof raw === "string" ? raw.trim() : "";
  const nested = asRecord(root.transcript);
  const source = nested && (typeof nested.text === "string" || Array.isArray(nested.segments)) ? nested : root;
  const segments = Array.isArray(source.segments) ? source.segments : Array.isArray(source.utterances) ? source.utterances : null;
  if (segments) {
    const lines: string[] = [];
    for (const item of segments) {
      const row = asRecord(item);
      const text = typeof row?.text === "string" ? row.text.trim() : "";
      if (!text) continue;
      const speaker = typeof row?.speaker === "string" ? row.speaker.trim().toLowerCase() : "";
      const label = SPEAKER[speaker] ?? (typeof row?.speaker === "string" ? row.speaker.trim() : "");
      lines.push(label ? `${label}: ${text}` : text);
    }
    if (lines.length > 0) return lines.join("\n");
  }
  return typeof source.text === "string" ? source.text.trim() : "";
}

function mediaOf(value: unknown): { id: string; mimeType: string | null } | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string" || !row.id) return null;
  return { id: row.id, mimeType: typeof row.mime_type === "string" ? row.mime_type : null };
}

export function parseCallsPayload(value: unknown, businessNumber: string | null): { calls: ParsedCall[]; statuses: ParsedStatus[]; artifacts: ParsedCallArtifact[] } {
  const root = asRecord(value);
  if (!root) return { calls: [], statuses: [], artifacts: [] };

  const nameByWa = new Map<string, string>();
  if (Array.isArray(root.contacts)) {
    for (const item of root.contacts) {
      const row = asRecord(item);
      const wa = digits(typeof row?.wa_id === "string" ? row.wa_id : null);
      const profile = asRecord(row?.profile);
      const name = typeof profile?.name === "string" ? profile.name.trim() : "";
      if (wa && name) nameByWa.set(wa, name);
    }
  }

  const calls: ParsedCall[] = [];
  const artifacts: ParsedCallArtifact[] = [];
  if (Array.isArray(root.calls)) {
    for (const item of root.calls) {
      const row = asRecord(item);
      if (!row || typeof row.id !== "string" || !row.id) continue;
      const event = typeof row.event === "string" ? row.event : "";
      if (event === "call_recording_available" || event === "call_transcript_available" || event === "call_transcription_available") {
        const recording = asRecord(row.call_recording);
        const transcript = asRecord(row.call_transcript) ?? asRecord(row.call_transcription);
        const media = event === "call_recording_available"
          ? mediaOf(recording?.audio)
          : mediaOf(transcript?.document);
        if (media) {
          artifacts.push({
            metaCallId: row.id,
            kind: event === "call_recording_available" ? "recording" : "transcript",
            mediaId: media.id,
            mimeType: media.mimeType,
          });
        }
        continue;
      }
      if (row.event !== "connect" && row.event !== "terminate") continue;
      const session = asRecord(row.session);
      const webrtc = asRecord(asRecord(row.connection)?.webrtc);
      const sdpTypeRaw = typeof session?.sdp_type === "string" ? session.sdp_type.toLowerCase() : null;
      const sdpType = sdpTypeRaw === "offer" || sdpTypeRaw === "answer" ? sdpTypeRaw : null;
      const sdp = typeof session?.sdp === "string" ? session.sdp : typeof webrtc?.sdp === "string" ? webrtc.sdp : null;
      const party = resolveCallParty({
        direction: typeof row.direction === "string" ? row.direction : null,
        from: typeof row.from === "string" ? row.from : null,
        to: typeof row.to === "string" ? row.to : null,
        sdpType,
        businessNumber,
      });
      const durationSeconds = durationOf(row.duration);
      calls.push({
        metaCallId: row.id,
        event: row.event,
        direction: party.direction,
        peer: party.peer,
        peerName: nameByWa.get(party.peer) ?? null,
        sdp,
        sdpType,
        opaque: typeof row.biz_opaque_callback_data === "string" ? row.biz_opaque_callback_data : null,
        outcome: row.event === "terminate" ? terminateOutcome(row.status, durationSeconds) : null,
        durationSeconds,
        endStatus: Array.isArray(row.status) ? row.status.map(String).join(",") : typeof row.status === "string" ? row.status : null,
        startedAt: unixDate(row.start_time),
        endedAt: unixDate(row.end_time),
      });
    }
  }

  const statuses: ParsedStatus[] = [];
  if (Array.isArray(root.statuses)) {
    for (const item of root.statuses) {
      const row = asRecord(item);
      if (!row || typeof row.id !== "string" || !row.id) continue;
      const status = typeof row.status === "string" ? row.status.toUpperCase() : "";
      if (status !== "RINGING" && status !== "ACCEPTED" && status !== "REJECTED") continue;
      statuses.push({ metaCallId: row.id, status });
    }
  }

  return { calls, statuses, artifacts };
}
