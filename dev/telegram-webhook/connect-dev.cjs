// Operación puntual de DEV. Lee el token por stdin para que no quede en el
// comando, en el historial de shell ni en el repositorio.
const { createCipheriv, randomBytes } = require("node:crypto");
const { createInterface } = require("node:readline");
const { PrismaClient } = require("@prisma/client");

async function readToken() {
  const input = createInterface({ input: process.stdin });
  const token = (await new Promise((resolve) => input.once("line", resolve))).trim();
  input.close();
  if (token.length > 1024) throw new Error("Entrada demasiado larga");
  if (!/^\d+:[\w-]+$/.test(token)) throw new Error("Formato de token inválido");
  return token;
}

function encrypt(plaintext) {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[a-f\d]{64}$/i.test(hex)) throw new Error("ENCRYPTION_KEY inválida");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(hex, "hex"), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${body.toString("hex")}`;
}

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method}: ${result.description ?? response.status}`);
  return result.result;
}

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Solo se ejecuta en DEV");
  const origin = new URL(process.env.TELEGRAM_WEBHOOK_BASE_URL || "");
  if (origin.protocol !== "https:") throw new Error("Falta TELEGRAM_WEBHOOK_BASE_URL HTTPS");
  const token = await readToken();
  const prisma = new PrismaClient();
  try {
    const owner = await prisma.user.findUnique({
      where: { email: "luis.islas@ludaisca.com" },
      select: { id: true, organizationId: true, organization: { select: { name: true, channelTelegramEnabled: true } } },
    });
    if (!owner || owner.organization?.name !== "Colibly" || !owner.organization.channelTelegramEnabled) {
      throw new Error("La organización Colibly de DEV no tiene Telegram habilitado");
    }
    const existing = await prisma.channelAccount.findFirst({
      where: { organizationId: owner.organizationId, channel: "TELEGRAM", name: "Telegram QA DEV" },
      select: { id: true },
    });
    if (existing) throw new Error(`La cuenta Telegram QA DEV ya existe: ${existing.id}`);

    const bot = await telegram(token, "getMe");
    if (!bot.is_bot) throw new Error("El token no pertenece a un bot");
    const prior = await telegram(token, "getWebhookInfo");
    if (prior.url && !new URL(prior.url).hostname.endsWith(".trycloudflare.com")) {
      throw new Error("El bot ya tiene un webhook ajeno al túnel de DEV");
    }

    const webhookSecret = randomBytes(24).toString("hex");
    const account = await prisma.channelAccount.create({
      data: {
        userId: owner.id,
        organizationId: owner.organizationId,
        channel: "TELEGRAM",
        name: "Telegram QA DEV",
        credentials: encrypt(JSON.stringify({ botToken: token, webhookSecret })),
        status: "PENDING",
      },
      select: { id: true },
    });
    const url = new URL(`/api/telegram/webhook/${account.id}`, origin).toString();
    try {
      await telegram(token, "setWebhook", { url, secret_token: webhookSecret });
      await prisma.channelAccount.update({
        where: { id: account.id },
        data: { status: "CONNECTED", lastActivity: new Date() },
      });
      const info = await telegram(token, "getWebhookInfo");
      console.log(JSON.stringify({ accountId: account.id, botUsername: bot.username, webhookHost: new URL(info.url).hostname, pendingUpdateCount: info.pending_update_count }));
    } catch (error) {
      await prisma.channelAccount.update({
        where: { id: account.id },
        data: { status: "ERROR", errorMessage: error.message },
      });
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
