#!/usr/bin/env bash
# Datos de prueba reproducibles para la bandeja, usando SOLO APIs públicas.
# Crea una organización QA (registro + verificación por Mailpit), una cuenta
# WEBCHAT y genera mensajes entrantes reales sin depender de Meta.
#
#   dev/qa/seed-bandeja.sh up                 # organización + webchat + sesión
#   dev/qa/seed-bandeja.sh msg "hola" [n]     # mensaje entrante del visitante n (default 1)
#   dev/qa/seed-bandeja.sh api GET /api/...   # llamada autenticada como el admin QA
#   dev/qa/seed-bandeja.sh down               # borra la organización por la API
#
# Estado (ids, cookies, tokens) en dev/qa/.state/ (ignorado por git).
# Requiere el stack de dev arriba (localhost:15100) y Mailpit (localhost:18025).
set -euo pipefail

BASE="${QA_BASE:-http://localhost:15100}"
MAILPIT="${QA_MAILPIT:-http://localhost:18025}"
DIR="$(cd "$(dirname "$0")" && pwd)/.state"
mkdir -p "$DIR"
STATE="$DIR/env"
JAR="$DIR/cookies"
PASS="QaBandeja#2026x"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }
load() { [ -f "$STATE" ] || { echo "Primero: $0 up" >&2; exit 1; }; . "$STATE"; }

login() {
  rm -f "$JAR"
  local csrf
  csrf=$(curl -sf -c "$JAR" -b "$JAR" "$BASE/api/auth/csrf" | json '["csrfToken"]')
  curl -sf -c "$JAR" -b "$JAR" -o /dev/null -X POST "$BASE/api/auth/callback/credentials" \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=$QA_EMAIL" \
    --data-urlencode "password=$PASS" --data-urlencode "json=true"
}

cmd_up() {
  local email="qa-bandeja-$(date +%s)@example.test"
  curl -sf -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
    -d "{\"name\":\"QA Bandeja\",\"email\":\"$email\",\"password\":\"$PASS\",\"businessName\":\"QA Bandeja Org\"}" >/dev/null
  sleep 3
  local mid tok
  mid=$(curl -sf "$MAILPIT/api/v1/search?query=to:$email" | json '["messages"][0]["ID"]')
  tok=$(curl -sf "$MAILPIT/api/v1/message/$mid" | grep -oE 'token=[A-Za-z0-9_-]+' | head -1 | cut -d= -f2)
  curl -sf -X POST "$BASE/api/auth/verify-email" -H 'content-type: application/json' -d "{\"token\":\"$tok\"}" >/dev/null
  QA_EMAIL="$email"; login
  local session acc
  session=$(curl -sf -b "$JAR" "$BASE/api/auth/session")
  acc=$(curl -sf -b "$JAR" -X POST "$BASE/api/webchat/accounts" -H 'content-type: application/json' \
    -d "{\"name\":\"QA web\",\"allowedOrigins\":[\"$BASE\"]}" | json '["id"]')
  cat > "$STATE" <<EOF
QA_EMAIL=$email
QA_USER_ID=$(echo "$session" | json '["user"]["id"]')
QA_ORG_ID=$(echo "$session" | json '["user"]["organizationId"]')
QA_WEBCHAT_ID=$acc
EOF
  cat "$STATE"
}

visitor_token() {
  local n="$1" f="$DIR/visitor-$1"
  if [ ! -f "$f" ]; then
    curl -sf -X POST "$BASE/api/webchat/$QA_WEBCHAT_ID/session" -H "origin: $BASE" \
      -H 'content-type: application/json' -d '{}' | json '["token"]' > "$f"
  fi
  cat "$f"
}

cmd_msg() {
  load
  local text="$1" n="${2:-1}" token
  token=$(visitor_token "$n")
  curl -sf -X POST "$BASE/api/webchat/$QA_WEBCHAT_ID/messages" -H "origin: $BASE" \
    -H "authorization: Bearer $token" -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$text")"
  echo
}

cmd_api() {
  load; login
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -b "$JAR" -X "$method" "$BASE$path" -H 'content-type: application/json' -d "$body" -w "\n%{http_code}\n"
  else
    curl -s -b "$JAR" -X "$method" "$BASE$path" -w "\n%{http_code}\n"
  fi
}

cmd_down() {
  load; login
  curl -s -b "$JAR" -X DELETE "$BASE/api/organizacion" -H 'content-type: application/json' \
    -d "{\"confirmName\":\"QA Bandeja Org\",\"password\":\"$PASS\"}" -w " %{http_code}\n"
  rm -rf "$DIR"
}

case "${1:-}" in
  up) cmd_up ;;
  msg) shift; cmd_msg "$@" ;;
  api) shift; cmd_api "$@" ;;
  down) cmd_down ;;
  *) sed -n 2,11p "$0"; exit 1 ;;
esac
