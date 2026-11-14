import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { API_SCOPES } from "@/lib/api/scopes";
import { WEBHOOK_DELIVERY_RETENTION_DAYS } from "@/lib/api/constants";
import { NODE_VERIFY, PAGINATION_NODE, PHP_VERIFY, PYTHON_VERIFY } from "./_snippets";
import { Code, InlineText, ParamTable, Section, SubHeading } from "./_ui";
import { curlFor, endpointList, type EndpointDoc } from "./_endpoints";

const DESCRIPTION = `Documentación de la API REST y los webhooks de ${BRAND_NAME}: autenticación con API key, límites, idempotencia, errores, paginación, eventos firmados y referencia de endpoints con ejemplos.`;

export const metadata: Metadata = {
  title: "API y webhooks para desarrolladores",
  description: DESCRIPTION,
  alternates: { canonical: appUrl("/docs/api") },
  robots: { index: true, follow: true },
  openGraph: { type: "article", locale: "es_MX", siteName: BRAND_NAME, url: appUrl("/docs/api"), title: `API y webhooks · ${BRAND_NAME}`, description: DESCRIPTION },
};

const LINK = "font-medium text-accent-ink underline underline-offset-2 hover:text-accent-hover";

// Página pública (sin sesión) armada desde la misma especificación que sirve
// /api/v1/openapi.json: límites, errores, eventos y ejemplos salen de
// lib/api/openapi.ts y lib/api/constants.ts, así que no se desfasa del código.
// No muestra datos de ninguna cuenta: solo ejemplos ficticios.
export default function ApiDocsPage() {
  const base = appUrl("/api/v1");
  const spec = buildOpenApiSpec(base);
  const limits = spec["x-colibly-limits"];
  const endpoints = endpointList(spec);
  const groups = spec.tags.map((t) => ({ ...t, items: endpoints.filter((e) => e.tag === t.name) })).filter((g) => g.items.length > 0);
  // Reintentos de BullMQ (exponencial): base · (1 + 2 + 4 + …) entre intentos.
  const retryMinutes = Math.round((limits.webhookBackoffBaseSeconds * (2 ** (limits.webhookAttempts - 1) - 1)) / 60);
  const testEvent = spec["x-colibly-events"].find((e) => e.type === "contact.lead_status_changed")!;

  const toc = [
    ["introduccion", "Introducción"],
    ["autenticacion", "Autenticación"],
    ["limites", "Límites de velocidad"],
    ["idempotencia", "Idempotencia"],
    ["errores", "Errores"],
    ["paginacion", "Paginación"],
    ["versiones", "Versiones"],
    ["webhooks", "Webhooks"],
    ["referencia", "Referencia de endpoints"],
  ] as const;

  return (
    // Monoespaciada real solo aquí: en el panel font-mono es la tipografía de
    // texto a propósito (globals.css), pero el código necesita columnas alineadas.
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 md:px-6 [&_code]:font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] [&_h4]:font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:py-14">
      <nav aria-label="Contenido de la documentación" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-strong">En esta página</p>
        <ol className="mt-3 space-y-1.5 border-l border-border text-sm">
          {toc.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted-strong hover:border-accent hover:text-foreground">{label}</a>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted-strong">
          Versión {spec.info.version}
          <br />
          <a href="/api/v1/openapi.json" className={LINK}>openapi.json</a>
          {" · "}
          <a href="/api/v1/postman.json" className={LINK}>Postman</a>
        </p>
      </nav>

      <article className="min-w-0 overflow-x-clip text-[15px] leading-relaxed text-foreground">
        {/* TOC móvil: chips en varias filas para que se vean todas las secciones. */}
        <nav aria-label="Secciones" className="mb-8 lg:hidden">
          <ol className="flex flex-wrap gap-2">
            {toc.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted-strong hover:border-accent-muted hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <header id="introduccion" className="scroll-mt-24 border-b border-border pb-8">
          <p className="text-sm font-medium text-accent-ink">Para desarrolladores</p>
          <h1 className="mt-1 text-balance font-display text-page-title font-semibold tracking-tight lg:text-4xl lg:leading-tight">
            API y webhooks de {BRAND_NAME}
          </h1>
          <p className="mt-4 max-w-3xl text-pretty text-base text-muted-strong sm:text-lg">
            Con la API tu sistema consulta y actualiza contactos, lee conversaciones, envía mensajes de WhatsApp y arranca automatizaciones.
            Con los webhooks, {BRAND_NAME} avisa a tu servidor cada vez que llega un mensaje, se crea un contacto o cambia la etapa de un lead.
            Ambos se incluyen con la licencia Pro (y en la prueba gratuita): las API keys y los webhooks los crea un administrador con licencia Pro,
            y dejan de funcionar si esa persona deja de ser administrador o baja de licencia.
          </p>
          <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="font-semibold">URL base</dt>
            <dd className="min-w-0"><code className="break-all font-mono">{base}</code></dd>
            <dt className="font-semibold">Formato</dt>
            <dd className="min-w-0 text-pretty">JSON en UTF-8. Fechas en ISO 8601 (UTC). Ids opacos de texto.</dd>
            <dt className="font-semibold">Especificación</dt>
            <dd className="min-w-0 text-pretty">
              OpenAPI 3.1 en <a href="/api/v1/openapi.json" className={LINK}>/api/v1/openapi.json</a>, para generar clientes o importarla en Insomnia.
              Colección de Postman lista para usar en <a href="/api/v1/postman.json" className={LINK}>/api/v1/postman.json</a> (Import → Link; pon tu key en la variable <code className="font-mono text-sm">apiKey</code>).
            </dd>
          </dl>
          <SubHeading>Primera llamada</SubHeading>
          <p>Verifica tu key con <code className="font-mono text-sm">GET /me</code>:</p>
          <Code>{`curl ${base}/me \\\n  -H "Authorization: Bearer $COLIBLY_API_KEY"`}</Code>
        </header>

        <Section id="autenticacion" title="Autenticación">
          <p>
            Cada solicitud lleva una API key en el header <code className="font-mono text-sm">Authorization: Bearer sk_live_…</code>. Un administrador la crea en{" "}
            <strong>Configuración → API</strong>, eligiendo sus permisos, las cuentas que puede usar (o todas) y su vigencia (30, 90 o 365 días, o sin vencimiento).
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>La key completa se muestra una sola vez; nosotros solo guardamos su huella. Si se pierde, crea otra y revoca la anterior.</li>
            <li>Para rotarla: crea la nueva, cámbiala en tu sistema y revoca la vieja. Revocar surte efecto de inmediato.</li>
            <li>Una key actúa con el acceso de quien la creó. Si esa persona deja de ser administradora o se desactiva, la key deja de funcionar.</li>
            <li>Máximo {limits.maxActiveApiKeys} keys activas por cuenta.</li>
            <li>Guárdala en el servidor (variable de entorno o gestor de secretos). Nunca en una app móvil, en el navegador ni en un repositorio.</li>
          </ul>
          <SubHeading>Permisos</SubHeading>
          <ParamTable
            head={["Permiso", "Qué permite"]}
            rows={Object.entries(API_SCOPES).map(([k, v]) => [<code key={k} className="font-mono text-sm">{k}</code>, v])}
          />
          <p className="text-sm text-muted-strong"><code className="font-mono">GET /me</code> y <code className="font-mono">GET /accounts</code> no piden permiso.</p>
        </Section>

        <Section id="limites" title="Límites de velocidad">
          <p>
            Los límites se cuentan en ventanas móviles de 60 s y se aplican en capas; gana el primero que se agote:
          </p>
          <ParamTable
            head={["Límite", "Valor"]}
            rows={[
              ["Por key", `${limits.requestsPerMinute} solicitudes por minuto`],
              ["Por cuenta (todas sus keys juntas)", `${limits.orgRequestsPerMinute} solicitudes por minuto`],
              ["Por IP (con o sin key)", `${limits.ipRequestsPerMinute} solicitudes por minuto`],
              [<code key="m" className="font-mono text-sm">POST /messages</code>, `${limits.sendsPerMinutePerOrg} envíos por minuto y ${limits.dailySendsPerOrg.toLocaleString("es-MX")} por día (UTC) por cuenta`],
              [<code key="c" className="font-mono text-sm">GET /conversations</code>, `${limits.conversationsListPerMinutePerKey} solicitudes por minuto por key`],
              ["Tamaño del cuerpo", `${Math.round(limits.maxBodyBytes / 1024)} KB como máximo (si no, 413 payload_too_large)`],
            ]}
          />
          <p>Toda respuesta autenticada informa el límite más ajustado en ese momento:</p>
          <ParamTable
            head={["Header", "Significado"]}
            rows={[
              [<code key="l" className="font-mono text-sm">X-RateLimit-Limit</code>, "Solicitudes permitidas en la ventana del límite informado."],
              [<code key="r" className="font-mono text-sm">X-RateLimit-Remaining</code>, "Las que te quedan en la ventana actual."],
              [<code key="s" className="font-mono text-sm">X-RateLimit-Reset</code>, "Segundos hasta que se libera un lugar."],
              [<code key="sc" className="font-mono text-sm">X-RateLimit-Scope</code>, "Qué límite se informa: key, organization, ip, endpoint o daily."],
              [<code key="a" className="font-mono text-sm">Retry-After</code>, "Solo en el 429 y el 503: segundos a esperar antes de reintentar."],
            ]}
          />
          <p>Al pasarte recibes <code className="font-mono text-sm">429 rate_limited</code>. Espera lo que indica <code className="font-mono text-sm">Retry-After</code>; reintentar antes vuelve a contar.</p>
          <Code>{`HTTP/1.1 429 Too Many Requests\nX-RateLimit-Limit: ${limits.requestsPerMinute}\nX-RateLimit-Remaining: 0\nX-RateLimit-Reset: 12\nX-RateLimit-Scope: key\nRetry-After: 12\n\n{ "error": { "code": "rate_limited", "message": "Límite de ${limits.requestsPerMinute} solicitudes por minuto excedido" } }`}</Code>
          <p className="text-sm text-muted-strong">
            Además, una misma IP puede hacer hasta {limits.badKeyAttemptsPerMinutePerIp} intentos por minuto con keys inválidas; después recibe 429 aunque la siguiente key sea válida.
          </p>
          <p className="text-sm text-muted-strong">
            Si se agota el cupo diario de envíos recibes <code className="font-mono text-sm">429 daily_limit_reached</code>, con <code className="font-mono text-sm">Retry-After</code> hasta las 00:00 UTC. Si el servicio de límites no está disponible respondemos <code className="font-mono text-sm">503 service_unavailable</code> con <code className="font-mono text-sm">Retry-After: {limits.unavailableRetrySeconds}</code>: reintenta después.
          </p>
        </Section>

        <Section id="idempotencia" title="Idempotencia">
          <p>
            Si una solicitud que crea algo se corta (timeout, red caída), no sabes si llegó. Para reintentar sin duplicar, manda el header{" "}
            <code className="font-mono text-sm">Idempotency-Key</code> con un valor único por operación, por ejemplo un UUID o el id del pedido en tu sistema.
            Lo aceptan <code className="font-mono text-sm">POST /messages</code>, <code className="font-mono text-sm">POST /contacts</code>,{" "}
            <code className="font-mono text-sm">POST /contacts/{"{id}"}/tags</code> y <code className="font-mono text-sm">POST /automations/{"{id}"}/runs</code>.
          </p>
          <Code>{curlFor(endpoints.find((e) => e.method === "POST" && e.path === "/messages")!, base, { idempotencyKey: "pedido-A-1043-confirmacion" })}</Code>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Durante {limits.idempotencyTtlHours} horas, la misma clave con el mismo cuerpo devuelve la respuesta original, con el header <code className="font-mono text-sm">Idempotent-Replayed: true</code>, y no vuelve a ejecutar la operación.</li>
            <li>La misma clave con otro cuerpo, o en otro endpoint, responde <code className="font-mono text-sm">422 idempotency_conflict</code>.</li>
            <li>Si la primera solicitud sigue en proceso, la repetida recibe <code className="font-mono text-sm">409 conflict</code>: espera unos segundos y reintenta.</li>
            <li>Los errores 401, 402, 403, 429 y 5xx no se guardan, así que puedes reintentarlos con la misma clave.</li>
            <li>Las claves son de tu cuenta: dos integraciones tuyas no deben compartir valores.</li>
          </ul>
        </Section>

        <Section id="errores" title="Errores">
          <p>Los errores responden con el status HTTP y un cuerpo estable. Decide según <code className="font-mono text-sm">code</code>; <code className="font-mono text-sm">message</code> está en español y puede cambiar.</p>
          <Code>{`{ "error": { "code": "window_closed", "message": "Fuera de la ventana de 24 h: envía una plantilla aprobada", "requestId": "req_4fQm1x9TzK2bLw7a" } }`}</Code>
          <p>
            En un error de validación, <code className="font-mono text-sm">details</code> lista cada campo con su ruta (<code className="font-mono text-sm">template.id</code>,{" "}
            <code className="font-mono text-sm">buttons.0.title</code>), para que corrijas todo de una vez:
          </p>
          <Code>{`{
  "error": {
    "code": "invalid_request",
    "message": "type: Opción inválida: se esperaba una de \"text\"|\"buttons\"|\"template\" (y 1 más en details)",
    "details": [
      { "path": "type", "message": "Opción inválida: se esperaba una de \"text\"|\"buttons\"|\"template\"" },
      { "path": "template.id", "message": "Entrada inválida: se esperaba texto, recibido indefinido" }
    ],
    "requestId": "req_b8YmONFwR90UzIEW"
  }
}`}</Code>
          <p>
            Cada respuesta, buena o mala, trae el header <code className="font-mono text-sm">X-Request-Id</code> (igual a <code className="font-mono text-sm">error.requestId</code>). Guárdalo en tus logs e
            inclúyelo si escribes a soporte: con él encontramos tu llamada.
          </p>
          <ParamTable
            head={["Status", "code", "Cuándo"]}
            rows={spec["x-colibly-error-codes"].map((e) => [String(e.status), <code key={e.code} className="font-mono text-sm">{e.code}</code>, e.description])}
          />
        </Section>

        <Section id="paginacion" title="Paginación">
          <p>
            Los listados devuelven <code className="font-mono text-sm">{"{ data, nextCursor }"}</code>. Pide la siguiente página con{" "}
            <code className="font-mono text-sm">?cursor=&lt;nextCursor&gt;</code>; cuando <code className="font-mono text-sm">nextCursor</code> es <code className="font-mono text-sm">null</code>, terminaste.{" "}
            <code className="font-mono text-sm">limit</code> va de 1 a {limits.pageMax} (por defecto {limits.pageDefault}). El cursor es opaco: no lo construyas ni lo guardes por mucho tiempo.{" "}
            Los catálogos (<code className="font-mono text-sm">/accounts</code>, <code className="font-mono text-sm">/templates</code>, <code className="font-mono text-sm">/tags</code>,{" "}
            <code className="font-mono text-sm">/users</code>, <code className="font-mono text-sm">/teams</code>, <code className="font-mono text-sm">/automations</code>) devuelven la lista completa en <code className="font-mono text-sm">data</code>, sin cursor.
          </p>
          <Code>{PAGINATION_NODE.replace("https://app.colibly.com/api/v1", base)}</Code>
          <p className="text-sm text-muted-strong">
            Para sincronizar cambios periódicamente usa <code className="font-mono">GET /contacts?updatedSince=…</code> con la fecha de tu última sincronización, o mejor, suscríbete al webhook correspondiente.
          </p>
        </Section>

        <Section id="versiones" title="Versiones">
          <p>
            La versión va en la ruta: hoy es <code className="font-mono text-sm">/api/v1</code>. Dentro de v1 solo agregamos: campos nuevos en las respuestas, endpoints, eventos y valores
            nuevos en los enumerados. Tu integración debe ignorar los campos que no conoce.
          </p>
          <p>
            Un cambio incompatible (quitar o renombrar un campo, cambiar un tipo o el significado de un error) saldría como <code className="font-mono text-sm">/api/v2</code>. v1 se mantendría
            al menos 12 meses después, y avisaríamos por correo a los administradores con keys activas.
          </p>
        </Section>

        <Section id="webhooks" title="Webhooks">
          <p>
            Un webhook es una URL de tu servidor a la que {BRAND_NAME} manda un <code className="font-mono text-sm">POST</code> con JSON cada vez que ocurre un evento que elegiste. Se crean en{" "}
            <strong>Configuración → API → Webhooks</strong> o con <code className="font-mono text-sm">POST /webhooks</code>, eligiendo eventos (o todos con <code className="font-mono text-sm">*</code>) y,
            si quieres, solo algunas cuentas.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>La URL debe ser <code className="font-mono text-sm">https://</code> y pública. Rechazamos direcciones internas o reservadas, y no seguimos redirecciones.</li>
            <li>
              Al crearlo recibes un secreto <code className="font-mono text-sm">whsec_…</code>, que se muestra una vez y sirve para verificar la firma. Se rota en la pantalla o con{" "}
              <code className="font-mono text-sm">POST /webhooks/{"{id}"}/rotate-secret</code>. Con <code className="font-mono text-sm">{"{ \"graceHours\": 24 }"}</code> el anterior sigue firmando ese tiempo
              (hasta 72 h); sin él, deja de firmar en ese momento.
            </li>
            <li>Máximo {limits.maxWebhooks} webhooks por cuenta.</li>
            <li>
              El botón <strong>Probar</strong> (o <code className="font-mono text-sm">POST /webhooks/{"{id}"}/test</code>) envía un evento <code className="font-mono text-sm">webhook.test</code> firmado, para
              validar tu receptor sin esperar un evento real. Su resultado queda en el historial de entregas.
            </li>
          </ul>

          <SubHeading>Cada entrega</SubHeading>
          <ParamTable
            head={["Header", "Valor"]}
            rows={[
              [<code key="s" className="font-mono text-sm">X-Colibly-Signature</code>, <span key="sv"><code className="font-mono text-sm">t=&lt;unix&gt;,v1=&lt;hex&gt;</code>: HMAC-SHA256 del texto <code className="font-mono text-sm">{"{t}.{cuerpo}"}</code> con tu secreto.</span>],
              [<code key="e" className="font-mono text-sm">X-Colibly-Event</code>, "Tipo de evento, p. ej. contact.created."],
              [<code key="d" className="font-mono text-sm">X-Colibly-Delivery</code>, "Id de la entrega; es el mismo en cada reintento."],
              [<code key="i" className="font-mono text-sm">X-Colibly-Event-Id</code>, "Id del evento (el mismo que id en el cuerpo): igual en todos tus endpoints y reintentos, útil para descartar duplicados."],
              [<code key="n" className="font-mono text-sm">X-Colibly-Attempt</code>, "Número de intento (1 = primera entrega)."],
              [<code key="u" className="font-mono text-sm">User-Agent</code>, "Colibly-Webhooks/1.0"],
              [<code key="c" className="font-mono text-sm">Content-Type</code>, "application/json"],
            ]}
          />
          <p>El cuerpo siempre tiene la misma forma. <code className="font-mono text-sm">contact</code> y <code className="font-mono text-sm">conversation</code> traen los datos del momento de la entrega; <code className="font-mono text-sm">data</code> trae el hecho tal como ocurrió.</p>
          <Code>{JSON.stringify(testEvent.example, null, 2)}</Code>

          <SubHeading>Eventos</SubHeading>
          <div className="divide-y divide-border rounded-lg border border-border">
            {spec["x-colibly-events"].map((e) => (
              <details key={e.type} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                  <code className="font-mono text-sm font-semibold">{e.type}</code>
                  <span className="text-sm text-muted-strong">{e.description}</span>
                  <span className="ml-auto text-xs text-accent-ink group-open:hidden">Ver ejemplo</span>
                </summary>
                <Code>{JSON.stringify(e.example.data, null, 2)}</Code>
              </details>
            ))}
          </div>
          <p className="text-sm text-muted-strong">
            Los contactos que llegan al importar el historial de WhatsApp Business (Coexistencia) generan <code className="font-mono">contact.created</code> con <code className="font-mono">data.source = &quot;history&quot;</code>.
            Llegan espaciados y después de los eventos en vivo; fíltralos por ese campo si no te interesan.
          </p>

          <SubHeading>Verificar la firma</SubHeading>
          <p>Verifica cada entrega antes de confiar en ella: compara la firma con una función de tiempo constante y rechaza las que tengan más de 5 minutos.</p>
          <p>
            El header puede traer <strong>más de una</strong> <code className="font-mono text-sm">v1</code>: al rotar el secreto con periodo de gracia, cada entrega va firmada con el nuevo y con el
            anterior (<code className="font-mono text-sm">t=…,v1=&lt;nuevo&gt;,v1=&lt;anterior&gt;</code>) hasta que vence. Acepta la entrega si cualquiera coincide con tu secreto; así cambias el
            secreto de tu servidor sin perder eventos. Las recetas de abajo ya lo hacen.
          </p>
          <p className="text-sm font-semibold">Node.js</p>
          <Code>{NODE_VERIFY}</Code>
          <p className="text-sm font-semibold">PHP</p>
          <Code>{PHP_VERIFY}</Code>
          <p className="text-sm font-semibold">Python</p>
          <Code>{PYTHON_VERIFY}</Code>

          <SubHeading>Reintentos, desactivación y pausa</SubHeading>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Responde con cualquier 2xx en menos de {limits.webhookTimeoutSeconds} segundos. Si tu proceso tarda, responde primero y procesa después.</li>
            <li>A un mismo webhook le enviamos como mucho {limits.webhookPerEndpointConcurrency} entregas a la vez; las demás esperan su turno sin gastar intentos.</li>
            <li>
              Si fallas (error, timeout o status distinto de 2xx), reintentamos hasta completar {limits.webhookAttempts} intentos. La primera espera es de {limits.webhookBackoffBaseSeconds} segundos y se duplica en cada intento,
              unos {retryMinutes} minutos en total. Una URL rechazada por seguridad no se reintenta.
            </li>
            <li>Un evento puede llegar más de una vez y no siempre en orden. Usa <code className="font-mono text-sm">id</code> para descartar duplicados y <code className="font-mono text-sm">occurredAt</code> para ordenar.</li>
            <li>
              Tras {limits.webhookMaxConsecutiveFailures} entregas fallidas seguidas, el webhook se desactiva solo y avisamos a quien lo creó. Al reactivarlo, el contador vuelve a cero.
            </li>
            <li>
              Si quien creó el webhook deja de ser administrador o se desactiva, el webhook se pausa y avisamos a los demás administradores. Otro administrador lo reactiva y queda a su nombre
              (por API: <code className="font-mono text-sm">PATCH /webhooks/{"{id}"}</code> con <code className="font-mono text-sm">{"{ \"active\": true, \"takeOwnership\": true }"}</code>).
            </li>
            <li>En <strong>Configuración → API → Webhooks → Ver entregas</strong> está el registro de los últimos {WEBHOOK_DELIVERY_RETENTION_DAYS} días, con status, intentos y respuesta, y un botón para reintentar las fallidas.</li>
          </ul>
        </Section>

        <section id="referencia" className="scroll-mt-24 border-t border-border pt-10 mt-12">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Referencia de endpoints</h2>
          <p className="mt-2 text-muted-strong">Todos los ejemplos usan datos ficticios. Las rutas son relativas a <code className="break-all font-mono text-sm">{base}</code>.</p>
          {groups.map((g) => (
            <div key={g.name} className="mt-10">
              <h3 className="font-display text-xl font-semibold">{g.name}</h3>
              {g.description && <p className="mt-1 text-sm text-muted-strong">{g.description}</p>}
              <div className="mt-4 space-y-8">
                {g.items.map((e) => (
                  <EndpointBlock key={`${e.method} ${e.path}`} endpoint={e} base={base} />
                ))}
              </div>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}

function EndpointBlock({ endpoint: e, base }: { endpoint: EndpointDoc; base: string }) {
  const id = `${e.method}-${e.path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
  return (
    <section id={id} className="scroll-mt-24 border-l-2 border-border pl-4 sm:pl-5">
      <h4 className="flex flex-wrap items-baseline gap-x-3 font-mono text-[15px]">
        <span className="font-semibold text-accent-ink">{e.method}</span>
        <span className="break-all font-semibold">{e.path}</span>
      </h4>
      <p className="mt-1 font-medium">{e.summary}</p>
      {e.description && <p className="mt-1 text-sm text-muted-strong"><InlineText text={e.description} /></p>}
      {e.params.length > 0 && (
        <ParamTable
          head={["Parámetro", "En", "Descripción"]}
          rows={e.params.map((p) => [
            <code key={p.name} className="font-mono text-sm">{p.name}{p.required ? "" : "?"}</code>,
            p.in === "path" ? "ruta" : p.in === "query" ? "query" : "header",
            p.description ? <InlineText key="d" text={p.description} /> : p.type,
          ])}
        />
      )}
      {e.bodyFields.length > 0 && (
        <ParamTable
          head={["Campo del cuerpo", "Tipo", "Descripción"]}
          rows={e.bodyFields.map((f) => [<code key={f.name} className="font-mono text-sm">{f.name}{f.required ? "" : "?"}</code>, f.type, f.description ?? ""])}
        />
      )}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-strong">Ejemplo</p>
      <Code>{curlFor(e, base)}</Code>
      {e.responseExample !== undefined && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-strong">Respuesta {e.successStatus}</p>
          <Code>{JSON.stringify(e.responseExample, null, 2)}</Code>
        </>
      )}
    </section>
  );
}
