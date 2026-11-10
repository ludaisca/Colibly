import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseSignatureHeader, verifySignature } from '../n8n/nodes/Colibly/signature.ts';

const secret = 'whsec_prueba';
const body = JSON.stringify({ type: 'contact.created', data: { origin: 'ORGANIC' } });
const now = 1_800_000_000;
const sign = (s: string, t: number) => createHmac('sha256', s).update(`${t}.${body}`).digest('hex');

test('acepta una firma válida', () => {
	assert.equal(verifySignature(`t=${now},v1=${sign(secret, now)}`, body, secret, now), true);
});

test('rechaza un cuerpo alterado o un secreto distinto', () => {
	const header = `t=${now},v1=${sign(secret, now)}`;
	assert.equal(verifySignature(header, body + ' ', secret, now), false);
	assert.equal(verifySignature(header, body, 'whsec_otro', now), false);
});

test('durante una rotación acepta si cualquiera de las v1 coincide', () => {
	const header = `t=${now},v1=${sign('whsec_nuevo', now)},v1=${sign(secret, now)}`;
	assert.equal(verifySignature(header, body, secret, now), true);
});

test('rechaza firmas viejas (más de 5 minutos)', () => {
	const old = now - 301;
	assert.equal(verifySignature(`t=${old},v1=${sign(secret, old)}`, body, secret, now), false);
});

test('rechaza encabezados vacíos o mal formados', () => {
	assert.equal(verifySignature(undefined, body, secret, now), false);
	assert.equal(verifySignature('v1=abc', body, secret, now), false);
	assert.equal(parseSignatureHeader('t=1,v1=aa,v1=bb')?.v1.length, 2);
});
