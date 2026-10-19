import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publicErrorMessage } from "@/lib/api-errors";
import { sendTemplateToChat } from "@/lib/whatsapp/chat-template-send";

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const body = await req.json().catch(() => null);
    const result = await sendTemplateToChat(chatId, session.user.id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
