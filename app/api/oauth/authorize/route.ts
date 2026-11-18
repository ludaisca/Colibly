import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { requestHost } from "@/lib/request-host";
import {
  MCP_OAUTH_SCOPES,
  connectBlockReason,
  createMcpAuthorizationCode,
  customerOAuthIssuer,
  redirectableError,
  validateAuthorizeRequest,
} from "@/lib/mcp/customer/oauth";
import type { ApiScope } from "@/lib/api/scopes";

export const dynamic = "force-dynamic";

// Decisión del consentimiento de /oauth/autorizar (formulario de la página).
// Vuelve al cliente con ?code= (o ?error=) por su redirect_uri registrada.

function back(redirectUri: string, params: Record<string, string | null>): NextResponse {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== null) target.searchParams.set(key, value);
  // 303: el navegador sigue con GET (venimos de un POST).
  return NextResponse.redirect(target.toString(), 303);
}

function sameSite(req: Request): boolean {
  // CSRF: el formulario solo se acepta desde nuestra propia página.
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === requestHost(req.headers, new URL(req.url).host) || origin === new URL(appUrl("/")).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return new NextResponse("Origen no permitido", { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return new NextResponse("Solicitud inválida", { status: 400 });
  const get = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : null;
  };

  let request;
  try {
    request = await validateAuthorizeRequest({ get });
  } catch (error) {
    const redirectable = redirectableError(error);
    if (redirectable) return back(redirectable.redirectUri, { error: redirectable.code, error_description: redirectable.message, state: redirectable.state });
    return new NextResponse(`Solicitud OAuth inválida: ${(error as Error).message}`, { status: 400 });
  }
  const iss = customerOAuthIssuer();

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(appUrl("/login"), 303);

  if (get("decision") !== "approve") return back(request.redirectUri, { error: "access_denied", state: request.state, iss });

  const blocked = await connectBlockReason(session.user.id);
  if (blocked) return back(request.redirectUri, { error: "access_denied", error_description: blocked, state: request.state, iss });

  const chosen = form.getAll("grant").filter((v): v is string => typeof v === "string");
  const scopes = MCP_OAUTH_SCOPES.filter((scope) => chosen.includes(scope)) as ApiScope[];
  const code = await createMcpAuthorizationCode({ request, userId: session.user.id, scopes, test: get("test") === "1" });
  return back(request.redirectUri, { code, state: request.state, iss });
}
