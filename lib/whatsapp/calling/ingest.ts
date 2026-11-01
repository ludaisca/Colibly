import { readFile } from "fs/promises";
import { queuePush } from "@/lib/notifications/push";
import type { WAAccount, WACall } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";
import { resolveAbsolutePath, saveMediaFromMeta } from "@/lib/whatsapp/media-store";
import { callLogBody, formatCallTranscript, parseCallsPayload, statusAfterWebhook, type ParsedCall, type ParsedCallArtifact, type TerminalOutcome } from "./events";

const TERMINAL = new Set(["ENDED", "MISSED", "REJECTED", "FAILED"]);

// El webhook de Meta ya validó la firma. Coexistencia no recibe la llamada
// por Cloud API: si igual llega un evento, no timbra en la bandeja.
export async function handleCallsWebhook(account: WAAccount, value: unknown): Promise<void> {
  if (account.coexistence) {
    console.info("[calls] ignorada: número en coexistencia", { accountId: account.id });
    return;
  }
  const parsed = parseCallsPayload(value, account.phoneNumber);
  for (const call of parsed.calls) {
    if (call.event === "connect") await applyConnect(account, call);
    else await applyTerminate(account, call);
  }
  for (const artifact of parsed.artifacts) {
    await applyArtifact(account, artifact);
  }
  for (const reported of parsed.statuses) {
    const row = await prisma.wACall.findUnique({ where: { metaCallId: reported.metaCallId } });
    if (!row || row.accountId !== account.id) continue;
    const next = statusAfterWebhook(row.status, reported.status);
    if (next === row.status) continue;
    await prisma.wACall.update({
      where: { id: row.id },
      data: {
        status: next as WACall["status"],
        startedAt: next === "ACTIVE" ? row.startedAt ?? new Date() : row.startedAt,
        endedAt: next === "REJECTED" ? new Date() : undefined,
        sdpOffer: next === "REJECTED" ? null : undefined,
        sdpAnswer: next === "REJECTED" ? null : undefined,
      },
    });
    if (next === "REJECTED") await writeCallLog(row, "REJECTED", null);
  }
}

async function findRow(call: ParsedCall): Promise<WACall | null> {
  const byMeta = await prisma.wACall.findUnique({ where: { metaCallId: call.metaCallId } });
  if (byMeta) return byMeta;
  if (call.opaque && /^c[a-z0-9]{20,}$/.test(call.opaque)) {
    return prisma.wACall.findUnique({ where: { id: call.opaque } });
  }
  return null;
}

async function linkPeer(accountId: string, peer: string) {
  const candidates = jidCandidates(peer);
  if (candidates.length === 0) return null;
  const contact = await prisma.contact.findFirst({
    where: { accountId, remoteJid: { in: candidates } },
    select: { id: true, name: true, chat: { select: { id: true, assignedToId: true } } },
  });
  if (!contact) return null;
  return {
    contactId: contact.id,
    name: contact.name,
    chatId: contact.chat?.id ?? null,
    assignedToId: contact.chat?.assignedToId ?? null,
  };
}

async function applyConnect(account: WAAccount, call: ParsedCall): Promise<void> {
  const linked = await linkPeer(account.id, call.peer);
  const existing = await findRow(call);
  if (existing) {
    if (existing.accountId !== account.id || TERMINAL.has(existing.status)) return;
    await prisma.wACall.update({
      where: { id: existing.id },
      data: {
        metaCallId: call.metaCallId,
        peerWaId: existing.peerWaId ?? (call.peer || null),
        peerName: existing.peerName ?? call.peerName ?? linked?.name ?? null,
        sdpOffer: call.sdpType === "offer" && call.sdp ? call.sdp : existing.sdpOffer,
        sdpAnswer: call.sdpType === "answer" && call.sdp ? call.sdp : existing.sdpAnswer,
        chatId: existing.chatId ?? linked?.chatId ?? null,
        contactId: existing.contactId ?? linked?.contactId ?? null,
      },
    });
    return;
  }

  await prisma.wACall.create({
    data: {
      organizationId: account.organizationId,
      accountId: account.id,
      metaCallId: call.metaCallId,
      direction: call.direction,
      status: "RINGING",
      peerWaId: call.peer || null,
      peerName: call.peerName ?? linked?.name ?? null,
      sdpOffer: call.sdpType === "offer" ? call.sdp : null,
      sdpAnswer: call.sdpType === "answer" ? call.sdp : null,
      chatId: linked?.chatId ?? null,
      contactId: linked?.contactId ?? null,
    },
  });

  if (call.direction === "USER_INITIATED" && linked?.assignedToId) {
    await prisma.notification.create({
      data: {
        userId: linked.assignedToId,
        type: "WHATSAPP_CALL",
        title: call.peerName ?? linked.name ?? "Llamada de WhatsApp",
        body: "Te están llamando por WhatsApp",
        link: linked.chatId ? `/whatsapp/chat/${account.id}/${linked.chatId}` : "/whatsapp/chat",
      },
    });
    await queuePush(linked.assignedToId, {
      title: call.peerName ?? linked.name ?? "Llamada de WhatsApp",
      body: "Te están llamando por WhatsApp",
      link: linked.chatId ? `/whatsapp/chat/${account.id}/${linked.chatId}` : "/whatsapp/chat",
      tag: `call:${account.id}`,
    });
  }
}

async function applyTerminate(account: WAAccount, call: ParsedCall): Promise<void> {
  const existing = await findRow(call);
  if (!existing || existing.accountId !== account.id) {
    if (existing || call.direction !== "USER_INITIATED") return;
    const linked = await linkPeer(account.id, call.peer);
    const outcome = call.outcome ?? "MISSED";
    const created = await prisma.wACall.create({
      data: {
        organizationId: account.organizationId,
        accountId: account.id,
        metaCallId: call.metaCallId,
        direction: call.direction,
        status: outcome,
        peerWaId: call.peer || null,
        peerName: call.peerName ?? linked?.name ?? null,
        chatId: linked?.chatId ?? null,
        contactId: linked?.contactId ?? null,
        startedAt: call.startedAt,
        endedAt: call.endedAt ?? new Date(),
        durationSeconds: call.durationSeconds,
        endStatus: call.endStatus,
      },
    });
    await writeCallLog(created, outcome, call.durationSeconds);
    return;
  }
  if (TERMINAL.has(existing.status)) return;

  let outcome: TerminalOutcome = call.outcome ?? "ENDED";
  if (existing.status === "REJECTED") outcome = "REJECTED";
  else if ((existing.status === "ACTIVE" || existing.status === "CONNECTING") && (call.durationSeconds ?? 0) > 0) outcome = "ENDED";
  else if (existing.status === "RINGING" && (call.durationSeconds ?? 0) === 0 && outcome !== "FAILED") outcome = "MISSED";

  await prisma.wACall.update({
    where: { id: existing.id },
    data: {
      status: outcome,
      startedAt: call.startedAt ?? existing.startedAt,
      endedAt: call.endedAt ?? new Date(),
      durationSeconds: call.durationSeconds ?? existing.durationSeconds,
      endStatus: call.endStatus,
      sdpOffer: null,
      sdpAnswer: null,
    },
  });
  await writeCallLog(existing, outcome, call.durationSeconds ?? existing.durationSeconds);
}

async function applyArtifact(account: WAAccount, artifact: ParsedCallArtifact): Promise<void> {
  const row = await prisma.wACall.findUnique({ where: { metaCallId: artifact.metaCallId } });
  if (!row || row.accountId !== account.id || !account.accessToken) return;
  if (artifact.kind === "recording" && row.recordingPath) return;
  if (artifact.kind === "transcript" && row.transcript) return;

  let stored;
  try {
    stored = await saveMediaFromMeta(account.id, artifact.mediaId, account.accessToken);
  } catch (error) {
    console.error("[calls] no se pudo guardar el archivo de la llamada", { callId: row.id, kind: artifact.kind, error });
    return;
  }

  if (artifact.kind === "recording") {
    await prisma.wACall.update({
      where: { id: row.id },
      data: { recordingPath: stored.relativePath, recordingMimeType: stored.remoteMimeType || artifact.mimeType },
    });
    await writeRecordingMessage(row, stored.relativePath, stored.remoteMimeType || artifact.mimeType, stored.bytesSize);
    return;
  }

  let text = "";
  try {
    text = formatCallTranscript(JSON.parse(await readFile(resolveAbsolutePath(stored.relativePath), "utf8")));
  } catch (error) {
    console.error("[calls] la transcripción no se pudo leer", { callId: row.id, error });
    return;
  }
  if (!text) {
    console.error("[calls] la transcripción llegó sin texto", { callId: row.id });
    return;
  }
  await prisma.wACall.update({ where: { id: row.id }, data: { transcript: text } });
  await writeTranscript(row, text);
}

async function writeRecordingMessage(row: WACall, mediaUrl: string, mimeType: string | null, bytesSize: number): Promise<void> {
  if (!row.chatId) return;
  const now = new Date();
  try {
    await prisma.wAMessage.create({
      data: {
        wamid: `call-recording:${row.metaCallId}`,
        chatId: row.chatId,
        direction: row.direction === "USER_INITIATED" ? "INBOUND" : "OUTBOUND",
        messageType: "audio",
        body: "Grabación de la llamada",
        mediaUrl,
        mimeType,
        filename: "llamada.ogg",
        bytesSize,
        status: "sent",
        senderId: row.answeredById,
        timestamp: now,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") return;
    throw error;
  }
  if (row.transcript) return;
  await prisma.wAChat.update({
    where: { id: row.chatId },
    data: { lastMessage: "Grabación de la llamada", lastMessageAt: now },
  });
}

async function writeTranscript(row: WACall, transcript: string): Promise<void> {
  if (!row.chatId) return;
  const body = `${callLogBody(row.direction, row.status, row.durationSeconds)}\n\n${transcript}`;
  const now = new Date();
  const existing = await prisma.wAMessage.findFirst({ where: { chatId: row.chatId, wamid: `call:${row.metaCallId}` }, select: { id: true } });
  if (existing) {
    await prisma.wAMessage.update({ where: { id: existing.id }, data: { body } });
  } else {
    await prisma.wAMessage.create({
      data: {
        wamid: `call:${row.metaCallId}`,
        chatId: row.chatId,
        direction: row.direction === "USER_INITIATED" ? "INBOUND" : "OUTBOUND",
        messageType: "text",
        body,
        status: "sent",
        senderId: row.answeredById,
        timestamp: now,
      },
    });
  }
  const preview = transcript.length > 140 ? `${transcript.slice(0, 140)}…` : transcript;
  await prisma.wAChat.update({
    where: { id: row.chatId },
    data: { lastMessage: preview, lastMessageAt: now },
  });
}

async function writeCallLog(row: Pick<WACall, "chatId" | "direction" | "answeredById" | "metaCallId">, outcome: string, durationSeconds: number | null): Promise<void> {
  if (!row.chatId) return;
  const body = callLogBody(row.direction, outcome, durationSeconds);
  const now = new Date();
  try {
    await prisma.wAMessage.create({
      data: {
        wamid: `call:${row.metaCallId}`,
        chatId: row.chatId,
        direction: row.direction === "USER_INITIATED" ? "INBOUND" : "OUTBOUND",
        messageType: "text",
        body,
        status: "sent",
        senderId: row.answeredById,
        timestamp: now,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") return;
    throw error;
  }
  await prisma.wAChat.update({
    where: { id: row.chatId },
    data: { lastMessage: body, lastMessageAt: now },
  });
}
