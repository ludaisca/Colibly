// Allowlist de IP por token. Acepta IPv4/IPv6 exactas y CIDR.
// La lista vacía significa "cualquier IP"; para secret:write es obligatoria.
// Se evalúa contra clientIp(), que ya confía solo en X-Real-Ip / el último
// elemento de X-Forwarded-For (ver lib/net/client-ip.ts).

function ipv4ToBigInt(ip: string): bigint | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return parts.reduce((acc, n) => (acc << BigInt(8)) | BigInt(n), BigInt(0));
}

function ipv6ToBigInt(ip: string): bigint | null {
  let s = ip.trim().toLowerCase().split("%")[0];
  if (!s.includes(":")) return null;

  // IPv4 incrustada (::ffff:192.0.2.1).
  const v4 = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const value = ipv4ToBigInt(v4[2]);
    if (value === null) return null;
    s = `${v4[1]}${((value >> BigInt(16)) & BigInt(0xffff)).toString(16)}:${(value & BigInt(0xffff)).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 0) return null;

  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill("0"), ...tail];
  let acc = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    acc = (acc << BigInt(16)) | BigInt(Number.parseInt(group, 16));
  }
  return acc;
}

function mask(value: bigint, bits: number, total: number): bigint {
  if (bits <= 0) return BigInt(0);
  if (bits >= total) return value;
  const shift = BigInt(total - bits);
  return (value >> shift) << shift;
}

function matches(ip: string, entry: string): boolean {
  const [networkRaw, prefixRaw] = entry.split("/");
  const network = networkRaw?.trim();
  if (!network) return false;
  const prefix = prefixRaw === undefined ? null : Number.parseInt(prefixRaw, 10);
  if (prefix !== null && (!Number.isInteger(prefix) || prefix < 0)) return false;

  const v4 = ipv4ToBigInt(ip);
  const net4 = ipv4ToBigInt(network);
  if (v4 !== null && net4 !== null) {
    const bits = prefix ?? 32;
    if (bits > 32) return false;
    return mask(v4, bits, 32) === mask(net4, bits, 32);
  }

  const v6 = ipv6ToBigInt(ip);
  const net6 = ipv6ToBigInt(network);
  if (v6 !== null && net6 !== null) {
    const bits = prefix ?? 128;
    if (bits > 128) return false;
    return mask(v6, bits, 128) === mask(net6, bits, 128);
  }

  return false;
}

export function ipAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  const candidate = ip.trim();
  if (!candidate || candidate === "unknown") return false;
  return allowlist.some((entry) => matches(candidate, entry));
}
