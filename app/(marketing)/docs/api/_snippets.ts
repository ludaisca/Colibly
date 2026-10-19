// Fragmentos de código de la documentación pública. Probados contra
// lib/webhooks/signature.ts (lib/api/__tests__/docs-snippets.test.ts verifica
// que la receta de firma coincide con la del servidor).

export const NODE_VERIFY = `// Node.js 18+ con Express. Usa el cuerpo CRUDO: si lo parseas y
// vuelves a serializar, la firma ya no coincide.
import crypto from "node:crypto";
import express from "express";

const app = express();
const SECRET = process.env.COLIBLY_WEBHOOK_SECRET; // whsec_...

app.post("/colibly/eventos", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-Colibly-Signature") ?? "";
  const match = header.match(/^t=(\\d+),v1=([0-9a-f]{64})$/);
  if (!match) return res.sendStatus(400);
  const [, t, v1] = match;

  // Rechaza entregas de hace más de 5 minutos (reenvíos).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return res.sendStatus(400);

  const expected = crypto.createHmac("sha256", SECRET).update(\`\${t}.\${req.body}\`).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"))) {
    return res.sendStatus(401);
  }

  const event = JSON.parse(req.body.toString("utf8"));
  // Un mismo evento puede llegar más de una vez: descarta los event.id ya vistos.
  res.sendStatus(200); // responde rápido y procesa después
  procesar(event);
});`;

export const PHP_VERIFY = `<?php
// PHP 7.4+. Lee el cuerpo crudo con php://input.
$secret = getenv('COLIBLY_WEBHOOK_SECRET'); // whsec_...
$body = file_get_contents('php://input');
$header = $_SERVER['HTTP_X_COLIBLY_SIGNATURE'] ?? '';

if (!preg_match('/^t=(\\d+),v1=([0-9a-f]{64})$/', $header, $m)) {
    http_response_code(400);
    exit;
}
[, $t, $v1] = $m;

// Rechaza entregas de hace más de 5 minutos (reenvíos).
if (abs(time() - (int) $t) > 300) {
    http_response_code(400);
    exit;
}

$expected = hash_hmac('sha256', $t . '.' . $body, $secret);
if (!hash_equals($expected, $v1)) {
    http_response_code(401);
    exit;
}

$event = json_decode($body, true);
// Un mismo evento puede llegar más de una vez: descarta los $event['id'] ya vistos.
http_response_code(200);
// procesar($event);`;

export const PAGINATION_NODE = `// Recorre todos los contactos de 100 en 100.
let cursor = null;
do {
  const url = new URL("https://app.colibly.com/api/v1/contacts");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { headers: { Authorization: \`Bearer \${process.env.COLIBLY_API_KEY}\` } });
  const page = await res.json();
  for (const contact of page.data) guardar(contact);
  cursor = page.nextCursor;
} while (cursor);`;
