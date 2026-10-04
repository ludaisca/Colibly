import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import type { LookupAddress } from "node:dns";
import { HTTP_TIMEOUT_MS } from "@/lib/http-timeouts";

// HTTP saliente hacia URLs que configura un usuario (webhooks salientes, nodo
// "Webhook" de las automatizaciones). Sin esto, cualquier admin de un cliente
// podía hacer que el servidor pidiera http://169.254.169.254 (metadata de la
// nube), http://redis:6379 o la red interna de Coolify.
//
// La IP se valida en el `lookup` del socket, es decir, en el momento de
// conectar — no en una resolución previa. Validar antes y conectar después
// deja abierto el DNS rebinding (el dominio resuelve a una IP pública al
// validar y a una privada al conectar). Tampoco se siguen redirects: un 30x
// hacia una IP interna saltaría la validación.

export class SafeFetchError extends Error {
  constructor(
    public readonly code: "INVALID_URL" | "BLOCKED_ADDRESS" | "TIMEOUT" | "NETWORK",
    message: string
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

const blockList = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "esta red"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, metadata de la nube
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado + broadcast
] as const) {
  blockList.addSubnet(net, prefix, "ipv4");
}
blockList.addAddress("::", "ipv6");
blockList.addAddress("::1", "ipv6");
for (const [net, prefix] of [
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["2001:db8::", 32], // documentación
  ["64:ff9b::", 96], // NAT64: traduce a IPv4 arbitrarias, incluidas las privadas
] as const) {
  blockList.addSubnet(net, prefix, "ipv6");
}

// IPv4 embebida en IPv6 (::ffff:10.0.0.1 o ::ffff:a00:1) — se evalúa como la
// IPv4 que realmente es.
function mappedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return null;
}

// En desarrollo se permite hablar con receptores locales (loopback y LAN
// privada), pero nunca con link-local/metadata de la nube ni rangos reservados:
// un entorno de desarrollo en una VM también tiene credenciales en
// 169.254.169.254.
const devAllowList = new BlockList();
for (const [net, prefix] of [["127.0.0.0", 8], ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const) {
  devAllowList.addSubnet(net, prefix, "ipv4");
}
devAllowList.addAddress("::1", "ipv6");
devAllowList.addSubnet("fc00::", 7, "ipv6");

export function isAllowedInDevelopment(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return false;
  if (version === 6) {
    const v4 = mappedIPv4(ip);
    if (v4) return isAllowedInDevelopment(v4);
    return devAllowList.check(ip, "ipv6");
  }
  return devAllowList.check(ip, "ipv4");
}

function isRejected(ip: string, allowPrivateNetwork: boolean): boolean {
  return isBlockedAddress(ip) && !(allowPrivateNetwork && isAllowedInDevelopment(ip));
}

export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return true; // no es una IP: nada que conectar con seguridad
  if (version === 6) {
    const v4 = mappedIPv4(ip);
    if (v4) return isBlockedAddress(v4);
    return blockList.check(ip, "ipv6");
  }
  return blockList.check(ip, "ipv4");
}

export interface SafeFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  // Solo para desarrollo local: permite loopback y LAN privada (nunca
  // link-local/metadata). Por defecto, true únicamente con
  // NODE_ENV=development — en producción nunca.
  allowPrivateNetwork?: boolean;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}

// Valida forma y protocolo; devuelve la URL parseada. Se exporta para validar
// la URL de un webhook al guardarlo, antes de intentar ninguna entrega.
export function parseSafeUrl(raw: string, allowPrivateNetwork = defaultAllowPrivate()): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("INVALID_URL", "La URL no es válida");
  }
  if (url.protocol !== "https:" && !(allowPrivateNetwork && url.protocol === "http:")) {
    throw new SafeFetchError("INVALID_URL", "La URL debe usar https://");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("INVALID_URL", "La URL no puede llevar usuario ni contraseña");
  }
  // El parser WHATWG ya normaliza formas raras de IPv4 (2130706433,
  // 0177.0.0.1, 0x7f.1) a decimal con puntos, así que esta comprobación
  // también las cubre.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isRejected(host, allowPrivateNetwork)) {
    throw new SafeFetchError("BLOCKED_ADDRESS", "La URL apunta a una dirección interna o reservada");
  }
  return url;
}

function defaultAllowPrivate(): boolean {
  return process.env.NODE_ENV === "development";
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(allowPrivateNetwork: boolean) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const list = addresses as LookupAddress[];
      if (list.some((a) => isRejected(a.address, allowPrivateNetwork))) {
        return callback(new SafeFetchError("BLOCKED_ADDRESS", "La URL resuelve a una dirección interna o reservada"), "");
      }
      if (list.length === 0) return callback(new SafeFetchError("NETWORK", `No se pudo resolver ${hostname}`), "");
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const allowPrivateNetwork = options.allowPrivateNetwork ?? defaultAllowPrivate();
  const url = parseSafeUrl(rawUrl, allowPrivateNetwork);
  const maxBytes = options.maxResponseBytes ?? 64 * 1024;
  const client = url.protocol === "https:" ? https : http;

  return new Promise<SafeFetchResponse>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          "User-Agent": "Colibly-Webhooks/1.0 (+https://colibly.com)",
          ...(options.body !== undefined ? { "Content-Length": Buffer.byteLength(options.body).toString() } : {}),
          ...options.headers,
        },
        lookup: guardedLookup(allowPrivateNetwork) as unknown as typeof dns.lookup,
        signal: AbortSignal.timeout(options.timeoutMs ?? HTTP_TIMEOUT_MS),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")])
            ),
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
          });
        res.on("end", finish);
        res.on("close", () => truncated && finish());
        res.on("error", (err) => (truncated ? finish() : reject(new SafeFetchError("NETWORK", err.message))));
      }
    );
    req.on("error", (err) => {
      if (err instanceof SafeFetchError) return reject(err);
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        return reject(new SafeFetchError("TIMEOUT", "El destino no respondió a tiempo"));
      }
      reject(new SafeFetchError("NETWORK", err.message));
    });
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}
