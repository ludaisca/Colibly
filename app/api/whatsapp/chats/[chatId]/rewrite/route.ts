import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { requireOrgId } from "@/lib/tenancy";
import { hasAiAccess } from "@/lib/billing/gates";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { rewriteDraft, WritingAssistError } from "@/lib/ai/writing-assist";

const bodySchema = z.object({
  draft: z.string().trim().min(1, "Escribe un borrador primero").max(2000, "El borrador es demasiado largo"),
});

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { allowed } = await rateLimit(`ai-rewrite:${session.user.id}`, 20, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes de IA, espera un momento" }, { status: 429 });

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });

    const organizationId = await requireOrgId(session.user.id);
    if (!(await hasAiAccess(organizationId))) {
      return NextResponse.json({ error: "La IA no está incluida en tu plan.", code: "plan_limit", limit: "ai" }, { status: 402 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    try {
      const text = await rewriteDraft(organizationId, parsed.data.draft, session.user.id);
      return NextResponse.json({ text });
    } catch (err) {
      if (err instanceof WritingAssistError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
