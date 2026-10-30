import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import {
  createAuthorizationCode,
  getOAuthClient,
  mcpResource,
  oauthIssuer,
  validateScopes,
} from "@/lib/platform/oauth";
import { PLATFORM_SCOPE_LABELS, type PlatformScope } from "@/lib/platform/scopes";

export const dynamic = "force-dynamic";

type Params = { get(name: string): string | null };

interface AuthorizeInput {
  clientId: string;
  clientName: string;
  redirectUri: string;
  scopes: PlatformScope[];
  codeChallenge: string;
  resource: string;
  state: string | null;
}

async function validate(input: Params): Promise<AuthorizeInput> {
  if (input.get("response_type") !== "code") throw new Error("response_type debe ser code");
  const clientId = input.get("client_id");
  if (!clientId) throw new Error("Falta client_id");
  const client = await getOAuthClient(clientId);
  if (!client) throw new Error("Cliente no registrado");

  const redirectUri = input.get("redirect_uri");
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) throw new Error("redirect_uri no autorizada");

  const codeChallenge = input.get("code_challenge");
  if (!codeChallenge || codeChallenge.length < 43 || codeChallenge.length > 128) {
    throw new Error("code_challenge inválido (PKCE S256 obligatorio)");
  }
  if (input.get("code_challenge_method") !== "S256") throw new Error("code_challenge_method debe ser S256");

  const scopeRaw = input.get("scope") ?? "platform:read";
  const scopes = validateScopes(scopeRaw.split(/\s+/).filter(Boolean));
  if (scopes.length === 0) scopes.push("platform:read");

  const resource = input.get("resource") ?? mcpResource();
  if (resource !== mcpResource()) throw new Error("resource no válido");

  return {
    clientId,
    clientName: client.clientName,
    redirectUri,
    scopes,
    codeChallenge,
    resource,
    state: input.get("state"),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function consentPage(input: AuthorizeInput, email: string): string {
  const scopes = input.scopes.map((scope) => `<li><strong>${escapeHtml(scope)}</strong> — ${escapeHtml(PLATFORM_SCOPE_LABELS[scope])}</li>`).join("");
  const hidden = [
    ["response_type", "code"],
    ["client_id", input.clientId],
    ["redirect_uri", input.redirectUri],
    ["code_challenge", input.codeChallenge],
    ["code_challenge_method", "S256"],
    ["scope", input.scopes.join(" ")],
    ["resource", input.resource],
    ...(input.state ? ([["state", input.state]] as Array<[string, string]>) : []),
  ]
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("\n");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar Colibly MCP</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background:#f1f5f9; color:#0f172a; }
  main { max-width: 520px; margin: 8vh auto; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 10px 30px rgba(15,23,42,.08); }
  h1 { font-size: 22px; margin:0 0 8px; }
  p { line-height:1.5; color:#334155; }
  ul { padding-left:20px; color:#334155; }
  .client { display:inline-block; background:#ecfeff; color:#0e7490; border:1px solid #a5f3fc; border-radius:999px; padding:2px 10px; font-weight:600; }
  .actions { display:flex; gap:12px; margin-top:24px; }
  button { flex:1; border-radius:10px; padding:12px 16px; font-size:15px; font-weight:600; cursor:pointer; border:1px solid transparent; }
  .approve { background:#0e7490; color:#fff; }
  .deny { background:#fff; color:#334155; border-color:#cbd5e1; }
  small { color:#64748b; }
</style></head>
<body><main>
  <h1>Autorizar acceso a Colibly</h1>
  <p><span class="client">${escapeHtml(input.clientName)}</span> quiere conectarse como operador de la plataforma.</p>
  <p>Autorizarás estos permisos:</p>
  <ul>${scopes}</ul>
  <p><small>Sesión: ${escapeHtml(email)} · Destino: ${escapeHtml(input.redirectUri)}</small></p>
  <form method="post">
    ${hidden}
    <div class="actions">
      <button class="deny" name="decision" value="deny" type="submit">Cancelar</button>
      <button class="approve" name="decision" value="approve" type="submit">Autorizar</button>
    </div>
  </form>
</main></body></html>`;
}

function redirectWith(redirectUri: string, params: Record<string, string | null>): NextResponse {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target.toString());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  let input: AuthorizeInput;
  try {
    input = await validate(url.searchParams);
  } catch (error) {
    return new NextResponse(`Solicitud OAuth inválida: ${(error as Error).message}`, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.email) {
    const login = new URL("/login", oauthIssuer() || url.origin);
    login.searchParams.set("callbackUrl", url.toString());
    return NextResponse.redirect(login.toString());
  }
  if (!isPlatformAdminEmail(session.user.email)) {
    return new NextResponse("Esta cuenta no es operadora de la plataforma.", { status: 403 });
  }

  return new NextResponse(consentPage(input, session.user.email), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const expectedOrigin = new URL(oauthIssuer() || req.url).origin;
  if (origin && origin !== expectedOrigin) {
    return new NextResponse("Origen no permitido", { status: 403 });
  }

  const form = await req.formData();
  let input: AuthorizeInput;
  try {
    input = await validate({ get: (name) => (typeof form.get(name) === "string" ? (form.get(name) as string) : null) });
  } catch (error) {
    return new NextResponse(`Solicitud OAuth inválida: ${(error as Error).message}`, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", expectedOrigin).toString());
  }
  if (!isPlatformAdminEmail(session.user.email)) {
    return new NextResponse("Esta cuenta no es operadora de la plataforma.", { status: 403 });
  }

  if (form.get("decision") !== "approve") {
    return redirectWith(input.redirectUri, { error: "access_denied", state: input.state });
  }

  const code = await createAuthorizationCode({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scopes: input.scopes,
    operatorEmail: session.user.email,
    codeChallenge: input.codeChallenge,
    resource: input.resource,
  });

  return redirectWith(input.redirectUri, { code, state: input.state });
}
