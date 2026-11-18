import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { instagramAccountSchema, messengerAccountSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { createMetaChannelAccount, deleteMetaChannelAccount } from "@/lib/meta-messaging/account-crud";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { checkPlanLimit } from "@/lib/billing/gates";
import { requireOrgId } from "@/lib/tenancy";
import { assertChannelEnabled } from "@/lib/channel-flags";
import { forbidRoles } from "@/lib/roles";
import { channelAccountsGET, serverError, unauthorized } from "@/lib/channels/routes";

// Alta y baja de cuentas de Messenger e Instagram (/api/messenger/* y
// /api/instagram/*). Lo que comparten con los demás canales genéricos (lista
// de cuentas, chats, subida y proxy de archivos) sale de lib/channels/routes.ts.
// Lo que cambia entre los dos vive en META_CHANNEL (esquema, límite del plan).

export type MetaChannel = "MESSENGER" | "INSTAGRAM";

const META_CHANNEL = {
  MESSENGER: { schema: messengerAccountSchema, planKey: "messenger" },
  INSTAGRAM: { schema: instagramAccountSchema, planKey: "instagram" },
} as const;

/** /api/<canal>/accounts: POST crea (no "ejecutivo"), GET lista propias + compartidas (todos los roles: el rail de cuentas del inbox). */
export function metaAccountsRoutes(channel: MetaChannel) {
  const { schema, planKey } = META_CHANNEL[channel];

  async function POST(req: Request) {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();
      // "ejecutivo" tiene /<canal>/cuentas bloqueado en proxy.ts; este 403 cierra la API directa.
      const forbidden = forbidRoles(session, ["ejecutivo"]);
      if (forbidden) return forbidden;

      const unverified = await requireVerifiedEmail(session.user.id);
      if (unverified) return unverified;
      const organizationId = await requireOrgId(session.user.id);
      const channelDisabled = await assertChannelEnabled(organizationId, channel);
      if (channelDisabled) return channelDisabled;
      const overLimit = await checkPlanLimit(organizationId, planKey);
      if (overLimit) return overLimit;

      const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
      if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

      const parsed = schema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

      const { account, verifyToken } = await createMetaChannelAccount({ userId: session.user.id, channel, ...parsed.data });
      // verifyToken solo se guarda hasheado: esta es la única respuesta donde
      // el llamador lo ve en claro, para copiarlo al webhook de Meta.
      return NextResponse.json({ ...account, verifyToken }, { status: 201 });
    } catch (error) {
      return serverError(error);
    }
  }

  return { GET: channelAccountsGET(channel), POST };
}

/** /api/<canal>/accounts/[id]: DELETE (no "ejecutivo"; deleteMetaChannelAccount valida quién puede). */
export function metaAccountRoutes(channel: MetaChannel) {
  async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();
      const forbidden = forbidRoles(session, ["ejecutivo"]);
      if (forbidden) return forbidden;

      const { allowed } = await rateLimit(`channel-account-mutate:${session.user.id}`, 20, 60);
      if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

      const { id } = await params;
      const deleted = await deleteMetaChannelAccount(id, session.user.id, channel);
      if (!deleted) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch (error) {
      return serverError(error);
    }
  }
  return { DELETE };
}
