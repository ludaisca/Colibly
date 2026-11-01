import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";
import { MacroBlockedError, MacroNotFoundError, REQUIRED_FIELDS_CODE, runMacro } from "@/lib/macros/execute";
import { OutboundError } from "@/lib/messaging/outbound";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { allowed } = await rateLimit(`macro-run:${session.user.id}`, 60, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas ejecuciones" }, { status: 429 });

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const chatId = typeof body?.chatId === "string" ? body.chatId : "";
    if (!chatId) return NextResponse.json({ error: "Falta el chat" }, { status: 400 });

    const organizationId = await requireOrgId(session.user.id);
    const macro = await prisma.macro.findFirst({
      where: { id, organizationId },
      select: { id: true, organizationId: true, actions: true },
    });
    if (!macro) return NextResponse.json({ error: "Macro no encontrada" }, { status: 404 });

    const applied = await runMacro(macro, chatId, session.user.id);
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    if (error instanceof MacroBlockedError) {
      return NextResponse.json({ error: error.message, code: REQUIRED_FIELDS_CODE, fields: error.fields }, { status: 422 });
    }
    if (error instanceof MacroNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof OutboundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "window_closed" ? 409 : 400 }
      );
    }
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
