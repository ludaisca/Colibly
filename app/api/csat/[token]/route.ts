import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

// Público: el token es el secreto. No hay sesión ni organización en el request.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await rateLimit(`csat:${ip}`, 20, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

    const survey = await prisma.csatResponse.findUnique({
      where: { token },
      select: { id: true, respondedAt: true },
    });
    if (!survey) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
    if (survey.respondedAt) return NextResponse.json({ error: "Esta encuesta ya fue respondida" }, { status: 409 });

    const body = await req.json().catch(() => null);
    const rating = Number(body?.rating);
    const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 1000) : null;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Selecciona una calificación de 1 a 5" }, { status: 400 });
    }

    // Condicional sobre respondedAt: dos envíos simultáneos pasan la lectura
    // de arriba, pero solo el primero escribe; el segundo recibe 409.
    const { count } = await prisma.csatResponse.updateMany({
      where: { id: survey.id, respondedAt: null },
      data: { rating, comment: comment || null, respondedAt: new Date() },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Esta encuesta ya fue respondida" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
