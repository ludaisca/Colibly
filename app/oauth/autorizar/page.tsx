import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BRAND_NAME } from "@/lib/brand";
import { Card } from "@/app/components/ui/card";
import { BrandMark } from "@/app/components/ui/logo";
import { API_SCOPES } from "@/lib/api/scopes";
import {
  MCP_OAUTH_SCOPES,
  MCP_OAUTH_SENDING_SCOPES,
  connectBlockReason,
  customerOAuthIssuer,
  redirectableError,
  validateAuthorizeRequest,
  type AuthorizeRequest,
} from "@/lib/mcp/customer/oauth";
import { ConsentForm } from "./_consent-form";

export const metadata: Metadata = { title: "Conectar asistente", robots: { index: false, follow: false } };

// Consentimiento del OAuth del MCP de clientes (authorization_endpoint). Fuera
// de PROTECTED a propósito: el login de proxy.ts perdería la query OAuth, así
// que la página pide la sesión ella misma y decide quién puede conectar (admin
// con licencia Pro, como una API key). La decisión va a POST /api/oauth/authorize.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7" />
          <span className="text-sm font-medium text-muted-darker">{BRAND_NAME}</span>
        </div>
        {children}
      </Card>
    </main>
  );
}

function backUrl(redirectUri: string, params: Record<string, string | null>): string {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== null) target.searchParams.set(key, value);
  return target.toString();
}

function hostOf(uri: string): string {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.host : `${url.protocol}//`;
  } catch {
    return uri;
  }
}

export default async function AutorizarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") query.set(key, value);

  let request: AuthorizeRequest;
  try {
    request = await validateAuthorizeRequest(query);
  } catch (error) {
    const redirectable = redirectableError(error);
    if (redirectable) {
      redirect(backUrl(redirectable.redirectUri, { error: redirectable.code, error_description: redirectable.message, state: redirectable.state, iss: customerOAuthIssuer() }));
    }
    return (
      <Shell>
        <h1 className="mt-4 text-page-title text-foreground">No se puede conectar</h1>
        <p className="mt-2 text-sm text-muted">{(error as Error).message}</p>
      </Shell>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/autorizar?${query.toString()}`)}`);
  }

  const denyUrl = backUrl(request.redirectUri, { error: "access_denied", state: request.state, iss: customerOAuthIssuer() });
  const blocked = await connectBlockReason(session.user.id);
  if (blocked) {
    return (
      <Shell>
        <h1 className="mt-4 text-page-title text-foreground">No puedes conectar este asistente</h1>
        <p className="mt-2 text-sm text-muted">{blocked}</p>
        <p className="mt-6 border-t border-border pt-4 text-sm">
          <a href={denyUrl} className="font-medium text-accent-ink underline underline-offset-2">Volver a {request.clientName}</a>
        </p>
      </Shell>
    );
  }

  const org = session.user.organizationId
    ? await prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { name: true } })
    : null;
  const hidden: Record<string, string> = {
    response_type: "code",
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    resource: request.resource,
    ...(query.get("scope") ? { scope: query.get("scope")! } : {}),
    ...(request.state !== null ? { state: request.state } : {}),
  };

  return (
    <Shell>
      <h1 className="mt-4 text-page-title text-foreground">Conectar {request.clientName}</h1>
      <p className="mt-1 text-sm text-muted">
        {request.clientName} quiere usar {BRAND_NAME}{org ? ` de ${org.name}` : ""} con tu cuenta ({session.user.email}). Podrá hacer lo que permitas aquí,
        en todas las cuentas de canal a las que tienes acceso.
      </p>
      <ConsentForm
        hidden={hidden}
        scopes={MCP_OAUTH_SCOPES.map((scope) => ({ id: scope, label: API_SCOPES[scope], sends: MCP_OAUTH_SENDING_SCOPES.includes(scope), checked: request.scopes.includes(scope) }))}
        clientName={request.clientName}
      />
      <p className="mt-4 text-xs text-muted">
        Después de conectar volverás a <span className="font-medium text-foreground">{hostOf(request.redirectUri)}</span>. Conecta solo si tú iniciaste la conexión desde
        tu asistente. Puedes desconectarlo cuando quieras en Configuración → API.
      </p>
    </Shell>
  );
}
