import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { API_SCOPES } from "@/lib/api/scopes";
import { API_REQUESTS_PER_MINUTE } from "@/lib/api/constants";
import { CUSTOMER_TOOLS } from "@/lib/mcp/customer/tools";
import { Code, DOCS_STYLES, ParamTable, Section } from "../api/_ui";
import { CodeCopy } from "../api/_copy-button";

const DESCRIPTION = `Conecta Claude, ChatGPT, Cursor u otro asistente de IA con ${BRAND_NAME} por MCP: consulta conversaciones y contactos, contesta a quien espera y organiza tus contactos, con inicio de sesión o API key.`;

export const metadata: Metadata = {
  title: "MCP: conecta tu asistente de IA",
  description: DESCRIPTION,
  alternates: { canonical: appUrl("/docs/mcp") },
  robots: { index: true, follow: true },
  openGraph: { type: "article", locale: "es_MX", siteName: BRAND_NAME, url: appUrl("/docs/mcp"), title: `MCP · ${BRAND_NAME}`, description: DESCRIPTION },
};

const LINK = "font-medium text-accent-ink underline underline-offset-2 hover:text-accent-hover";

// Guía pública del MCP de clientes (POST /api/v1/mcp). La tabla de
// herramientas sale de lib/mcp/customer/tools.ts: no se desfasa del código.
export default function McpDocsPage() {
  const url = appUrl("/api/v1/mcp");
  const claudeCodeOAuth = `claude mcp add --transport http colibly ${url}`;
  const cursorOAuth = `{
  "mcpServers": {
    "colibly": { "url": "${url}" }
  }
}`;
  const claudeCode = `claude mcp add --transport http colibly ${url} \\
  --header "Authorization: Bearer $COLIBLY_API_KEY"`;
  const jsonConfig = `{
  "mcpServers": {
    "colibly": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer sk_live_…" }
    }
  }
}`;

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 sm:py-10 md:px-6 lg:py-14 [&_code]:font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] ${DOCS_STYLES}`}>
      <CodeCopy />
      <article className="min-w-0 overflow-x-clip text-[15px] leading-relaxed text-foreground">
        <p className="text-sm text-muted">
          <a href="/docs/api" className={LINK}>API</a> · MCP
        </p>
        <h1 className="mt-2 text-pretty font-display text-3xl font-semibold tracking-tight">Conecta tu asistente de IA con {BRAND_NAME}</h1>
        <p className="mt-4 max-w-3xl text-muted">
          {BRAND_NAME} tiene un servidor <strong className="text-foreground">MCP</strong> (Model Context Protocol). Con él, Claude, ChatGPT, Cursor
          u otro asistente compatible puede leer tus conversaciones y contactos, decirte a quién contestar, redactar y enviar respuestas, y
          organizar tus contactos, solo con los permisos que tú le des.
        </p>

        <Section id="conectar" title="Conectar con inicio de sesión">
          <p>
            La forma más simple. Necesitas ser admin con licencia Pro. Agrega {BRAND_NAME} como conector personalizado en tu asistente con esta
            URL; te llevará a {BRAND_NAME} para iniciar sesión y elegir qué permites:
          </p>
          <ParamTable head={["Dato", "Valor"]} rows={[["URL del servidor", <code key="u" className="break-all text-sm">{url}</code>], ["Autenticación", "OAuth (inicio de sesión), sin configurar nada más"]]} />
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Claude (web y escritorio):</strong> en Conectores, agrega un conector personalizado y pega la URL.</li>
            <li><strong>ChatGPT:</strong> en los conectores personalizados (modo de desarrollador), crea uno con la URL y autenticación OAuth.</li>
            <li><strong>Claude Code:</strong> agrégalo y luego usa <code className="text-sm">/mcp</code> para iniciar sesión.</li>
          </ul>
          <Code>{claudeCodeOAuth}</Code>
          <p className="font-medium">Cursor y clientes con archivo de configuración</p>
          <Code>{cursorOAuth}</Code>
          <p>
            Al conectar eliges los permisos (consultar, organizar, enviar) y, si quieres, el <strong>modo de prueba</strong>: el asistente lee tus
            datos reales pero los envíos se simulan. Cada conexión aparece en Configuración → API → API keys; desde ahí la desconectas al
            instante. Reconectar la misma app reemplaza la conexión anterior, y una conexión que no se usa en 30 días se cierra sola.
          </p>
        </Section>

        <Section id="api-key" title="Conectar con API key">
          <p>
            Para servidores, scripts o clientes sin inicio de sesión. Crea una API key en Configuración → API con solo los permisos que el
            asistente necesita y mándala en el header:
          </p>
          <ParamTable head={["Dato", "Valor"]} rows={[["Transporte", "Streamable HTTP (sin sesión)"], ["Autenticación", <code key="a" className="text-sm">Authorization: Bearer sk_live_…</code>]]} />
          <p className="font-medium">Claude Code</p>
          <Code>{claudeCode}</Code>
          <p className="font-medium">Cursor y clientes que aceptan URL con headers</p>
          <Code>{jsonConfig}</Code>
        </Section>

        <Section id="herramientas" title="Herramientas">
          <p>El asistente solo ve las herramientas que permiten los permisos de la key. Las marcadas con «envía» mandan mensajes reales a tus clientes: el asistente debe mostrarte el texto y esperar tu confirmación.</p>
          <ParamTable
            head={["Herramienta", "Qué hace", "Permiso"]}
            rows={CUSTOMER_TOOLS.map((t) => [
              <code key="n" className="text-sm">{t.name}</code>,
              <span key="d"><strong>{t.title}{t.irreversible ? " · envía" : ""}.</strong> {t.description}</span>,
              t.scope ? <span key="s"><code className="text-sm">{t.scope}</code><br /><span className="text-xs text-muted">{API_SCOPES[t.scope]}</span></span> : "Ninguno",
            ])}
          />
        </Section>

        <Section id="ejemplos" title="Qué pedirle">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>«¿Quién está esperando respuesta? Resúmeme cada caso en una línea».</li>
            <li>«Contesta a Ana que su pedido sale mañana; muéstrame el texto antes de enviarlo».</li>
            <li>«Pasa a calificado a todos los contactos con la etiqueta Mayoreo que escribieron esta semana».</li>
            <li>«Asígname las conversaciones abiertas sin asignar del número de ventas».</li>
          </ul>
        </Section>

        <Section id="seguridad" title="Seguridad y límites">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Mismas reglas que la API: la conexión o la key solo ve las cuentas de su dueño (o las que le asignaste a la key), y una cuenta en solo lectura puede consultar pero no escribir.</li>
            <li>
              Cada llamada a una herramienta cuenta como una o dos solicitudes de la API (límite de {API_REQUESTS_PER_MINUTE} por minuto por conexión o key).
            </li>
            <li>Los envíos llevan clave de idempotencia automática: si el asistente repite la misma llamada en 10 minutos, el mensaje no sale dos veces.</li>
            <li>En modo de prueba (o con una key <code className="text-sm">sk_test_</code>) los envíos se simulan y no se cambian datos: úsalo para probar tu configuración.</li>
            <li>Los mensajes de tus clientes llegan al asistente marcados como datos de terceros. Aun así, revisa lo que el asistente quiere enviar antes de aprobarlo.</li>
            <li>Desconecta la conexión (o revoca la key) en Configuración → API para cortar el acceso al instante.</li>
          </ul>
          <p>
            Referencia completa de la API: <a href="/docs/api" className={LINK}>/docs/api</a>.
          </p>
        </Section>
      </article>
    </div>
  );
}
