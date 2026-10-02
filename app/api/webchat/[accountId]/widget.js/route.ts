import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BRAND_COLORS as C } from "@/lib/brand-colors";

// Roadmap P3-f — script embebible del widget, servido como JS plano (no un
// bundle de Next/React: el sitio del cliente es un dominio arbitrario de
// terceros, un script vainilla sin dependencias es lo único garantizado a
// funcionar ahí sin conflictos). Público sin restricción de Origin — a
// diferencia de session/messages, cargar el <script> en sí no expone nada
// sensible (el accountId ya es público, va en la URL del propio script).
export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId }, select: { channel: true, status: true } });
  if (!account || account.channel !== "WEBCHAT" || account.status !== "CONNECTED") {
    return new NextResponse("// Cuenta de webchat no encontrada o inactiva", {
      status: 404,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  const js = buildWidgetScript(accountId);
  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Cortito a propósito: si el cliente reconecta la cuenta o cambia algo,
      // no queremos que el navegador del visitante quede pegado a una copia
      // vieja del script por mucho tiempo.
      "Cache-Control": "public, max-age=300",
    },
  });
}

function buildWidgetScript(accountId: string): string {
  // Nota de diseño: todo inline (sin imports, sin build step) porque este
  // archivo se ejecuta tal cual en el navegador del visitante, en un dominio
  // que no controlamos. POLL_MS/STORAGE_KEY son deliberadamente conservadores
  // (mismo espíritu que el resto del proyecto: polling, no websockets).
  return `(function () {
  var ACCOUNT_ID = ${JSON.stringify(accountId)};
  var API_BASE = ${JSON.stringify(new URL(`/api/webchat/${accountId}`, getPublicBaseUrl()).toString())};
  // Solo se guarda el TOKEN firmado: el visitorId lo asigna el servidor y
  // viaja dentro del token (antes el widget inventaba el id y cualquiera que lo
  // conociera podía abrir la conversación de otra persona).
  var TOKEN_KEY = "colibly_webchat_token_" + ACCOUNT_ID;
  // Clave de antes del cambio de nombre: se lee una vez y se migra, para no
  // cortar la conversación de quien ya la tenía guardada.
  var LEGACY_TOKEN_KEY = "sundaycrm_webchat_token_" + ACCOUNT_ID;
  var POLL_MS = 4000;

  function readStoredToken() {
    try {
      var token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        token = localStorage.getItem(LEGACY_TOKEN_KEY);
        if (token) { localStorage.setItem(TOKEN_KEY, token); localStorage.removeItem(LEGACY_TOKEN_KEY); }
      }
      return token;
    } catch (e) { return null; }
  }
  function storeToken(value) {
    try { if (value) localStorage.setItem(TOKEN_KEY, value); } catch (e) {}
  }

  var token = null;
  var tokenRequest = null;
  var lastTimestamp = null;
  var pollTimer = null;

  // Pide (o renueva con el token guardado) la sesión. Un token vencido sigue
  // sirviendo para renovar, así el visitante conserva su conversación.
  function getToken(forceRenew) {
    if (token && !forceRenew) return Promise.resolve(token);
    if (tokenRequest) return tokenRequest;
    var stored = forceRenew ? (token || readStoredToken()) : readStoredToken();
    tokenRequest = fetch(API_BASE + "/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stored ? { renewToken: stored } : {}),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        token = data.token || null;
        storeToken(token);
        return token;
      })
      .finally(function () { tokenRequest = null; });
    return tokenRequest;
  }

  function authHeaders(extra) {
    var headers = extra || {};
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function renderMessage(container, msg) {
    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = msg.direction === "OUTBOUND" ? "flex-end" : "flex-start";
    row.style.margin = "4px 0";
    var bubble = document.createElement("div");
    bubble.style.maxWidth = "75%";
    bubble.style.padding = "8px 12px";
    bubble.style.borderRadius = "14px";
    bubble.style.fontSize = "13px";
    bubble.style.lineHeight = "1.4";
    bubble.style.whiteSpace = "pre-wrap";
    bubble.style.wordBreak = "break-word";
    if (msg.direction === "OUTBOUND") {
      bubble.style.background = "${C.accent}";
      bubble.style.color = "${C.onAccent}";
    } else {
      bubble.style.background = "${C.surfaceLight}";
      bubble.style.color = "${C.ink}";
    }
    bubble.textContent = msg.body || "";
    row.appendChild(bubble);
    container.appendChild(row);

    // Opciones de un mensaje con botones/lista: se tocan una vez; al tocar
    // se manda el título como texto + replyId para que la automatización
    // sepa qué opción fue.
    var options = msg.direction === "OUTBOUND" && msg.interactivePayload && msg.interactivePayload.buttons;
    if (options && options.length) {
      var group = document.createElement("div");
      group.style.display = "flex";
      group.style.flexWrap = "wrap";
      group.style.justifyContent = "flex-end";
      group.style.gap = "6px";
      group.style.margin = "2px 0 8px";
      options.forEach(function (opt) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = opt.title;
        b.style.border = "1px solid ${C.accent}";
        b.style.background = "#fff";
        b.style.color = "${C.accentInk}";
        b.style.borderRadius = "999px";
        b.style.padding = "6px 12px";
        b.style.fontSize = "12px";
        b.style.cursor = "pointer";
        b.onclick = function () {
          Array.prototype.forEach.call(group.querySelectorAll("button"), function (x) {
            x.disabled = true;
            x.style.opacity = x === b ? "1" : "0.4";
            x.style.cursor = "default";
          });
          sendMessage(opt.title, container, opt.id);
        };
        group.appendChild(b);
      });
      container.appendChild(group);
    }
  }

  function poll(messagesEl) {
    if (!token) return;
    var url = API_BASE + "/messages" + (lastTimestamp ? "?since=" + encodeURIComponent(lastTimestamp) : "");
    fetch(url, { headers: authHeaders() })
      .then(function (r) {
        // Sesión vencida (pestaña abierta más de 24h): renovar y seguir.
        if (r.status === 401 || r.status === 403) {
          return getToken(true).then(function () { return { messages: [] }; });
        }
        return r.json();
      })
      .then(function (data) {
        var msgs = data.messages || [];
        if (msgs.length === 0) return;
        var wasAtBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 10;
        msgs.forEach(function (m) {
          renderMessage(messagesEl, m);
          lastTimestamp = m.timestamp;
        });
        if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      })
      .catch(function () {});
  }

  function sendMessage(text, messagesEl, replyId) {
    getToken().then(function (tok) {
      if (!tok) return;
      var clientMessageId = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      // Sin render optimista a propósito: el próximo poll (disparado de
      // inmediato abajo, no se espera el intervalo de 4s) va a traer este
      // mismo mensaje ya confirmado por el servidor — mostrarlo dos veces
      // (una optimista, otra al llegar por poll) duplicaba la burbuja.
      fetch(API_BASE + "/messages", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: text, clientMessageId: clientMessageId, replyId: replyId || null }),
      })
        .then(function () { poll(messagesEl); })
        .catch(function () {});
    });
  }

  function buildWidget() {
    var bubble = document.createElement("button");
    bubble.setAttribute("aria-label", "Abrir chat");
    bubble.style.position = "fixed";
    bubble.style.bottom = "20px";
    bubble.style.right = "20px";
    bubble.style.width = "56px";
    bubble.style.height = "56px";
    bubble.style.borderRadius = "50%";
    bubble.style.background = "${C.accent}";
    bubble.style.color = "${C.onAccent}";
    bubble.style.border = "none";
    bubble.style.cursor = "pointer";
    bubble.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
    bubble.style.zIndex = "999999";
    bubble.style.fontSize = "24px";
    bubble.textContent = "\\uD83D\\uDCAC";

    var panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.bottom = "86px";
    panel.style.right = "20px";
    panel.style.width = "320px";
    panel.style.height = "420px";
    panel.style.background = "#fff";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 8px 30px rgba(0,0,0,0.25)";
    panel.style.display = "none";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";
    panel.style.zIndex = "999999";
    panel.style.fontFamily = "system-ui, -apple-system, sans-serif";

    var header = document.createElement("div");
    header.style.background = "${C.accent}";
    header.style.color = "${C.onAccent}";
    header.style.padding = "12px 16px";
    header.style.fontSize = "14px";
    header.style.fontWeight = "600";
    header.textContent = "Chatea con nosotros";
    panel.appendChild(header);

    var messagesEl = document.createElement("div");
    messagesEl.style.flex = "1";
    messagesEl.style.overflowY = "auto";
    messagesEl.style.padding = "12px";
    panel.appendChild(messagesEl);

    var form = document.createElement("form");
    form.style.display = "flex";
    form.style.borderTop = "1px solid ${C.border}";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Escribe un mensaje...";
    input.style.flex = "1";
    input.style.border = "none";
    input.style.padding = "10px 12px";
    input.style.fontSize = "13px";
    input.style.outline = "none";
    var sendBtn = document.createElement("button");
    sendBtn.type = "submit";
    sendBtn.textContent = "Enviar";
    sendBtn.style.border = "none";
    sendBtn.style.background = "${C.accent}";
    sendBtn.style.color = "${C.onAccent}";
    sendBtn.style.padding = "0 16px";
    sendBtn.style.cursor = "pointer";
    sendBtn.style.fontSize = "13px";
    form.appendChild(input);
    form.appendChild(sendBtn);
    panel.appendChild(form);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendMessage(text, messagesEl);
    });

    var open = false;
    bubble.addEventListener("click", function () {
      open = !open;
      panel.style.display = open ? "flex" : "none";
      if (open) {
        getToken().then(function () {
          poll(messagesEl);
          if (!pollTimer) pollTimer = setInterval(function () { poll(messagesEl); }, POLL_MS);
        });
      }
    });

    document.body.appendChild(panel);
    document.body.appendChild(bubble);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    buildWidget();
  } else {
    document.addEventListener("DOMContentLoaded", buildWidget);
  }
})();`;
}

function getPublicBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:15100";
}
