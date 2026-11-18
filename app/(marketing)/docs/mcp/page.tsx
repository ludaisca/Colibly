import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { API_SCOPES } from "@/lib/api/scopes";
import { API_REQUESTS_PER_MINUTE } from "@/lib/api/constants";
import { CUSTOMER_TOOLS } from "@/lib/mcp/customer/tools";
import { Code, DOCS_STYLES, ParamTable, Section } from "../api/_ui";
import { CodeCopy } from "../api/_copy-button";

const DESCRIPTION = `Conecta Claude, Cursor u otro asistente de IA con ${BRAND_NAME} por MCP: consulta conversaciones y contactos, contesta a quien espera y mueve tratos del embudo con tu API key.`;

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
  const bridge = `{
  "mcpServers": {
    "colibly": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}", "--header", "Authorization:\${COLIBLY_AUTH}"],
      "env": { "COLIBLY_AUTH": "Bearer sk_live_…" }
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
          {BRAND_NAME} tiene un servidor <strong className="text-foreground">MCP</strong> (Model Context Protocol). Con él, Claude, Cursor u otro
          asistente compatible puede leer tus conversaciones y contactos, decirte a quién contestar, redactar y enviar respuestas, y mover tratos
          del embudo, con los mismos permisos de tu API key.
        </p>

        <Section id="conectar" title="Conectar">
          <p>Necesitas una API key de un admin con licencia Pro. Créala en Configuración → API y elige solo los permisos que el asistente necesita.</p>
          <ParamTable head={["Dato", "Valor"]} rows={[["URL del servidor", <code key="u" className="break-all text-sm">{url}</code>], ["Transporte", "Streamable HTTP (sin sesión)"], ["Autenticación", <code key="a" className="text-sm">Authorization: Bearer sk_live_…</code>]]} />
          <p className="font-medium">Claude Code</p>
          <Code>{claudeCode}</Code>
          <p className="font-medium">Cursor y clientes que aceptan URL con headers</p>
          <Code>{jsonConfig}</Code>
          <p className="font-medium">Claude Desktop y clientes que solo ejecutan comandos</p>
          <p>Usa el puente <code className="text-sm">mcp-remote</code> (necesita Node.js 18 o superior):</p>
          <Code>{bridge}</Code>
          <p className="text-sm text-muted">Claude.ai y ChatGPT conectan servidores remotos con inicio de sesión (OAuth). Esa forma de conectar viene después; mientras tanto usa alguno de los clientes de arriba.</p>
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
            <li>Mismas reglas que la API: la key solo ve las cuentas de su dueño (o las que le asignaste), y una cuenta en solo lectura puede consultar pero no escribir.</li>
            <li>
              Cada llamada a una herramienta cuenta como una o dos solicitudes de la API (límite de {API_REQUESTS_PER_MINUTE} por minuto por key).
            </li>
            <li>Los envíos llevan clave de idempotencia automática: si el asistente repite la misma llamada en 10 minutos, el mensaje no sale dos veces.</li>
            <li>Con una key de prueba (<code className="text-sm">sk_test_</code>) los envíos se simulan y no se cambian datos: úsala para probar tu configuración.</li>
            <li>Los mensajes de tus clientes llegan al asistente marcados como datos de terceros. Aun así, revisa lo que el asistente quiere enviar antes de aprobarlo.</li>
            <li>Revoca la key en Configuración → API para cortar el acceso al instante.</li>
          </ul>
          <p>
            Referencia completa de la API: <a href="/docs/api" className={LINK}>/docs/api</a>.
          </p>
        </Section>
      </article>
    </div>
  );
}
