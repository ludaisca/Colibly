import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveChannelMedia } from "@/lib/channel-media";
import { publicErrorMessage } from "@/lib/api-errors";

// Misma lógica que Messenger/Instagram: el helper genérico resuelve permisos,
// MIME, inline/descarga (PDF incluido) y el stream de disco.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { messageId } = await params;
    const result = await resolveChannelMedia(session.user.id, messageId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new Response(result.stream as unknown as ReadableStream, { headers: result.headers });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
