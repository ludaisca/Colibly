import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { uploadChannelMedia } from "@/lib/channel-media";
import { publicErrorMessage } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const rl = await rateLimit(`messenger-media-upload:${session.user.id}`, 20, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas subidas, intenta más tarde" }, { status: 429 });
    }

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
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
