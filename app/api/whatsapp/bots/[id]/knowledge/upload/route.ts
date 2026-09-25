import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ragQueue } from "@/lib/queue";
import { getPlatformApiKey } from "@/lib/ai/platform";
import type { AIProvider } from "@/lib/ai/types";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("utf-8");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    const bot = await prisma.wABot.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
    });

    if (!bot) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Documento";
    const botIdsRaw = formData.get("botIds") as string;
    const botIds = botIdsRaw ? botIdsRaw.split(",").filter(Boolean) : [id];

    if (!file) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 10MB)" }, { status: 400 });
    }

    const allowedTypes = [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "text/x-markdown",
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".md") && !file.name.endsWith(".json")) {
      return NextResponse.json({ error: "Formato no soportado (.txt, .md, .csv, .json)" }, { status: 400 });
    }

    const provider = bot.provider as AIProvider;

    const apiKey = getPlatformApiKey(provider);
    if (!apiKey) {
      return NextResponse.json(
        { error: "No hay API key configurada para el proveedor de este bot" },
        { status: 400 }
      );
    }

    const text = await extractText(file);

    if (!text?.trim()) {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    }

    const resolvedBotIds = await Promise.all(
      botIds.map(async (bid) => {
        const b = await prisma.wABot.findFirst({
          where: { id: bid, ...(await orgWhere(session.user.id)) },
        });
        return b ? b.id : null;
      })
    ).then((ids) => ids.filter(Boolean) as string[]);

    if (resolvedBotIds.length === 0) {
      return NextResponse.json({ error: "Ningún bot válido seleccionado" }, { status: 400 });
    }

    await ragQueue.add("index", {
      title,
      content: text,
      botIds: resolvedBotIds,
      provider,
      userId: session.user.id,
      sourceName: file.name,
    });

    return NextResponse.json({
      success: true,
      message: "Documento encolado para indexación",
    }, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
