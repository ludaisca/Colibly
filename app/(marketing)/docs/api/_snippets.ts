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
  // t=<unix>,v1=<firma>[,v1=<firma>]: tras rotar el secreto con periodo de
  // gracia llegan dos v1 (nuevo y anterior). Basta con que una coincida.
  const parts = (req.get("X-Colibly-Signature") ?? "").split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/.test(v ?? "")).map(([, v]) => v);
  if (!t || !/^\\d+$/.test(t) || signatures.length === 0) return res.sendStatus(400);

  // Rechaza entregas de hace más de 5 minutos (reenvíos).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return res.sendStatus(400);

  const expected = crypto.createHmac("sha256", SECRET).update(\`\${t}.\${req.body}\`).digest();
  const valid = signatures.some((v1) => crypto.timingSafeEqual(Buffer.from(v1, "hex"), expected));
  if (!valid) return res.sendStatus(401);

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

// t=<unix>,v1=<firma>[,v1=<firma>]: tras rotar el secreto con periodo de
// gracia llegan dos v1 (nuevo y anterior). Basta con que una coincida.
$t = null;
$signatures = [];
foreach (explode(',', $header) as $part) {
    [$k, $v] = array_pad(explode('=', $part, 2), 2, '');
    if ($k === 't') $t = $v;
    if ($k === 'v1' && preg_match('/^[0-9a-f]{64}$/', $v)) $signatures[] = $v;
}
if ($t === null || !ctype_digit($t) || !$signatures) {
    http_response_code(400);
    exit;
}

// Rechaza entregas de hace más de 5 minutos (reenvíos).
if (abs(time() - (int) $t) > 300) {
    http_response_code(400);
    exit;
}

$expected = hash_hmac('sha256', $t . '.' . $body, $secret);
$valid = false;
foreach ($signatures as $v1) {
    if (hash_equals($expected, $v1)) $valid = true;
}
if (!$valid) {
    http_response_code(401);
    exit;
}

$event = json_decode($body, true);
// Un mismo evento puede llegar más de una vez: descarta los $event['id'] ya vistos.
http_response_code(200);
// procesar($event);`;

export const PYTHON_VERIFY = `# Python 3.9+ con Flask. Usa el cuerpo CRUDO (request.get_data()).
import hashlib, hmac, json, os, re, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["COLIBLY_WEBHOOK_SECRET"].encode()  # whsec_...

@app.post("/colibly/eventos")
def eventos():
    # t=<unix>,v1=<firma>[,v1=<firma>]: tras rotar el secreto con periodo de
    # gracia llegan dos v1 (nuevo y anterior). Basta con que una coincida.
    t, signatures = None, []
    for part in request.headers.get("X-Colibly-Signature", "").split(","):
        key, _, value = part.partition("=")
        if key == "t":
            t = value
        elif key == "v1" and re.fullmatch(r"[0-9a-f]{64}", value):
            signatures.append(value)
    if not t or not t.isdigit() or not signatures:
        abort(400)

    # Rechaza entregas de hace más de 5 minutos (reenvíos).
    if abs(time.time() - int(t)) > 300:
        abort(400)

    body = request.get_data()
    expected = hmac.new(SECRET, f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, v1) for v1 in signatures):
        abort(401)

    event = json.loads(body)
    # Un mismo evento puede llegar más de una vez: descarta los event["id"] ya vistos.
    procesar(event)  # mejor en segundo plano: responde en menos de 20 s
    return "", 200`;

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
