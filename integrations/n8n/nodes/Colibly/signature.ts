import { createHmac, timingSafeEqual } from 'crypto';

// Verificación de X-Colibly-Signature (mismo esquema que Stripe):
//   t=<unix segundos>,v1=<hex(hmac_sha256(secret, `${t}.${body}`))>
// Durante la rotación de un secreto el header trae una v1 por secreto; basta
// con que una coincida. Se rechazan firmas con más de `toleranceSeconds` de
// diferencia con el reloj local (reenvíos viejos).

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function parseSignatureHeader(header: string | undefined | null): { t: number; v1: string[] } | null {
	if (!header) return null;
	let t = NaN;
	const v1: string[] = [];
	for (const part of header.split(',')) {
		const [key, value] = part.trim().split('=', 2);
		if (key === 't') t = Number(value);
		else if (key === 'v1' && value) v1.push(value);
	}
	if (!Number.isFinite(t) || v1.length === 0) return null;
	return { t, v1 };
}

export function signBody(secret: string, body: string, t: number): string {
	return createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

export function verifySignature(
	header: string | undefined | null,
	rawBody: string,
	secret: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
	toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
	const parsed = parseSignatureHeader(header);
	if (!parsed || !secret) return false;
	if (Math.abs(nowSeconds - parsed.t) > toleranceSeconds) return false;
	const expected = Buffer.from(signBody(secret, rawBody, parsed.t), 'hex');
	return parsed.v1.some((candidate) => {
		const given = Buffer.from(candidate, 'hex');
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
