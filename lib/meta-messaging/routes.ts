import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { instagramAccountSchema, messengerAccountSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { createMetaChannelAccount, deleteMetaChannelAccount } from "@/lib/meta-messaging/account-crud";
import { publicErrorMessage } from "@/lib/api-errors";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { checkPlanLimit } from "@/lib/billing/gates";
import { requireOrgId } from "@/lib/tenancy";
import { assertChannelEnabled } from "@/lib/channel-flags";
import { forbidRoles } from "@/lib/roles";
import { listChannelChats } from "@/lib/channel-chats";
import { jsonWithEtag } from "@/lib/http/etag";
import { uploadChannelMedia, resolveChannelMedia } from "@/lib/channel-media";

// Rutas de Messenger e Instagram (/api/messenger/* y /api/instagram/*): las
// dos API eran copias que solo cambiaban el canal, así que cada route.ts
// exporta lo que generan estas funciones con su canal. Lo que cambia entre
// los dos vive en META_CHANNEL (esquema de alta, clave del límite del plan).

export type MetaChannel = "MESSENGER" | "INSTAGRAM";

const META_CHANNEL = {
  MESSENGER: { schema: messengerAccountSchema, planKey: "messenger", slug: "messenger" },
  INSTAGRAM: { schema: instagramAccountSchema, planKey: "instagram", slug: "instagram" },
} as const;

function serverError(error: unknown, fallback = "Error interno del servidor") {
  return NextResponse.json({ error: publicErrorMessage(error, fallback) }, { status: 500 });
}

const unauthorized = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });

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

  async function GET() {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();
      const accounts = await prisma.channelAccount.findMany({
        // Propias + compartidas: editar/eliminar sigue siendo solo del dueño.
        where: { channel, id: { in: await getUserChannelAccountIds(session.user.id) } },
        select: {
          id: true,
          userId: true,
          owner: { select: { id: true, name: true, email: true, license: true, disabledAt: true } },
          name: true,
          channel: true,
          status: true,
          errorMessage: true,
          lastActivity: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { conversations: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json(accounts);
    } catch (error) {
      return serverError(error);
    }
  }

  return { GET, POST };
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

/** /api/<canal>/chats: lista paginada de conversaciones (lib/channel-chats.ts). */
export function metaChatsRoutes(channel: MetaChannel) {
  async function GET(req: Request) {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();
      const result = await listChannelChats(session.user.id, channel, new URL(req.url).searchParams);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return jsonWithEtag(req, result.data);
    } catch (error) {
      return serverError(error);
    }
  }
  return { GET };
}

/** /api/<canal>/media: subida de un archivo saliente (uploadChannelMedia valida la cuenta). */
export function metaMediaUploadRoutes(channel: MetaChannel) {
  const { slug } = META_CHANNEL[channel];
  async function POST(req: Request) {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();

      const rl = await rateLimit(`${slug}-media-upload:${session.user.id}`, 20, 60);
      if (!rl.allowed) return NextResponse.json({ error: "Demasiadas subidas, intenta más tarde" }, { status: 429 });

      const form = await req.formData();
      const file = form.get("file");
      const accountId = form.get("accountId");
      if (!(file instanceof File) || typeof accountId !== "string") {
        return NextResponse.json({ error: "Faltan parámetros (file, accountId)" }, { status: 400 });
      }
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "El archivo supera el límite de 20MB" }, { status: 413 });
      }

      const result = await uploadChannelMedia(session.user.id, accountId, file);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result.data);
    } catch (error) {
      return serverError(error, "Error interno");
    }
  }
  return { POST };
}

/** /api/<canal>/messages/[messageId]/media: proxy autenticado del archivo (resolveChannelMedia valida el acceso). */
export async function metaMessageMediaGET(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const { messageId } = await params;
    const result = await resolveChannelMedia(session.user.id, messageId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return new Response(result.stream as unknown as ReadableStream, { headers: result.headers });
  } catch (error) {
    return serverError(error, "Error interno");
  }
}
