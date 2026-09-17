import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listChannelChats } from "@/lib/channel-chats";
import { publicErrorMessage } from "@/lib/api-errors";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const result = await listChannelChats(session.user.id, "MESSENGER", searchParams);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
