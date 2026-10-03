import { randomInt } from "crypto";
import type { BusinessToken, WabaPhoneNumber } from "./meta";

// Alta de un cliente con Embedded Signup: lo que ocurre en el servidor después
// de que el diálogo de Meta devuelve {code, waba_id, phone_number_id}. Las
// dependencias se inyectan (Graph, base de datos, cola) para probar cada rama
// sin red ni base de datos.

export class EmbeddedSignupError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "EmbeddedSignupError";
  }
}

export interface EmbeddedSignupInput {
  userId: string;
  organizationId: string;
  code: string;
  wabaId: string;
  // Puede venir vacío: el evento de coexistencia solo trae waba_id y el número
  // se resuelve con la lista de números de la WABA.
  phoneNumberId: string | null;
  // Lo que el cliente dice haber elegido; la verdad la fija Meta (is_on_biz_app).
  coexistenceRequested: boolean;
  coexistenceAllowed: boolean;
  name?: string;
}

export interface PlatformApp {
  appId: string;
  appSecret: string;
}

export interface NewEmbeddedAccount {
  userId: string;
  organizationId: string;
  name: string;
  phoneNumber: string | null;
  phoneNumberId: string;
  wabaId: string;
  appId: string;
  accessTokenPlain: string;
  tokenExpiresAt: Date | null;
  coexistence: boolean;
  twoStepPinPlain: string | null;
  metaUserId: string | null;
  syncDeadlineAt: Date | null;
}

export interface EmbeddedSignupDeps {
  now: () => Date;
  exchangeCodeForToken: (code: string) => Promise<BusinessToken>;
  listWabaPhoneNumbers: (wabaId: string, token: string) => Promise<WabaPhoneNumber[]>;
  subscribeAppToWaba: (wabaId: string, token: string) => Promise<void>;
  registerPhoneNumber: (phoneNumberId: string, token: string, pin: string) => Promise<void>;
  lookupTokenUserId: (token: string) => Promise<string | null>;
  generatePin: () => string;
  phoneNumberIdTaken: (phoneNumberId: string) => Promise<boolean>;
  uniqueAccountName: (userId: string, desired: string) => Promise<string>;
  createAccount: (data: NewEmbeddedAccount) => Promise<{ id: string }>;
  enqueueCoexistenceSync: (accountId: string) => Promise<void>;
}

export const SYNC_WINDOW_HOURS = 24;

// PIN de 6 dígitos para el registro del número (verificación en dos pasos).
export function generateRegistrationPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function tokenExpiry(now: Date, expiresInSeconds: number | null): Date | null {
  return expiresInSeconds && expiresInSeconds > 0 ? new Date(now.getTime() + expiresInSeconds * 1000) : null;
}

export interface EmbeddedSignupResult {
  accountId: string;
  coexistence: boolean;
  syncDeadlineAt: Date | null;
  registered: boolean;
}

// Elige el número cuando el navegador no lo informó: el de la app WhatsApp
// Business si se pidió coexistencia, o el único de la cuenta. Si hay más de uno
// no se adivina.
export function pickPhoneNumber(numbers: WabaPhoneNumber[], coexistenceRequested: boolean): WabaPhoneNumber | "ambiguous" | undefined {
  const pool = coexistenceRequested && numbers.some((n) => n.is_on_biz_app === true) ? numbers.filter((n) => n.is_on_biz_app === true) : numbers;
  if (pool.length === 0) return undefined;
  return pool.length === 1 ? pool[0] : "ambiguous";
}

export async function completeEmbeddedSignup(input: EmbeddedSignupInput, app: PlatformApp, deps: EmbeddedSignupDeps): Promise<EmbeddedSignupResult> {
  // Con el id conocido se rechaza antes de gastar el código de autorización.
  if (input.phoneNumberId && (await deps.phoneNumberIdTaken(input.phoneNumberId))) {
    throw new EmbeddedSignupError("Este número de WhatsApp ya está conectado en Colibly.", 409, "phone_in_use");
  }

  let token: BusinessToken;
  try {
    token = await deps.exchangeCodeForToken(input.code);
  } catch (e) {
    throw new EmbeddedSignupError(`No se pudo completar la autorización con Meta: ${message(e)}`, 502, "token_exchange_failed");
  }

  // El navegador manda waba_id/phone_number_id; se confirman con el token, que
  // solo ve los activos que el cliente compartió.
  let numbers: WabaPhoneNumber[];
  try {
    numbers = await deps.listWabaPhoneNumbers(input.wabaId, token.accessToken);
  } catch (e) {
    throw new EmbeddedSignupError(`No se pudieron leer los números de la cuenta de WhatsApp: ${message(e)}`, 502, "waba_read_failed");
  }
  let phone: WabaPhoneNumber | undefined;
  if (input.phoneNumberId) {
    phone = numbers.find((p) => p.id === input.phoneNumberId);
    if (!phone) throw new EmbeddedSignupError("El número elegido no pertenece a esa cuenta de WhatsApp Business.", 400, "phone_not_in_waba");
  } else {
    const picked = pickPhoneNumber(numbers, input.coexistenceRequested);
    if (picked === "ambiguous") throw new EmbeddedSignupError("La cuenta tiene varios números; no se pudo saber cuál conectar.", 409, "ambiguous_phone");
    if (!picked) throw new EmbeddedSignupError("La cuenta de WhatsApp no tiene números disponibles.", 400, "no_phone");
    phone = picked;
    if (await deps.phoneNumberIdTaken(phone.id)) throw new EmbeddedSignupError("Este número de WhatsApp ya está conectado en Colibly.", 409, "phone_in_use");
  }
  const phoneNumberId = phone.id;

  const coexistence = phone.is_on_biz_app === true;
  if (coexistence && !input.coexistenceAllowed) {
    throw new EmbeddedSignupError("La conexión de números de la app WhatsApp Business todavía no está habilitada para tu organización.", 403, "coexistence_disabled");
  }

  try {
    await deps.subscribeAppToWaba(input.wabaId, token.accessToken);
  } catch (e) {
    throw new EmbeddedSignupError(`No se pudo suscribir la cuenta a los webhooks: ${message(e)}`, 502, "subscribe_failed");
  }

  // Número nuevo: se registra en Cloud API con un PIN generado aquí. En
  // coexistencia el número ya está registrado por la app, no se toca.
  let pin: string | null = null;
  if (!coexistence) {
    pin = deps.generatePin();
    try {
      await deps.registerPhoneNumber(phoneNumberId, token.accessToken, pin);
    } catch (e) {
      throw new EmbeddedSignupError(`No se pudo registrar el número en WhatsApp: ${message(e)}`, 502, "register_failed");
    }
  }

  const now = deps.now();
  const name = await deps.uniqueAccountName(input.userId, (input.name?.trim() || phone.verified_name || phone.display_phone_number || "WhatsApp").slice(0, 80));
  const syncDeadlineAt = coexistence ? new Date(now.getTime() + SYNC_WINDOW_HOURS * 3_600_000) : null;
  const account = await deps.createAccount({
    userId: input.userId,
    organizationId: input.organizationId,
    name,
    phoneNumber: phone.display_phone_number ?? null,
    phoneNumberId,
    wabaId: input.wabaId,
    appId: app.appId,
    accessTokenPlain: token.accessToken,
    tokenExpiresAt: tokenExpiry(now, token.expiresIn),
    coexistence,
    twoStepPinPlain: pin,
    metaUserId: await deps.lookupTokenUserId(token.accessToken),
    syncDeadlineAt,
  });

  // La sincronización debe pedirse dentro de las 24 h: se encola de inmediato.
  if (coexistence) await deps.enqueueCoexistenceSync(account.id);

  return { accountId: account.id, coexistence, syncDeadlineAt, registered: !coexistence };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "error desconocido";
}
