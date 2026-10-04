import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, withApiErrors } from "@/lib/api/respond";

// Identidad de la key: útil para que una integración verifique su conexión.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req);
  const key = await prisma.apiKey.findUniqueOrThrow({
    where: { id: ctx.keyId },
    select: { name: true, prefix: true, scopes: true, expiresAt: true, user: { select: { id: true, name: true, email: true } } },
  });
  return apiOk({
    key: { name: key.name, prefix: key.prefix, scopes: key.scopes, expiresAt: key.expiresAt },
    owner: key.user,
    accountIds: ctx.accountIds,
    channelAccountIds: ctx.channelAccountIds,
  });
});
