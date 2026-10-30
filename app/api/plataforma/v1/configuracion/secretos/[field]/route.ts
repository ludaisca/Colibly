import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { isPlatformSecretField, setPlatformSecret } from "@/lib/platform/ops";
import { tokenActor, opsResponse } from "@/lib/platform/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  value: z.string().min(1).max(500),
  confirm: z.string().min(1),
});

export async function PUT(req: Request, { params }: { params: Promise<{ field: string }> }) {
  const ctx = await requirePlatformToken(req, "secret:write");
  if (ctx instanceof NextResponse) return ctx;

  const { allowed } = await rateLimit(`platform-secret:${ctx.tokenId}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: { code: "rate_limited", message: "Máximo 5 secretos por hora" } }, { status: 429 });

  const { field } = await params;
  if (!isPlatformSecretField(field)) {
    return NextResponse.json({ error: { code: "invalid_request", message: "Campo de secreto no válido" } }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: parsed.error.issues[0].message } }, { status: 400 });
  }
  if (parsed.data.confirm !== field) {
    return NextResponse.json({ error: { code: "invalid_request", message: `Escribe confirm: "${field}"` } }, { status: 400 });
  }

  return opsResponse(await setPlatformSecret({ field, value: parsed.data.value, actor: tokenActor(ctx) }));
}
