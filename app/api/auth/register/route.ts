import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

    const { allowed } = await rateLimit(`register:${ip}`, 5, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta de nuevo en un minuto." },
        { status: 429 }
      );
    }
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    // El check de registro deshabilitado va ANTES que el de email existente —
    // al revés, el endpoint confirmaba qué emails existen (enumeración) incluso
    // con el registro cerrado.
    const config = await prisma.systemConfig.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });

    if (!config.allowRegistration) {
      return NextResponse.json(
        { error: "El registro de usuarios está deshabilitado." },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Este email ya está registrado." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Serializable: con el aislamiento por defecto (READ COMMITTED) dos
    // registros simultáneos en una base vacía leían ambos count() = 0 y los dos
    // quedaban como admin. Postgres aborta uno con P2034 (conflicto de
    // serialización) y se le pide reintentar.
    await prisma.$transaction(
      async (tx) => {
        const userCount = await tx.user.count();
        const role = userCount === 0 ? "admin" : "user";

        return tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Hubo un conflicto al registrar, intenta de nuevo." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Este email ya está registrado." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
